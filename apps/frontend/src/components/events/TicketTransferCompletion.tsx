"use client";

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChangeMilestoneStatus } from '@/components/tw-blocks/escrows/multi-release/change-milestone-status/ChangeMilestoneStatus';
import { TicketTransferCompletionProps, TransferCompletionData, TicketConditionAssessment, MilestoneStatusData } from './types';
import { useGlobalAuthenticationStore } from '@/core/store/data';
import { useWalletContext } from '@/components/tw-blocks/wallet-kit/WalletProvider';
// import { updatePurchaseStatus, sendBuyerNotification, initiateDispute } from '@/services/event.service';
// import { toast } from 'react-toastify';

export function TicketTransferCompletion({ purchase, escrow, onSuccess, onError }: TicketTransferCompletionProps) {
  const { address } = useGlobalAuthenticationStore();
  const { walletAddress } = useWalletContext();
  const [completionData, setCompletionData] = useState<TransferCompletionData>({
    transferCompletedAt: new Date().toISOString(),
    ticketCondition: 'good',
    staffMember: address || '',
  });
  const [conditionAssessment, setConditionAssessment] = useState<TicketConditionAssessment>({
    hasIssue: false,
    condition: 'good',
    description: '',
  });

  const handleCompletionSubmit = async (statusData: MilestoneStatusData) => {
    try {
      const finalStatus = conditionAssessment.hasIssue ? 'disputed' : 'completed';

      // Update purchase status - in a real app, this would be an API call
      // await updatePurchaseStatus(purchase.id, 'transfer_finalized', {
      //   transferCompletedAt: new Date().toISOString(),
      //   ticketCondition: conditionAssessment.condition,
      //   finalStatus,
      //   staffMember: completionData.staffMember
      // });

      if (conditionAssessment.hasIssue) {
        // Initiate dispute process - in a real app, this would be an API call
        // await initiateDispute(escrow.contractId, conditionAssessment);
        // await sendBuyerNotification(purchase.guestEmail, 'dispute_initiated', {
        //   purchaseId: purchase.id,
        //   reason: 'ticket_issue',
        //   description: conditionAssessment.description,
        // });
        // toast.warning('Ticket issue detected. Dispute process initiated.');
      } else {
        // Send completion notification - in a real app, this would be an API call
        // await sendBuyerNotification(purchase.guestEmail, 'transfer_completed_confirmed', {
        //   purchaseId: purchase.id,
        //   escrowStatus: 'completed',
        // });
        // toast.success('Ticket transfer completed successfully! Buyer has been notified.');
      }

      if (onSuccess) {
        onSuccess(statusData);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to complete the ticket transfer';
      // toast.error(errorMessage);

      if (onError) {
        onError(error instanceof Error ? error : new Error(errorMessage));
      }
    }
  };

  const platformWallet = process.env.NEXT_PUBLIC_PLATFORM_WALLET || walletAddress || address || '';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Complete Ticket Transfer - {purchase.guestName}</CardTitle>
        <CardDescription>
          Confirm the ticket transfer and release the remaining funds
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ticketCondition">Ticket Condition *</Label>
            <Select
              value={completionData.ticketCondition}
              onValueChange={(value: 'excellent' | 'good' | 'fair' | 'poor') => {
                setCompletionData({ ...completionData, ticketCondition: value });
                setConditionAssessment({ ...conditionAssessment, condition: value });
              }}
            >
              <SelectTrigger id="ticketCondition">
                <SelectValue placeholder="Select ticket condition" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="excellent">Excellent</SelectItem>
                <SelectItem value="good">Good</SelectItem>
                <SelectItem value="fair">Fair</SelectItem>
                <SelectItem value="poor">Poor</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-start space-x-3 space-y-0 rounded-md border p-4">
            <Checkbox
              id="hasIssue"
              checked={conditionAssessment.hasIssue}
              onCheckedChange={(checked) =>
                setConditionAssessment({ ...conditionAssessment, hasIssue: checked === true })
              }
            />
            <div className="space-y-1 leading-none">
              <Label htmlFor="hasIssue" className="cursor-pointer">
                Ticket has an issue
              </Label>
              <p className="text-sm text-muted-foreground">
                Check this box if there is any issue with the ticket that requires attention
              </p>
            </div>
          </div>

          {conditionAssessment.hasIssue && (
            <div className="space-y-2">
              <Label htmlFor="issueDescription">Issue Description *</Label>
              <Textarea
                id="issueDescription"
                placeholder="Describe the issue in detail..."
                className="min-h-[100px]"
                value={conditionAssessment.description}
                onChange={(e) =>
                  setConditionAssessment({ ...conditionAssessment, description: e.target.value })
                }
              />
            </div>
          )}
        </div>

        <ChangeMilestoneStatus
          contractId={escrow.contractId}
          milestoneId={escrow.milestoneId || "transfer_completed"}
          newStatus={conditionAssessment.hasIssue ? "disputed" : "completed"}
          walletAddress={platformWallet}
          onSuccess={handleCompletionSubmit}
          customMetadata={{
            purchaseId: purchase.id,
            transferCompletedAt: completionData.transferCompletedAt,
            ticketCondition: conditionAssessment.condition,
            hasIssue: conditionAssessment.hasIssue,
            issueDescription: conditionAssessment.description,
            staffApprover: completionData.staffMember
          }}
          confirmationMessage={
            conditionAssessment.hasIssue
              ? "Ticket issue detected. This will initiate a dispute process."
              : "Complete the transfer and release the remaining 30% of payment?"
          }
          evidence={conditionAssessment.hasIssue ? JSON.stringify({
            condition: conditionAssessment.condition,
            description: conditionAssessment.description,
            hasIssue: true,
          }) : undefined}
          className="w-full"
          size="lg"
          variant={conditionAssessment.hasIssue ? "destructive" : "default"}
        />
      </CardContent>
    </Card>
  );
}
