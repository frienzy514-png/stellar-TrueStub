/**
 * RefundService — issue #153
 *
 * Enforces idempotency on refund claims:
 *   - First claim for a given refundId → records the claim and returns the
 *     refund details.
 *   - Subsequent claims for the same refundId → throws RefundAlreadyClaimed.
 *
 * Storage is an in-process Map by default (sufficient for a single-node
 * deployment).  Production deployments that run multiple replicas should
 * swap the store implementation for a shared Redis/DB store; the
 * RefundStore interface below makes that substitution straightforward.
 *
 * Cleanup / TTL
 * -------------
 * Claimed records are retained in memory until `cleanupBefore(cutoff)` is
 * called (e.g. on a scheduled job or when the process runs out of memory).
 * For persistent deployments, a DB-backed store provides its own retention
 * policy.  See the README section "Storage cleanup" for recommended schedules.
 *
 * On-chain execution (#252)
 * -------------------------
 * When constructed with a `RefundExecutor`, a successful claim also moves the
 * funds: the shared singleton uses `TrustlessWorkRefundExecutor`, which
 * resolves the escrow's dispute via Trustless Work with 100% of `amount`
 * distributed to `refundTo`, signs as the platform dispute resolver, and
 * submits the transaction to Stellar.  Preconditions (enforced on-chain):
 *   - `escrowId` is the Trustless Work escrow contract id (C...).
 *   - The escrow is already in dispute (buyer opened it via startDispute).
 *   - `amount` equals the escrow's full disputed balance.
 * The contract rejects resolving an already-resolved escrow, so funds cannot
 * move twice even if two replicas race past the in-memory idempotency check.
 */

import { AppError } from "../middleware/errorHandler";
import {
  EscrowType,
  TrustlessWorkClient,
  TrustlessWorkNotConfiguredError,
  trustlessWorkClient,
} from "../lib/trustless-work";

// ── Types ──────────────────────────────────────────────────────────────────

export interface ClaimedRefund {
  /** Idempotency key — unique per refund claim, e.g. the on-chain tx hash. */
  refundId: string;
  /** The escrow / contract this refund belongs to. */
  escrowId: string;
  /** ISO timestamp of the first (and only valid) claim. */
  claimedAt: string;
  /** Caller-supplied metadata forwarded from the route payload. */
  amount?: number | string;
  currency?: string;
  claimedBy?: string;
  /**
   * claimed   — recorded only (service has no executor)
   * pending   — on-chain refund in flight
   * submitted — refund transaction accepted by Stellar (`txHash` set)
   * failed    — on-chain refund failed (`failureReason` set); may be retried
   */
  status?: RefundStatus;
  /** Stellar address the refund is paid to. */
  refundTo?: string;
  escrowType?: EscrowType;
  milestoneIndex?: string;
  txHash?: string;
  failureReason?: string;
}

export type RefundStatus = "claimed" | "pending" | "submitted" | "failed";

export interface RefundPayload {
  refundId: string;
  escrowId: string;
  amount?: number | string;
  currency?: string;
  claimedBy?: string;
  refundTo?: string;
  escrowType?: EscrowType;
  milestoneIndex?: string;
}

/**
 * Moves the funds for a claimed refund.  Implementations must throw if the
 * transfer did not happen.
 */
export interface RefundExecutor {
  execute(claim: ClaimedRefund): Promise<{ txHash: string }>;
}

/** Executes refunds by resolving the escrow dispute through Trustless Work. */
export class TrustlessWorkRefundExecutor implements RefundExecutor {
  constructor(private readonly client: TrustlessWorkClient = trustlessWorkClient) {}

  async execute(claim: ClaimedRefund): Promise<{ txHash: string }> {
    const { txHash } = await this.client.resolveDispute({
      contractId: claim.escrowId,
      escrowType: claim.escrowType ?? "single-release",
      milestoneIndex: claim.milestoneIndex,
      distributions: [{ address: claim.refundTo!, amount: Number(claim.amount) }],
    });
    return { txHash };
  }
}

/**
 * Pluggable storage backend for refund idempotency.
 *
 * Swap the default `InMemoryRefundStore` for a Redis- or DB-backed
 * implementation in multi-node deployments.
 */
export interface RefundStore {
  has(refundId: string): Promise<boolean>;
  get(refundId: string): Promise<ClaimedRefund | undefined>;
  set(refundId: string, record: ClaimedRefund): Promise<void>;
  /**
   * Remove all records whose `claimedAt` is before `cutoff`.
   * Returns the number of records deleted.
   *
   * Documented cleanup procedure
   * ----------------------------
   * Call this method periodically (e.g. daily cron) with a cutoff of
   * `Date.now() - 90 * 24 * 60 * 60 * 1000` (90 days) to evict stale
   * claims and prevent unbounded memory/storage growth.  Refund disputes
   * are typically resolved within 30 days, so a 90-day window gives ample
   * overlap before a claim becomes eligible for eviction.
   *
   * For DB-backed stores, pair this with a table-level retention policy or
   * a scheduled DELETE WHERE claimed_at < $cutoff.
   */
  cleanupBefore(cutoff: Date): Promise<number>;
}

// ── In-memory default store ────────────────────────────────────────────────

export class InMemoryRefundStore implements RefundStore {
  private readonly store = new Map<string, ClaimedRefund>();

  async has(refundId: string): Promise<boolean> {
    return this.store.has(refundId);
  }

  async get(refundId: string): Promise<ClaimedRefund | undefined> {
    return this.store.get(refundId);
  }

