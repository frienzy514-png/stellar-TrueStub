export type EscrowStatus =
  | 'pending'
  | 'funded'
  | 'released'
  | 'refunded'
  | 'disputed'
  | 'cancelled';

export type RefundStatus =
  | 'none'
  | 'requested'
  | 'processing'
  | 'submitted'
  | 'completed'
  | 'failed';

export interface RefundRecord {
  id: string;
  escrowId: string;
  status: RefundStatus;
  amount: string;
  asset: string;
  /** Stellar transaction hash for the on-chain refund, when available. */
  transactionHash?: string;
  /** Ledger the refund transaction was included in, when available. */
  ledger?: number;
  reason?: string;
  errorMessage?: string;
  requestedAt?: string;
  submittedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Escrow {
  id: string;
  status: EscrowStatus;
  amount: string;
  asset: string;
  buyerId: string;
  sellerId: string;
  createdAt: string;
  updatedAt: string;
  /** Present when the escrow has been refunded (or a refund is in flight). */
  refund?: RefundRecord;
  /** Convenience mirror of `refund.status` for status views. */
  refundStatus?: RefundStatus;
}
