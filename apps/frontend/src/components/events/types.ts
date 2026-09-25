export interface TicketPurchase {
  id: string;
  guestName: string;
  guestEmail: string;
  transferDate: string;
  eventDate: string;
  seatNumber?: string;
  status: 'pending' | 'transfer_confirmed' | 'transfer_finalized' | 'completed' | 'cancelled';
}

export interface TransferInitiationData {
  seatNumber: string;
  transferInitiatedAt: string;
  wifiPassword?: string;
  signature?: string;
  staffMember?: string;
}

export interface TransferCompletionData {
  transferCompletedAt: string;
  staffMember?: string;
  ticketCondition?: 'excellent' | 'good' | 'fair' | 'poor';
}

export interface TicketConditionAssessment {
  hasIssue: boolean;
  condition: 'excellent' | 'good' | 'fair' | 'poor';
  description?: string;
  issuePhotos?: string[];
}

export interface MilestoneApprovalData {
  contractId: string;
  milestoneId: string;
  purchaseId: string;
  timestamp: string;
}

export interface MilestoneStatusData {
  contractId: string;
  milestoneId: string;
  newStatus: string;
  purchaseId: string;
  timestamp: string;
}

export interface EscrowMetadata {
  purchaseId: string;
  eventName: string;
  transferDate: string;
  eventDate: string;
  guestName?: string;
  guestEmail?: string;
  seatNumber?: string;
  transferInitiatedAt?: string;
  transferCompletedAt?: string;
  staffApprover?: string;
  hasIssue?: boolean;
  issueDescription?: string;
}

export interface TicketTransferApprovalProps {
  purchase: TicketPurchase;
  escrow: {
    contractId: string;
    milestoneId?: string;
    metadata?: EscrowMetadata;
  };
  onSuccess?: (data: MilestoneApprovalData) => void;
  onError?: (error: Error) => void;
}

export interface TicketTransferCompletionProps {
  purchase: TicketPurchase;
  escrow: {
    contractId: string;
    milestoneId?: string;
    metadata?: EscrowMetadata;
  };
  onSuccess?: (data: MilestoneStatusData) => void;
  onError?: (error: Error) => void;
}
