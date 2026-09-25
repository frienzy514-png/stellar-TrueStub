/**
 * Generic Trustless Work escrow shapes.
 *
 * This file is the single source of truth for escrow types that mirror the
 * Trustless Work SDK payloads and are NOT specific to ticket resale.
 *
 * Ticket-purchase-specific types (purchase/event/listing data, UI props,
 * form state and escrow metadata) live in `ticket-purchase-escrow.interface.ts`
 * and build on the shared types exported here (e.g. `EscrowRoles`,
 * `EscrowTrustline`).
 */

export interface EscrowContractMilestone {
  description: string;
  amount?: number;
  receiver?: string;
}

export interface EscrowRoles {
  approver: string;
  serviceProvider: string;
  platformAddress: string;
  releaseSigner: string;
  disputeResolver: string;
  receiver: string;
}

export interface EscrowTrustline {
  address: string;
  decimals: number;
  symbol?: string;
}

/** Payload sent to the Trustless Work API to deploy an escrow contract. */
export interface EscrowContract {
  signer: string;
  engagementId: string;
  title: string;
  description: string;
  roles: EscrowRoles;
  amount: number;
  platformFee: number;
  milestones: EscrowContractMilestone[];
  trustline: EscrowTrustline;
  receiverMemo?: number;
}
