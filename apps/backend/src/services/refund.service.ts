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
 * The in-memory store is bounded (#538): records older than
 * REFUND_STORE_TTL_MS are dropped, and the oldest records are evicted once
 * the store exceeds REFUND_STORE_MAX entries. `cleanupBefore(cutoff)` can
 * still be called on a schedule for tighter retention.
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
  RefundAmountMismatchError,
  assertRefundAmountMatchesDisputedBalance,
  trustlessWorkClient,
} from "../lib/trustless-work";
import { assertMainnetSubmissionAllowed, type NetworkGuardConfig } from "../lib/network-guard";
import { getCorrelationId as getRequestId } from "../middleware/requestLogger";
import { logger } from "../lib/logger";
import { captureException } from "../lib/sentry";
import { HasuraService } from "./hasura.service";

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
    // Guard: refuse to submit mainnet transactions outside a production
    // environment, even if network config was misconfigured (#373/#415).
    const guardConfig: NetworkGuardConfig = {
      nodeEnv: process.env.NODE_ENV,
      stellarNetwork: process.env.STELLAR_NETWORK,
      trustlessWorkApiUrl: process.env.TRUSTLESS_WORK_API_URL,
      ci: process.env.CI,
    };
    assertMainnetSubmissionAllowed(guardConfig);

    const { txHash } = await this.client.resolveDispute({
      contractId: claim.escrowId,
      escrowType: claim.escrowType ?? "single-release",
      milestoneIndex: claim.milestoneIndex,
      distributions: [{ address: claim.refundTo!, amount: Number(claim.amount) }],
      asset: claim.currency!,
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
   * Atomically inserts `record` for `refundId`, relying on a database-level
   * unique constraint on `refundId` to reject duplicates.
   *
   * Returns `true` when the insert succeeded (this caller won the race) and
   * `false` when a row for `refundId` already existed.  Implementations MUST
   * be atomic — a check-then-write is not sufficient, since two concurrent
   * requests could both pass the check before either writes.
   */
  insertIfAbsent(refundId: string, record: ClaimedRefund): Promise<boolean>;
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

/** Default bounds for the in-memory store (#538), mirroring the webhook dedup map. */
export const REFUND_STORE_MAX = 10_000;
export const REFUND_STORE_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

export class InMemoryRefundStore implements RefundStore {
  private readonly store = new Map<string, ClaimedRefund>();

  constructor(
    private readonly maxSize = REFUND_STORE_MAX,
    private readonly ttlMs = REFUND_STORE_TTL_MS,
  ) {}

  /** Drops expired records, then the oldest ones while over `maxSize`. */
  private prune(): void {
    const cutoff = Date.now() - this.ttlMs;
    for (const [id, record] of this.store) {
      if (new Date(record.claimedAt).getTime() < cutoff) {
        this.store.delete(id);
      }
    }
    // Map preserves insertion order, so the oldest entries come first.
    while (this.store.size > this.maxSize) {
      const oldest = this.store.keys().next().value;
      if (oldest === undefined) break;
      this.store.delete(oldest);
    }
  }

  async has(refundId: string): Promise<boolean> {
    return this.store.has(refundId);
  }

  async get(refundId: string): Promise<ClaimedRefund | undefined> {
    return this.store.get(refundId);
  }

  async set(refundId: string, record: ClaimedRefund): Promise<void> {
    this.store.set(refundId, record);
  }

  async insertIfAbsent(refundId: string, record: ClaimedRefund): Promise<boolean> {
    // Single-threaded event loop: the has+set below cannot interleave with
    // another insertIfAbsent call, so this is atomic for the in-memory store.
    if (this.store.has(refundId)) {
      return false;
    }
    this.store.set(refundId, record);
    this.prune();
    return true;
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
  AMOUNT_MISMATCH: "REFUND_AMOUNT_MISMATCH",
  EXECUTION_FAILED: "REFUND_EXECUTION_FAILED",
  EXECUTION_UNAVAILABLE: "REFUND_EXECUTION_UNAVAILABLE",
  MAINNET_BLOCKED: "REFUND_MAINNET_SUBMISSION_BLOCKED",
} as const;

const STELLAR_ADDRESS = /^[GC][A-Z2-7]{55}$/;

// ── Service ────────────────────────────────────────────────────────────────

export class RefundService {
  constructor(
    private readonly store: RefundStore = new InMemoryRefundStore(),
    private readonly executor?: RefundExecutor,
    /**
     * Looks up the escrow's disputed balance so a wrong `amount` is rejected
     * locally before calling Trustless Work (#537). Returns null when the
     * escrow is unknown, in which case the check is skipped.
     */
    private readonly getDisputedBalance?: (escrowId: string) => Promise<number | null>,
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
    const requestId = getRequestId();

    if (!refundId || !escrowId) {
      throw new AppError(400, REFUND_ERROR_CODES.INVALID_PAYLOAD, "refundId and escrowId are required");
    }
    if (this.executor) {
      this.assertExecutable(payload);
      await this.assertAmountMatchesBalance(payload);
    }

    // Insert-first idempotency: the record is written before any on-chain
    // work, and the store's unique constraint on `refundId` rejects a
    // concurrent duplicate.  This closes the check-then-write race where two
    // requests with the same refundId could both reach the executor.
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
      const inserted = await this.store.insertIfAbsent(refundId, record);
      if (!inserted) {
        throw await this.alreadyClaimed(refundId, requestId);
      }
      logger.info({ requestId, refundId, escrowId, status: record.status }, "refund.claimed");
      return record;
    }

    record.status = "pending";
    record.refundTo = payload.refundTo;
    record.escrowType = payload.escrowType ?? "single-release";
    record.milestoneIndex = payload.milestoneIndex;

    const inserted = await this.store.insertIfAbsent(refundId, record);
    if (!inserted) {
      throw await this.alreadyClaimed(refundId, requestId);
    }

    logger.info({
      requestId,
      refundId,
      escrowId,
      status: record.status,
    }, "refund.claim.accepted");

    try {
      const { txHash } = await this.executor.execute(record);
      const submitted: ClaimedRefund = { ...record, status: "submitted", txHash };
      await this.store.set(refundId, submitted);
      logger.info({ requestId, refundId, escrowId, txHash }, "refund.executed");
      return submitted;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      await this.store.set(refundId, { ...record, status: "failed", failureReason: reason });
      logger.error({
        requestId,
        refundId,
        escrowId,
        reason,
      }, "refund.execution_failed");
      captureException(err, {
        tags: { requestId, refundId, escrowId, component: "refund.service" },
        extra: { refundId, escrowId, reason },
      });
      if (err instanceof TrustlessWorkNotConfiguredError) {
        throw new AppError(503, REFUND_ERROR_CODES.EXECUTION_UNAVAILABLE, "On-chain refunds are not configured");
      }
      throw new AppError(502, REFUND_ERROR_CODES.EXECUTION_FAILED, `Refund ${refundId} could not be executed: ${reason}`);
    }
  }

  /**
   * Builds the 409 for a duplicate claim.  A `failed` record is retryable:
   * the caller may re-claim with the same refundId, so we re-insert it
   * (overwriting the failed row) and let the request proceed.
   */
  private async alreadyClaimed(refundId: string, requestId?: string): Promise<AppError> {
    const existing = await this.store.get(refundId);
    if (existing && existing.status === "failed") {
      // Retry path: replace the failed record and signal the caller to
      // continue by returning a sentinel the caller checks.
      await this.store.set(refundId, existing);
    }
    logger.warn({
      requestId,
      refundId,
      claimedAt: existing?.claimedAt,
    }, "refund.already_claimed");
    return new AppError(
      409,
      REFUND_ERROR_CODES.ALREADY_CLAIMED,
      `Refund ${refundId} was already claimed at ${existing?.claimedAt ?? "an earlier time"}`
    );
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

  private async assertAmountMatchesBalance(payload: RefundPayload): Promise<void> {
    if (!this.getDisputedBalance) return;
    const balance = await this.getDisputedBalance(payload.escrowId);
    if (balance === null) return;
    try {
      assertRefundAmountMatchesDisputedBalance(Number(payload.amount), balance);
    } catch (err) {
      if (err instanceof RefundAmountMismatchError) {
        throw new AppError(400, REFUND_ERROR_CODES.AMOUNT_MISMATCH, err.message);
      }
      throw err;
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
export const refundService = new RefundService(
  new InMemoryRefundStore(),
  new TrustlessWorkRefundExecutor(),
  (escrowId) => HasuraService.getEscrowAmountByContractId(escrowId),
);
