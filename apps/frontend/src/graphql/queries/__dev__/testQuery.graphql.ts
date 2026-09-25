/**
 * DEV-ONLY GraphQL queries.
 *
 * These operations are used exclusively by ApolloTestComponent for local
 * development / health-checking. They must not be imported from production
 * code. All files in this __dev__/ directory are excluded from the
 * production bundle by convention — do not add imports to them from any
 * file outside __dev__/.
 */
import { graphql } from "@/graphql/generated";

export const GET_ESCROW_TRANSACTIONS = graphql(`
  query GetEscrowTransactions($limit: Int = 10) {
    escrow_transactions(limit: $limit, order_by: { created_at: desc }) {
      id
      contract_id
      created_at
      status
      escrow_transaction_users {
        id
        funding_status
        user {
          id
          email
          first_name
          last_name
        }
      }
    }
  }
`);

export const HEALTH_CHECK_QUERY = graphql(`
  query HealthCheck {
    __typename
  }
`);

export const GET_USERS = graphql(`
  query GetUsers($limit: Int = 10) {
    users(limit: $limit, order_by: { created_at: desc }) {
      id
      email
      first_name
      last_name
      created_at
    }
  }
`);
