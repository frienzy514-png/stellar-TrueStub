import { gql } from "@apollo/client";

// ── Subscription documents ───────────────────────────────────────────────────

export const ESCROW_STATUS_SUBSCRIPTION = gql`
  subscription EscrowStatusUpdates($escrowId: uuid!) {
    escrow_transactions_by_pk(id: $escrowId) {
      id
      status
      updated_at
      transaction_hash
      escrow_transaction_users {
        id
        funding_status
        funded_at
        transaction_hash
      }
    }
  }
`;

export const USER_ESCROW_ACTIVITY_SUBSCRIPTION = gql`
  subscription UserEscrowActivity($userId: uuid!) {
    escrow_transaction_users(
      where: { user_id: { _eq: $userId } }
      order_by: { updated_at: desc }
      limit: 20
    ) {
      id
      funding_status
      updated_at
      escrow_transaction {
        id
        status
        amount
        updated_at
      }
    }
  }
`;

// ── Co-located result types (Issue #166) ─────────────────────────────────────
//
// These types mirror the shapes returned by the subscriptions above.
// They live here — next to their document — rather than in a hand-maintained
// central types.ts so they stay in sync as the schema evolves.
//
// Once `yarn codegen` is run against a live Hasura endpoint these types will
// be regenerated automatically into src/graphql/generated/ and the imports
// below should be updated to point there.

export type EscrowStatusSubscription = {
  escrow_transactions_by_pk: {
    id: string;
    status: string;
    updated_at: string;
    transaction_hash: string | null;
    escrow_transaction_users: Array<{
      id: string;
      funding_status: string;
      funded_at: string | null;
      transaction_hash: string | null;
    }>;
  } | null;
};

export type UserEscrowActivitySubscription = {
  escrow_transaction_users: Array<{
    id: string;
    funding_status: string;
    updated_at: string;
    escrow_transaction: {
      id: string;
      status: string;
      amount: number;
      updated_at: string;
    };
  }>;
};