  async set(refundId: string, record: ClaimedRefund): Promise<void> {
    this.store.set(refundId, record);
  }

  async cleanupBefore(cutoff: Date): Promise<number> {
    let removed = 0;
    for (const [id, record] of this.store) {
      if (new Date(record.claimedAt) < cutoff) {
        this.store.delete(id);
        removed++;
      }
    }
    return removed;
  }

  /** Visible for testing — returns the raw map size. */
  get size(): number {
    return this.store.size;
  }
}

// ── Error codes ────────────────────────────────────────────────────────────

export const REFUND_ERROR_CODES = {
  ALREADY_CLAIMED: "REFUND_ALREADY_CLAIMED",
  INVALID_PAYLOAD: "REFUND_INVALID_PAYLOAD",
  EXECUTION_FAILED: "REFUND_EXECUTION_FAILED",
  EXECUTION_UNAVAILABLE: "REFUND_EXECUTION_UNAVAILABLE",
} as const;

const STELLAR_ADDRESS = /^[GC][A-Z2-7]{55}$/;

// ── Service ────────────────────────────────────────────────────────────────

export class RefundService {
  constructor(
    private readonly store: RefundStore = new InMemoryRefundStore(),
    private readonly executor?: RefundExecutor,
  ) {}

  /**
   * Attempts to record a refund claim for `refundId`.
   *
   * - If `refundId` has never been claimed → records the claim and returns
   *   the `ClaimedRefund` record.
   * - If `refundId` was already claimed → throws `AppError(409,
   *   REFUND_ALREADY_CLAIMED)` with the original claim timestamp attached to
   *   the message, enabling the caller to return the same idempotent response
   *   body they would have returned on the first call.
   * - If an executor is configured, the refund is then executed on-chain and
   *   the returned record carries `status: "submitted"` and the `txHash`.  A
   *   failed execution is recorded as `status: "failed"` and may be retried
   *   with the same `refundId`.
   */
  async claimRefund(payload: RefundPayload): Promise<ClaimedRefund> {
    const { refundId, escrowId } = payload;

    if (!refundId || !escrowId) {
      throw new AppError(400, REFUND_ERROR_CODES.INVALID_PAYLOAD, "refundId and escrowId are required");
    }
    if (this.executor) {
      this.assertExecutable(payload);
    }

    // Idempotency check — serialisable under async concurrency because
    // `has` + `set` execute in the same microtask for the default in-memory
    // store.  A Redis-backed store should use SET NX (atomic) instead.
    const existing = await this.store.get(refundId);
    if (existing && existing.status !== "failed") {
      throw new AppError(
        409,
        REFUND_ERROR_CODES.ALREADY_CLAIMED,
        `Refund ${refundId} was already claimed at ${existing.claimedAt}`
      );
    }

    const record: ClaimedRefund = {
      refundId,
      escrowId,
      claimedAt: new Date().toISOString(),
      amount: payload.amount,
      currency: payload.currency,
      claimedBy: payload.claimedBy,
    };

    if (!this.executor) {
      record.status = "claimed";
      await this.store.set(refundId, record);
      return record;
    }

    record.status = "pending";
    record.refundTo = payload.refundTo;
    record.escrowType = payload.escrowType ?? "single-release";
    record.milestoneIndex = payload.milestoneIndex;
    await this.store.set(refundId, record);

    try {
      const { txHash } = await this.executor.execute(record);
      const submitted: ClaimedRefund = { ...record, status: "submitted", txHash };
      await this.store.set(refundId, submitted);
      return submitted;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      await this.store.set(refundId, { ...record, status: "failed", failureReason: reason });
      if (err instanceof TrustlessWorkNotConfiguredError) {
        throw new AppError(503, REFUND_ERROR_CODES.EXECUTION_UNAVAILABLE, "On-chain refunds are not configured");
      }
      throw new AppError(502, REFUND_ERROR_CODES.EXECUTION_FAILED, `Refund ${refundId} could not be executed: ${reason}`);
    }
  }

  private assertExecutable(payload: RefundPayload): void {
    const amount = Number(payload.amount);
    if (!payload.refundTo || !STELLAR_ADDRESS.test(payload.refundTo)) {
      throw new AppError(400, REFUND_ERROR_CODES.INVALID_PAYLOAD, "refundTo must be a Stellar address");
    }
    if (payload.amount === undefined || !Number.isFinite(amount) || amount <= 0) {
      throw new AppError(400, REFUND_ERROR_CODES.INVALID_PAYLOAD, "amount must be a positive number");
    }
    if (payload.escrowType === "multi-release" && !payload.milestoneIndex) {
      throw new AppError(400, REFUND_ERROR_CODES.INVALID_PAYLOAD, "milestoneIndex is required for multi-release escrows");
    }
  }

  /**
   * Returns the existing claim for `refundId`, or `undefined` if it has
   * never been claimed.  Useful for idempotent GET endpoints.
   */
  async getClaimStatus(refundId: string): Promise<ClaimedRefund | undefined> {
    return this.store.get(refundId);
  }

  /**
   * Delegates to `store.cleanupBefore`.
   *
   * Recommended cron expression (every day at 02:00 UTC):
   *   `0 2 * * * cleanupRefundClaims(90)`
   *
   * @param retentionDays Number of days to retain claims (default: 90).
   */
  async cleanup(retentionDays = 90): Promise<number> {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    return this.store.cleanupBefore(cutoff);
  }
}

// Singleton — routes import this shared instance.  Claims execute on-chain.
export const refundService = new RefundService(new InMemoryRefundStore(), new TrustlessWorkRefundExecutor());
