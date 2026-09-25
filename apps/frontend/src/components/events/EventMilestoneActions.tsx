"use client";

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TicketTransferApproval } from './TicketTransferApproval';
import { TicketTransferCompletion } from './TicketTransferCompletion';
import { TicketPurchase, EscrowMetadata } from './types';
import { EscrowData } from '@/components/dashboard/RoleEscrowDashboard';

interface EventMilestoneActionsProps {
  escrow: EscrowData;
  userRole: 'guest' | 'event' | 'admin';
  onComplete?: () => void;
}

export function EventMilestoneActions({ escrow, userRole, onComplete }: EventMilestoneActionsProps) {
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [isCompletionOpen, setIsCompletionOpen] = useState(false);

  // Convert escrow metadata to purchase format
  const purchase: TicketPurchase = {
    id: escrow.metadata?.purchaseId || escrow.id,
    guestName: escrow.metadata?.guestName || 'Guest',
    guestEmail: escrow.metadata?.guestEmail || '',
    transferDate: escrow.metadata?.transferDate || '',
    eventDate: escrow.metadata?.eventDate || '',
    seatNumber: escrow.metadata?.seatNumber,
    status: escrow.status === 'funded' ? 'pending' :
           escrow.status === 'transfer_confirmed' ? 'transfer_confirmed' :
           escrow.status === 'transfer_finalized' || escrow.status === 'completed' ? 'transfer_finalized' :
           escrow.status === 'cancelled' ? 'cancelled' : 'pending',
  };

  const escrowMetadata: EscrowMetadata = {
    purchaseId: purchase.id,
    eventName: escrow.metadata?.eventName || 'Event',
    transferDate: purchase.transferDate,
    eventDate: purchase.eventDate,
    ...(escrow.metadata || {}),
  };

  const handleTransferSuccess = () => {
    setIsTransferOpen(false);
    if (onComplete) {
      onComplete();
    }
  };

  const handleCompletionSuccess = () => {
    setIsCompletionOpen(false);
    if (onComplete) {
      onComplete();
    }
  };

  // Determine which action to show
  const showTransfer = userRole === 'event' && escrow.status === 'funded' && escrow.nextMilestone === 'transfer_initiated';
  const showCompletion = (userRole === 'event' || userRole === 'admin') &&
                       escrow.status === 'transfer_confirmed' &&
                       escrow.nextMilestone === 'transfer_completed';

  if (!showTransfer && !showCompletion) {
    return null;
  }

  return (
    <>
      {showTransfer && (
        <>
          <button
            onClick={() => setIsTransferOpen(true)}
            className="w-full mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors text-sm font-medium"
          >
            Confirm Ticket Transfer
          </button>
          <Dialog open={isTransferOpen} onOpenChange={setIsTransferOpen}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Ticket Transfer Confirmation</DialogTitle>
              </DialogHeader>
              <TicketTransferApproval
                purchase={purchase}
                escrow={{
                  contractId: escrow.contractId,
                  milestoneId: '0', // Transfer initiation is typically the first milestone
                  metadata: escrowMetadata,
                }}
                onSuccess={handleTransferSuccess}
              />
            </DialogContent>
          </Dialog>
        </>
      )}

      {showCompletion && (
        <>
          <button
            onClick={() => setIsCompletionOpen(true)}
            className="w-full mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors text-sm font-medium"
          >
            Complete Ticket Transfer
          </button>
          <Dialog open={isCompletionOpen} onOpenChange={setIsCompletionOpen}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Ticket Transfer Completion</DialogTitle>
              </DialogHeader>
              <TicketTransferCompletion
                purchase={purchase}
                escrow={{
                  contractId: escrow.contractId,
                  milestoneId: '1', // Transfer completion is typically the second milestone
                  metadata: escrowMetadata,
                }}
                onSuccess={handleCompletionSuccess}
              />
            </DialogContent>
          </Dialog>
        </>
      )}
    </>
  );
}
