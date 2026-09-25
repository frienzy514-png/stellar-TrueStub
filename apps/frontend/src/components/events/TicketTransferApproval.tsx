"use client";

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApproveMilestone } from '@/components/tw-blocks/escrows/multi-release/approve-milestone/ApproveMilestone';
import { TicketTransferApprovalProps, TransferInitiationData, MilestoneApprovalData } from './types';
import { useGlobalAuthenticationStore } from '@/core/store/data';
import { useWalletContext } from '@/components/tw-blocks/wallet-kit/WalletProvider';
// import { updatePurchaseStatus, sendBuyerNotification } from '@/services/event.service';
// import { toast } from 'react-toastify';

export function TicketTransferApproval({ purchase, escrow, onSuccess, onError }: TicketTransferApprovalProps) {
  const { address } = useGlobalAuthenticationStore();
  const { walletAddress } = useWalletContext();
  const [transferData, setTransferData] = useState<TransferInitiationData>({
    seatNumber: '',
    transferInitiatedAt: new Date().toISOString(),
    wifiPassword: '',
    signature: '',
    staffMember: address || '',
  });

  const handleMilestoneApproval = async (approvalData: MilestoneApprovalData) => {
    try {
      // Update purchase status - in a real app, this would be an API call
      // await updatePurchaseStatus(purchase.id, 'transfer_confirmed', {
      //   transferInitiatedAt: new Date().toISOString(),
      //   staffMember: address || '',
      //   seatAssigned: transferData.seatNumber,
      //   seatNumber: transferData.seatNumber,
      //   buyerSignature: transferData.signature
      // });

      // Send notification to buyer - in a real app, this would be an API call
      // await sendBuyerNotification(purchase.guestEmail, 'transfer_initiated_confirmed', {
      //   seatNumber: transferData.seatNumber,
      //   wifiPassword: transferData.wifiPassword,
      //   escrowStatus: 'milestone_approved'
      // });

      // toast.success('Ticket transfer completed and buyer notified successfully');

      if (onSuccess) {
        onSuccess(approvalData);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to complete the ticket transfer';
      // toast.error(errorMessage);

      if (onError) {
        onError(error instanceof Error ? error : new Error(errorMessage));
      }
    }
  };

  const isFormValid = transferData.seatNumber.trim().length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Confirm Ticket Transfer - {purchase.guestName}</CardTitle>
        <CardDescription>
          Approve the transfer-initiated milestone to release 70% of escrowed funds
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="seatNumber">Seat / Section *</Label>
            <Input
              id="seatNumber"
              placeholder="e.g., Section 204, Row 12"
              value={transferData.seatNumber}
              onChange={(e) => setTransferData({ ...transferData, seatNumber: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="wifiPassword">Entry Code (Optional)</Label>
            <Input
              id="wifiPassword"
              type="password"
              placeholder="Enter access code"
              value={transferData.wifiPassword}
              onChange={(e) => setTransferData({ ...transferData, wifiPassword: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="signature">Buyer Signature (Optional)</Label>
            <Input
              id="signature"
              placeholder="Buyer signature or initials"
              value={transferData.signature}
              onChange={(e) => setTransferData({ ...transferData, signature: e.target.value })}
            />
          </div>
        </div>

        {isFormValid && (
          <ApproveMilestone
            contractId={escrow.contractId}
            milestoneId={escrow.milestoneId || "transfer_initiated"}
            approverWallet={walletAddress || address || ''}
            onSuccess={handleMilestoneApproval}
            customMetadata={{
              purchaseId: purchase.id,
              seatNumber: transferData.seatNumber,
              transferInitiatedAt: transferData.transferInitiatedAt,
              staffApprover: address || ''
            }}
            confirmationMessage="This will release 70% of the buyer's payment. Confirm the ticket transfer?"
            className="w-full"
            size="lg"
          />
        )}
      </CardContent>
    </Card>
  );
}
