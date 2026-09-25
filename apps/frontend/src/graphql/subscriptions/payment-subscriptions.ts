import { gql } from "@apollo/client";

// ── Subscription documents ───────────────────────────────────────────────────

export const PAYMENT_STATUS_SUBSCRIPTION = gql`
  subscription PaymentStatusUpdates($escrowUserId: uuid!) {
    escrow_transaction_users_by_pk(id: $escrowUserId) {
      id
      funding_status
      funded_at
      transaction_hash
      escrow_transaction {
        id
        status
        amount
      }
    }
  }
`;

export const BLOCKCHAIN_TRANSACTION_SUBSCRIPTION = gql`
  subscription BlockchainTransactionUpdates($transactionHash: String!) {
    blockchain_transactions(
      where: { transaction_hash: { _eq: $transactionHash } }
    ) {
      transaction_hash
      status
      confirmations
      block_height
      updated_at
    }
  }
`;

// ── Co-located result types (Issue #166) ─────────────────────────────────────
//
// Once `yarn codegen` is run against a live Hasura endpoint these types will
// be regenerated automatically into src/graphql/generated/ and the imports
// below should be updated to point there.

export type PaymentStatusSubscription = {
  escrow_transaction_users_by_pk: {
    id: string;
    funding_status: string;
    funded_at: string | null;
    transaction_hash: string | null;
    escrow_transaction: {
      id: string;
      status: string;
      amount: number;
    };
  } | null;
};
