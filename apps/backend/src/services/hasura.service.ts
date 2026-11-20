/**
 * Domain-level Hasura operations (the top layer of backend → Hasura access).
 *
 * This is the one place backend code should go to read or write Hasura data.
 * Each method builds its GraphQL document and delegates the HTTP call to the
 * low-level transport in `lib/hasura.ts`, which owns the admin secret and
 * error handling. See that file for the full layering note.
 */
import { hasuraClient, type HasuraRequestOptions } from "../lib/hasura";
import { queryWithTimeout } from "../lib/postgres";
import { AppError } from "../middleware/errorHandler";
import { getCorrelationId as getRequestId } from "../middleware/requestLogger";

interface EscrowMutationData {
  update_escrow_transactions?: { affected_rows?: number };
}

interface NotificationMutationData {
  insert_notifications_one?: { id?: string } | null;
}

interface EscrowTransaction {
  id: string;
  contract_id: string;
  buyer_id: string;
  seller_id: string;
  amount: number;
  status: string;
  created_at: string;
  updated_at: string;
}

interface EscrowByIdData {
  escrow_transactions_by_pk?: EscrowTransaction | null;
}

interface RefundRetryData {
  refunds?: Array<{ id: string; retry_count?: number | null }>;
}

interface RefundRetryMutationData {
  update_refunds?: { affected_rows?: number };
}

export interface EscrowStatusRow {
  id: string;
  contract_id: string;
  status: string;
  updated_at: string;
}

interface EscrowStatusQueryResult {
  escrow_transactions?: EscrowStatusRow[];
}

export const LOCKED_ESCROW_STATUSES = [
  "pending",
  "funded",
  "in_progress",
  "in-progress",
  "active",
  "released",
  "completed",
  "complete",
] as const;

export interface ListingEscrowLockRow {
  id: string;
  status: string;
}

interface ListingEscrowLockQueryResult {
  escrow_transactions?: ListingEscrowLockRow[];
}

interface ListingDeleteResult {
  delete_ticket_listings?: {
    affected_rows?: number;
    returning?: Array<{ id: number }>;
  };
}

export class HasuraService {
  /**
   * The single authoritative write path for `escrow_transactions.status`
   * (called only from the HMAC-verified `/webhooks/escrow-status` route).
   *
   * Failures are surfaced, not swallowed: the webhook must answer non-2xx so
   * Trustless Work retries the delivery instead of the update being lost. The
   * thrown error is generic so admin credentials and remote error payloads
   * stay out of logs and responses.
   *
   * Replay/dedup: the update is naturally idempotent — re-applying the same
   * `status` for the same `contract_id` converges to the same end state and
   * reports `affected_rows: 0` when the row already holds that status. Callers
   * use that signal to skip duplicate side effects (e.g. notifications) for a
   * replayed delivery.
   */
  static async updateEscrowStatus(
    contractId: string,
    status: string
  ): Promise<{ affected_rows: number }> {
    const requestId = getRequestId();
    const query = `
      mutation UpdateEscrowStatus($contractId: String!, $status: String!) {
        update_escrow_transactions(
          where: { contract_id: { _eq: $contractId }, status: { _neq: $status } }
          _set: { status: $status, updated_at: "now()" }
        ) {
          affected_rows
        }
      }
    `;

    let data: EscrowMutationData;
    try {
      data = await hasuraClient.request<EscrowMutationData>(
        query,
        {
          contractId,
          status,
        },
        { requestId }
      );
    } catch {
      throw new Error(
        `Failed to update escrow status in Hasura (requestId=${requestId ?? "unknown"})`
      );
    }
    return { affected_rows: data.update_escrow_transactions?.affected_rows ?? 0 };
  }

  /**
   * Fetch a single escrow transaction by its ID.
   *
   * Returns `null` when no escrow matches the given ID so callers can answer
   * 404 without leaking whether the ID exists. Authorization (party check) is
   * enforced by the caller against `buyer_id`/`seller_id`.
   */
  static async getEscrowById(id: string, userId?: string): Promise<EscrowTransaction | null> {
    const query = `
      query GetEscrowById($id: uuid!) {
        escrow_transactions_by_pk(id: $id) {
          id
          contract_id
          buyer_id
          seller_id
          amount
          status
          created_at
          updated_at
        }
      }
    `;

    const requestId = getRequestId();
    let data: EscrowByIdData;
    try {
      data = await hasuraClient.request<EscrowByIdData>(query, { id }, { requestId });
    } catch {
      throw new Error(`Failed to fetch escrow from Hasura (requestId=${requestId ?? "unknown"})`);
    }

    const escrow = data.escrow_transactions_by_pk ?? null;
    if (!escrow) {
      const err = new AppError(404, "ESCROW_NOT_FOUND", `Escrow ${id} not found`);
      (err as AppError & { status?: number }).status = 404;
      throw err;
    }

    if (userId && escrow.buyer_id !== userId && escrow.seller_id !== userId) {
      const err = new AppError(403, "ESCROW_FORBIDDEN", "You are not authorized to view this escrow");
      (err as AppError & { status?: number }).status = 403;
      throw err;
    }

    return escrow;
  }

  static async insertNotification(notification: {
    userId: string;
    type: string;
    title: string;
    message: string;
  }): Promise<boolean> {
    const mutation = `
      mutation InsertNotification($userId: String!, $type: String!, $title: String!, $message: String!) {
        insert_notifications_one(
          object: {
            user_id: $userId
            type: $type
            title: $title
            message: $message
            read: false
          }
          on_conflict: {
            constraint: notifications_user_id_type_title_message_key
            update_columns: []
          }
        ) {
          id
        }
      }
    `;

    const requestId = getRequestId();
    try {
      const data = await hasuraClient.request<NotificationMutationData>(
        mutation,
        notification,
        { requestId }
      );
      return Boolean(data.insert_notifications_one?.id);
    } catch {
      return false;
    }
  }

