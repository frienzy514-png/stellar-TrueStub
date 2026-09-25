/**
 * useTicketPurchaseEscrow Hook
 * Custom hook for managing ticket purchase escrow creation logic
 */

import { useMemo, useCallback } from 'react';
import { useWallet } from '@/components/auth/wallet/hooks/wallet.hook';
import {
  TicketPurchaseData,
  EventData,
  EscrowType,
  EscrowFormData,
  EscrowMilestone,
  UseTicketPurchaseEscrowOptions,
  UseTicketPurchaseEscrowReturn,
} from '@/interfaces/ticket-purchase-escrow.interface';
import { trustlineOptions, getSupportedAssetsForActiveNetwork } from '@/components/tw-blocks/wallet-kit/trustlines';

// Constants
const STROOPS_MULTIPLIER = 10000000; // 1 XLM = 10,000,000 stroops
const PLATFORM_NAME = 'TrueStub';
const VERSION = '1.0.0';

// Milestone split percentages
const MILESTONE_SPLITS = {
  transferInitiated: 0.7, // 70% once the ticket transfer is initiated
  transferCompleted: 0.3, // 30% once the transfer is confirmed
};

/**
 * Converts a regular amount to stroops (Stellar's smallest unit)
 */
const toStroops = (amount: number): string => {
  return Math.round(amount * STROOPS_MULTIPLIER).toString();
};

/**
 * Validates Stellar wallet address format
 */
const isValidStellarAddress = (address: string): boolean => {
  return /^G[A-Z0-9]{55}$/.test(address);
};

/**
 * Validates purchase data completeness
 */
const validatePurchaseData = (purchase: TicketPurchaseData): string[] => {
  const errors: string[] = [];

  if (!purchase.id) errors.push('Purchase ID is required');
  if (!purchase.eventId) errors.push('Event ID is required');
  if (!purchase.listingId) errors.push('Listing ID is required');
  if (!purchase.totalAmount || purchase.totalAmount <= 0) {
    errors.push('Valid purchase amount is required');
  }
  if (!purchase.transferDate) errors.push('Transfer date is required');
  if (!purchase.eventDate) errors.push('Event date is required');
  if (!purchase.guestEmail) errors.push('Guest email is required');

  // Validate dates
  const transferInitiated = new Date(purchase.transferDate);
  const transferCompleted = new Date(purchase.eventDate);
  if (transferCompleted <= transferInitiated) {
    errors.push('Event date must be after the transfer date');
  }

  return errors;
};

/**
 * Validates event data completeness
 */
const validateEventData = (event: EventData): string[] => {
  const errors: string[] = [];

  if (!event.id) errors.push('Event ID is required');
  if (!event.name) errors.push('Event name is required');
  if (!event.walletAddress) {
    errors.push('Event wallet address is required');
  } else if (!isValidStellarAddress(event.walletAddress)) {
    errors.push('Invalid event wallet address format');
  }

  return errors;
};

/**
 * Custom hook for ticket purchase escrow management
 */
