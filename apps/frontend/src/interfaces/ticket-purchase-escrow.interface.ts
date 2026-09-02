/**
 * Ticket Purchase Escrow Interfaces
 * Types for ticket purchase escrow integration with Trustless Work
 */

export type EscrowType = 'single_release' | 'multi_release';

export interface TicketPurchaseData {
  id: string;
  listingId: string;
  eventId: string;
  totalAmount: number;
  currency: string;
  /** Number of ticket units this purchase covers (must be <= listing's available ticketQuantity) */
  quantity: number;
  transferDate: string;
  eventDate: string;
  guestEmail: string;
  guestName?: string;
  seatSection?: string;
  cancellationPolicy?: string;
  preferences?: {
    milestonePayments?: boolean;
  };
}

export interface EventData {
  id: string;
  name: string;
  walletAddress: string;
  rating?: number;
  location?: string;
  imageUrl?: string;
}

export interface TicketListingData {
  id: string;
  name: string;
  seatSection: string;
  listingPrice: number;
  ticketQuantity: number;
  /** Price for a single ticket unit */
  pricePerUnit: number;
  /** Whether a buyer may purchase fewer than ticketQuantity units */
  allowPartialPurchase: boolean;
  /** Optional flat price for buying the full bundle (ticketQuantity units) at a discount. Falls back to ticketQuantity * pricePerUnit when omitted. */
  bundlePrice?: number;
  amenities?: string[];
  imageUrl?: string;
}

export interface EscrowMilestone {
  description: string;
  amount: string;
  dueDate?: string;
  status?: 'pending' | 'completed' | 'disputed';
  metadata?: {
    type?: 'transfer_initiated' | 'transfer_completed' | 'custom';
    percentage?: number;
  };
}

export interface EscrowAsset {
  code: string;
  issuer?: string;
}

export interface EscrowRoles {
  approver: string;
  serviceProvider: string;
  platformAddress: string;
  releaseSigner: string;
  disputeResolver: string;
  receiver: string;
}

export interface EscrowMetadata {
  purchaseId: string;
  listingId: string;
  eventId: string;
  eventName: string;
  transferDate: string;
  eventDate: string;
  guestEmail: string;
  platform: string;
  version: string;
  seatSection?: string;
  cancellationPolicy?: string;
  milestones?: EscrowMilestone[];
}

export interface EscrowFormData {
  title: string;
  engagementId: string;
  description: string;
  amount: number | string;
  platformFee: number | string;
  roles: EscrowRoles;
  trustline: {
    address: string;
    decimals: number;
  };
  milestones: Array<{
    description: string;
    amount?: string;
  }>;
  receiverMemo?: string;
  metadata?: EscrowMetadata;
}

export interface EscrowResponse {
  contractId: string;
  unsignedXDR?: string;
  status: 'created' | 'pending' | 'active' | 'completed' | 'disputed' | 'cancelled';
  createdAt?: string;
  escrowAddress?: string;
}

export interface EscrowCreationFormProps {
  purchaseData: TicketPurchaseData;
  eventData: EventData;
  listingData?: TicketListingData;
  escrowType: EscrowType;
  selectedAsset?: string;
  onEscrowCreated: (escrowResponse: EscrowResponse) => void;
  onCancel: () => void;
  className?: string;
}

export interface TicketPurchaseEscrowWrapperProps {
  purchaseId: string;
  onComplete?: () => void;
}

export interface EscrowConfirmationProps {
  purchase: TicketPurchaseData;
  event: EventData;
  escrowData: EscrowResponse;
  onComplete: () => void;
  onViewDetails?: () => void;
}

export interface UseTicketPurchaseEscrowOptions {
  purchaseData: TicketPurchaseData;
  eventData: EventData;
  escrowType: EscrowType;
  selectedAsset?: string;
}

export interface UseTicketPurchaseEscrowReturn {
  escrowFormData: EscrowFormData;
  milestones: EscrowMilestone[];
  totalAmount: number;
  amountInStroops: string;
  isValid: boolean;
  validationErrors: string[];
  calculateMilestoneAmounts: (total: number) => EscrowMilestone[];
}