  /**
   * Reads the persisted retry counter for a refund so the retry-on-failure
   * path can enforce a bounded budget across requests. Returns `null` when the
   * refund row does not exist.
   */
  static async getRefundRetryCount(refundId: string): Promise<number | null> {
    const query = `
      query GetRefundRetryCount($refundId: String!) {
        refunds(where: { id: { _eq: $refundId } }, limit: 1) {
          id
          retry_count
        }
      }
    `;

    const requestId = getRequestId();
    let data: RefundRetryData;
    try {
      data = await hasuraClient.request<RefundRetryData>(query, { refundId }, { requestId });
    } catch {
      throw new Error(
        `Failed to read refund retry count from Hasura (requestId=${requestId ?? "unknown"})`
      );
    }

    const refund = data.refunds?.[0];
    if (!refund) {
      return null;
    }
    return refund.retry_count ?? 0;
  }

  /**
   * Atomically increments the persisted retry counter for a refund. The
   * increment is guarded by `retry_count: { _lt: $maxRetries }` so concurrent
   * retry requests cannot push the counter past the cap; `affected_rows: 0`
   * signals the budget is exhausted and the caller must stop retrying.
   */
  static async incrementRefundRetryCount(
    refundId: string,
    maxRetries: number
  ): Promise<{ affected_rows: number }> {
    const mutation = `
      mutation IncrementRefundRetryCount($refundId: String!, $maxRetries: Int!) {
        update_refunds(
          where: { id: { _eq: $refundId }, retry_count: { _lt: $maxRetries } }
          _inc: { retry_count: 1 }
        ) {
          affected_rows
        }
      }
    `;

    const requestId = getRequestId();
    let data: RefundRetryMutationData;
    try {
      data = await hasuraClient.request<RefundRetryMutationData>(
        mutation,
        {
          refundId,
          maxRetries,
        },
        { requestId }
      );
    } catch {
      throw new Error(
        `Failed to increment refund retry count in Hasura (requestId=${requestId ?? "unknown"})`
      );
    }
    return { affected_rows: data.update_refunds?.affected_rows ?? 0 };
  }

  /**
   * Fetches a sample of recent escrow transactions so their stored status can
   * be reconciled against Trustless Work's live state.
   *
   * Read-only: it does not touch the webhook write path
   * (`updateEscrowStatus`), which stays the single authoritative writer of
   * `escrow_transactions.status`.
   */
  static async fetchRecentEscrowStatuses(
    limit = 50,
    options: HasuraRequestOptions = {}
  ): Promise<EscrowStatusRow[]> {
    const query = `
      query RecentEscrowStatuses($limit: Int!) {
        escrow_transactions(order_by: { updated_at: desc }, limit: $limit) {
          id
          contract_id
          status
          updated_at
        }
      }
    `;

    const data = await hasuraClient.request<EscrowStatusQueryResult>(
      query,
      { limit },
      { requestId: options.requestId ?? getRequestId() }
    );
    return data.escrow_transactions ?? [];
  }

  static async findLockingEscrowForListing(
    listingId: string,
    options: HasuraRequestOptions = {}
  ): Promise<ListingEscrowLockRow | null> {
    const query = `
      query LockingEscrowForListing($listingId: uuid!, $statuses: [String!]!) {
        escrow_transactions(
          where: { listing_id: { _eq: $listingId }, status: { _in: $statuses } }
          limit: 1
        ) {
          id
          status
        }
      }
    `;

    const data = await hasuraClient.request<ListingEscrowLockQueryResult>(
      query,
      { listingId, statuses: [...LOCKED_ESCROW_STATUSES] },
      { requestId: options.requestId ?? getRequestId() }
    );
    return data.escrow_transactions?.[0] ?? null;
  }

  static async findLockingEscrowForListingFromPostgres(
    listingId: string
  ): Promise<ListingEscrowLockRow | null> {
    const result = await queryWithTimeout<ListingEscrowLockRow>(
      `SELECT id, status
         FROM escrow_transactions
        WHERE listing_id = $1
          AND status = ANY($2::text[])
        LIMIT 1`,
      [listingId, [...LOCKED_ESCROW_STATUSES]]
    );
    return result.rows?.[0] ?? null;
  }

  /**
   * Delete only the caller's ticket listing. PostgreSQL's BEFORE DELETE trigger
   * is the authoritative guard, so direct Hasura mutations and concurrent
   * escrow/dispute inserts cannot bypass the history/dependent-record checks.
   */
  static async deleteTicketListing(id: number, ownerId: string): Promise<boolean> {
    const mutation = `
      mutation DeleteTicketListing($id: Int!, $ownerId: String!) {
        delete_ticket_listings(
          where: { id: { _eq: $id }, owner_id: { _eq: $ownerId } }
        ) {
          affected_rows
          returning { id }
        }
      }
    `;

    try {
      const data = await hasuraClient.request<ListingDeleteResult>(mutation, { id, ownerId });
      return (data.delete_ticket_listings?.affected_rows ?? 0) > 0;
    } catch (error) {
      const detail = error instanceof Error ? error.message : "";
      if (detail.includes("LISTING_DELETE_BLOCKED")) {
        const message = detail.includes("dispute")
          ? "This listing cannot be deleted because a dispute references it. Resolve the dispute and retain its history."
          : "This listing cannot be deleted because an escrow references it. Complete or resolve the escrow and retain its history.";
        throw new AppError(409, "LISTING_DELETE_BLOCKED", message);
      }
      throw new Error("Failed to delete listing from Hasura");
    }
  }
}