export function useTicketPurchaseEscrow({
  purchaseData,
  eventData,
  escrowType,
  selectedAsset,
}: UseTicketPurchaseEscrowOptions): UseTicketPurchaseEscrowReturn {
  const { address: guestWallet } = useWallet();

  // Memoize validation errors
  const validationErrors = useMemo(() => {
    const errors: string[] = [];

    if (!guestWallet) {
      errors.push('Wallet not connected');
    } else if (!isValidStellarAddress(guestWallet)) {
      errors.push('Invalid guest wallet address');
    }

    errors.push(...validatePurchaseData(purchaseData));
    errors.push(...validateEventData(eventData));

    return errors;
  }, [purchaseData, eventData, guestWallet]);

  // Calculate milestone amounts based on escrow type
  const calculateMilestoneAmounts = useCallback(
    (total: number): EscrowMilestone[] => {
      if (escrowType === 'single_release') {
        return [
          {
            description: 'Ticket purchase payment - Released after the transfer is confirmed',
            amount: toStroops(total),
            dueDate: purchaseData.eventDate,
            status: 'pending',
            metadata: {
              type: 'transfer_completed',
              percentage: 100,
            },
          },
        ];
      }

      // Multi-release milestones
      return [
        {
          description: 'Transfer initiated milestone - Ticket sent and initial payment released',
          amount: toStroops(total * MILESTONE_SPLITS.transferInitiated),
          dueDate: purchaseData.transferDate,
          status: 'pending',
          metadata: {
            type: 'transfer_initiated',
            percentage: MILESTONE_SPLITS.transferInitiated * 100,
          },
        },
        {
          description: 'Transfer completed milestone - Buyer confirmed successful ticket transfer',
          amount: toStroops(total * MILESTONE_SPLITS.transferCompleted),
          dueDate: purchaseData.eventDate,
          status: 'pending',
          metadata: {
            type: 'transfer_completed',
            percentage: MILESTONE_SPLITS.transferCompleted * 100,
          },
        },
      ];
    },
    [escrowType, purchaseData.transferDate, purchaseData.eventDate]
  );

  // Generate milestones
  const milestones = useMemo(
    () => calculateMilestoneAmounts(purchaseData.totalAmount),
    [purchaseData.totalAmount, calculateMilestoneAmounts]
  );

  // Amount in stroops
  const amountInStroops = useMemo(
    () => toStroops(purchaseData.totalAmount),
    [purchaseData.totalAmount]
  );

  // Resolve dynamic asset trustline — uses network-aware asset list so the
  // correct mainnet or testnet addresses are resolved automatically.
  const activeTrustline = useMemo(() => {
    const networkAssets = getSupportedAssetsForActiveNetwork();
    const assetSymbol = (selectedAsset || purchaseData.currency || 'USDC').toUpperCase();
    const matched = networkAssets.find(
      (t) => t.symbol?.toUpperCase() === assetSymbol || t.label.toUpperCase() === assetSymbol
    ) || networkAssets.find((t) => t.label === 'USDC') || networkAssets[0];

    return {
      address: matched?.value || process.env.NEXT_PUBLIC_USDC_ISSUER || '',
      decimals: matched?.decimals || STROOPS_MULTIPLIER,
      symbol: matched?.symbol || assetSymbol,
    };
  }, [selectedAsset, purchaseData.currency]);

  // Build escrow form data
  const escrowFormData = useMemo((): EscrowFormData => {
    const platformWallet = process.env.NEXT_PUBLIC_PLATFORM_WALLET_ADDRESS || '';
    const disputeResolver = process.env.NEXT_PUBLIC_DISPUTE_RESOLVER_ADDRESS || platformWallet;

    return {
      title: `Ticket Purchase - ${eventData.name}`,
      engagementId: purchaseData.id,
      description: `Secure escrow payment for a ticket purchase for ${eventData.name}. Transfer date: ${new Date(purchaseData.transferDate).toLocaleDateString()}, Event date: ${new Date(purchaseData.eventDate).toLocaleDateString()}`,
      amount: purchaseData.totalAmount,
      platformFee: 2.5, // 2.5% platform fee
      roles: {
        approver: guestWallet || '', // Buyer approves the release
        serviceProvider: eventData.walletAddress, // Seller receives funds
        platformAddress: platformWallet, // TrueStub platform
        releaseSigner: platformWallet, // Platform controls release
        disputeResolver: disputeResolver, // Handles disputes
        receiver: eventData.walletAddress, // Seller receives payment
      },
      trustline: {
        address: activeTrustline.address,
        decimals: activeTrustline.decimals,
      },
      milestones: milestones.map((m) => ({
        description: m.description,
        amount: m.amount,
      })),
      receiverMemo: purchaseData.id.slice(0, 28), // Stellar memo limit
      metadata: {
        purchaseId: purchaseData.id,
        listingId: purchaseData.listingId,
        eventId: purchaseData.eventId,
        eventName: eventData.name,
        transferDate: purchaseData.transferDate,
        eventDate: purchaseData.eventDate,
        guestEmail: purchaseData.guestEmail,
        platform: PLATFORM_NAME,
        version: VERSION,
        seatSection: purchaseData.seatSection,
        cancellationPolicy: purchaseData.cancellationPolicy,
        milestones: milestones,
      },
    };
  }, [
    purchaseData,
    eventData,
    guestWallet,
    activeTrustline,
    milestones,
  ]);

  return {
    escrowFormData,
    milestones,
    totalAmount: purchaseData.totalAmount,
    amountInStroops,
    isValid: validationErrors.length === 0,
    validationErrors,
    calculateMilestoneAmounts,
  };
}


/**
 * Hook for validating escrow form data specific to ticket purchases
 */
export function useEscrowValidation() {
  const validateEscrowData = useCallback((data: Partial<EscrowFormData>): { 
    isValid: boolean; 
    errors: string[] 
  } => {
    const errors: string[] = [];

    if (!data.amount || Number(data.amount) <= 0) {
      errors.push('Amount must be greater than 0');
    }

    if (!data.roles?.approver) {
      errors.push('Approver address is required');
    }

    if (!data.roles?.serviceProvider) {
      errors.push('Service provider address is required');
    }

    if (!data.metadata?.purchaseId) {
      errors.push('Purchase ID is required in metadata');
    }

    if (!data.milestones || data.milestones.length === 0) {
      errors.push('At least one milestone is required');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }, []);

  return { validateEscrowData };
}

export default useTicketPurchaseEscrow;
