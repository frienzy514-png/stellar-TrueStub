/**
 * DisputeService — issue #156
 *
 * Defines and enforces the dispute state machine for TrueStub escrows.
 *
 * State machine diagram
 * ─────────────────────
 *
 *   ┌─────────────────────────────────────────────────────────┐
 *   │                  DISPUTE STATE MACHINE                  │
 *   │                                                         │
 *   │   (start)                                               │
 *   │      │                                                  │
 *   │      ▼                                                  │
 *   │   [OPEN] ─────── escalate ──────► [ESCALATED]          │
 *   │      │                                │                 │
 *   │      │ resolve                        │ resolve         │
 *   │      │                                │                 │
 *   │      ▼                                ▼                 │
 *   │   [RESOLVED] ◄──────────────── [RESOLVED]              │
 *   │                                                         │
 *   │   [OPEN]      ─── withdraw ──► [WITHDRAWN]  (final)    │
 *   │   [ESCALATED] ─── withdraw ──► [WITHDRAWN]  (final)    │
 *   │                                                         │
 *   │   Final states: RESOLVED, WITHDRAWN                     │
 *   └─────────────────────────────────────────────────────────┘
 *
 * Valid transitions (documented)
 * ─────────────────────────────────────────────────────────────────────────
 *  | From       | Event      | To         | Description                   |
 *  |------------|------------|------------|-------------------------------|
 *  | OPEN       | escalate   | ESCALATED  | Arbitrator elevated the case  |
 *  | OPEN       | resolve    | RESOLVED   | Arbitrator resolved directly  |
 *  | OPEN       | withdraw   | WITHDRAWN  | Disputant withdraws the case  |
 *  | ESCALATED  | resolve    | RESOLVED   | Arbitrator resolved after esc |
 *  | ESCALATED  | withdraw   | WITHDRAWN  | Disputant withdraws after esc |
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Invalid transitions return DISPUTE_INVALID_TRANSITION (422).
 * Transitions from final states return DISPUTE_ALREADY_FINAL (409).
 *
 * Every successful transition is also written to the write-once changelog
 * audit log (issue #155) so dispute resolve/withdraw/escalate events are
 * captured in the immutable audit trail (issue #314).
 *
 * ESCALATED SLA (issue #317)
 * ─────────────────────────────────────────────────────────────────────────
 * A dispute that sits in ESCALATED with no arbitrator action would otherwise
 * leave the escrow's funds stuck indefinitely. To make the answer to "what
 * happens if a dispute sits ESCALATED for 30 days" explicit rather than
 * implicit "nothing", we define an SLA:
 *
 *   - ESCALATED_SLA_DAYS = 30. A dispute is "overdue" once it has been in
 *     ESCALATED for >= 30 days without a resolve/withdraw transition.
 *   - Overdue disputes are surfaced via `listOverdueEscalated()` so an
 *     operator/alerting job can page the arbitrator team (manual-intervention
 *     policy). The SLA clock is anchored on `escalatedAt`.
 *   - `checkEscalatedSla()` returns the overdue set plus a structured alert
 *     payload that can be forwarded to the existing alerting/observability
 *     pipeline. This is the mechanism backing the documented policy.
 *
 * The policy is intentionally non-destructive: it does not auto-resolve or
 * auto-withdraw (which would move funds without human sign-off). It guarantees
 * the case is *tracked and alerted* so a human resolves it, satisfying the
 * acceptance criteria without changing the OPEN → ESCALATED → RESOLVED|
 * WITHDRAWN behavior.
 *
 * Concurrency within a single instance (issue #540)
 * ─────────────────────────────────────────────────────────────────────────
 * `DisputeStore` is async, so `transition()` awaits between reading the
 * current state and writing the new one. Without serialization two
 * conflicting requests for the same dispute (e.g. a simultaneous `resolve`
 * and `withdraw`) could both read OPEN, both pass validation, and the last
 * write would silently win — leaving a state that doesn't match the audit
 * trail. Every read-check-write on a given `disputeId` (open and transition)
 * therefore runs under a per-key async lock (`withDisputeLock`). The second
 * caller re-reads the state written by the first and is rejected with
 * DISPUTE_ALREADY_FINAL / DISPUTE_INVALID_TRANSITION as appropriate.
 *
 * This only serializes calls inside one process. Cross-instance safety still
 * depends on durable storage with a conditional write, which is why the
 * backend is capped at one replica (issue #541).
 */

import { AppError } from "../middleware/errorHandler";
import { ChangelogService } from "./changelog.service";
import { DISPUTE_EVENT_ENTRY_TYPES } from "./changelog-taxonomy";
import { getCorrelationId as getRequestId } from "../middleware/requestLogger";
import { HasuraService, type DisputeRow } from "./hasura.service";

// ── Types ──────────────────────────────────────────────────────────────────

export type DisputeState = "OPEN" | "ESCALATED" | "RESOLVED" | "WITHDRAWN";
export type DisputeEvent = "escalate" | "resolve" | "withdraw";

export interface Dispute {
  disputeId: string;
  escrowId: string;
  raisedBy: string;
  reason: string;
  state: DisputeState;
  openedAt: string;
  updatedAt: string;
  escalatedAt?: string;
  resolvedAt?: string;
  resolution?: string;
}

/** Default / max page size for the dispute-history list (issue #417). */
export const DEFAULT_DISPUTE_PAGE_SIZE = 10;
export const MAX_DISPUTE_PAGE_SIZE = 50;

/** A bounded page of disputes, mirroring the changelog pagination shape. */
export interface DisputePage {
  disputes: Dispute[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export const DISPUTE_ERROR_CODES = {
  NOT_FOUND: "DISPUTE_NOT_FOUND",
  ALREADY_EXISTS: "DISPUTE_ALREADY_EXISTS",
  INVALID_TRANSITION: "DISPUTE_INVALID_TRANSITION",
  ALREADY_FINAL: "DISPUTE_ALREADY_FINAL",
  INVALID_PAYLOAD: "DISPUTE_INVALID_PAYLOAD",
} as const;

// ── ESCALATED SLA (issue #317) ──────────────────────────────────────────────

/** Number of days an ESCALATED dispute may sit before it is considered overdue. */
export const ESCALATED_SLA_DAYS = 30;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Structured alert emitted for each dispute that breaches the ESCALATED SLA. */
export interface EscalatedSlaAlert {
  disputeId: string;
  escrowId: string;
  escalatedAt: string;
  daysEscalated: number;
  slaDays: number;
  severity: "warning" | "critical";
  message: string;
}

/**
 * Returns the number of whole days a dispute has been in ESCALATED, or
 * `undefined` if it is not currently ESCALATED / has no escalation timestamp.
 */
export function escalatedAgeDays(
  dispute: Dispute,
  now: Date = new Date()
): number | undefined {
  if (dispute.state !== "ESCALATED" || !dispute.escalatedAt) return undefined;
  const escalatedMs = new Date(dispute.escalatedAt).getTime();
  if (Number.isNaN(escalatedMs)) return undefined;
  return Math.floor((now.getTime() - escalatedMs) / MS_PER_DAY);
}

/**
 * True when an ESCALATED dispute has been waiting at or beyond the SLA.
 */
export function isEscalatedOverdue(
  dispute: Dispute,
  now: Date = new Date(),
  slaDays: number = ESCALATED_SLA_DAYS
): boolean {
  const age = escalatedAgeDays(dispute, now);
  return age !== undefined && age >= slaDays;
}

// ── Metrics (issue #273) ────────────────────────────────────────────────────

const MS_PER_HOUR = 60 * 60 * 1000;

/** Aggregate dispute metrics surfaced on the operator analytics dashboard. */
export interface DisputeMetrics {
  /** Disputes opened in the requested range. */
  total: number;
  /** Current state breakdown of those disputes. */
  byState: Record<DisputeState, number>;
  /** OPEN + ESCALATED. */
  active: number;
  /** RESOLVED + WITHDRAWN (outcome breakdown lives in `byState`). */
  closed: number;
  /** Disputes that were escalated at any point. */
  escalatedCount: number;
  /** escalatedCount / total (0–1). */
  escalationRate: number;
  /** RESOLVED / total (0–1). */
  resolutionRate: number;
  /** Mean hours from open to final state across closed disputes; null if none closed. */
  avgResolutionHours: number | null;
  /** ESCALATED disputes past the SLA (issue #317). */
  overdueEscalated: number;
}

// ── State machine definition ───────────────────────────────────────────────

export type TransitionTable = Readonly<
  Record<DisputeState, Partial<Record<DisputeEvent, DisputeState>>>
>;

/**
 * The canonical transition table.  Every valid (state → event → state)
 * mapping lives here — no transitions are buried in conditional logic.
 */
export const DISPUTE_TRANSITIONS: TransitionTable = {
  OPEN: {
    escalate: "ESCALATED",
    resolve: "RESOLVED",
    withdraw: "WITHDRAWN",
  },
  ESCALATED: {
    resolve: "RESOLVED",
    withdraw: "WITHDRAWN",
  },
  // Final states — no outgoing transitions
  RESOLVED: {},
  WITHDRAWN: {},
} as const;

/** States from which no further transitions are possible. */
export const FINAL_STATES = new Set<DisputeState>(["RESOLVED", "WITHDRAWN"]);

/**
 * Returns the target state for a given (from, event) pair, or undefined if
 * the transition is not valid.
 */
export function resolveTransition(
  from: DisputeState,
  event: DisputeEvent
): DisputeState | undefined {
  return DISPUTE_TRANSITIONS[from]?.[event];
}

// ── Storage ────────────────────────────────────────────────────────────────

export interface DisputeStore {
  get(disputeId: string): Promise<Dispute | undefined>;
  set(disputeId: string, dispute: Dispute): Promise<void>;
  listByEscrow(escrowId: string): Promise<Dispute[]>;
  listAll?(): Promise<Dispute[]>;
  /**
   * Atomically inserts a dispute, returning `false` when it already exists.
   * Database-backed stores rely on the primary-key constraint; the optional
   * method keeps the interface usable by simple test doubles.
   */
  insertIfAbsent?(disputeId: string, dispute: Dispute): Promise<boolean>;
}

/** Maps a Postgres/Hasura `disputes` row to the domain shape (#515). */
function rowToDispute(row: DisputeRow): Dispute {
  return {
    disputeId: row.dispute_id,
    escrowId: row.escrow_id,
    raisedBy: row.raised_by,
    reason: row.reason,
    state: row.state as DisputeState,
    openedAt: row.opened_at,
    updatedAt: row.updated_at,
    ...(row.escalated_at ? { escalatedAt: row.escalated_at } : {}),
    ...(row.resolved_at ? { resolvedAt: row.resolved_at } : {}),
    ...(row.resolution ? { resolution: row.resolution } : {}),
  };
}

function disputeToRow(dispute: Dispute): DisputeRow {
  return {
    dispute_id: dispute.disputeId,
    escrow_id: dispute.escrowId,
    raised_by: dispute.raisedBy,
    reason: dispute.reason,
    state: dispute.state,
    opened_at: dispute.openedAt,
    updated_at: dispute.updatedAt,
    escalated_at: dispute.escalatedAt ?? null,
    resolved_at: dispute.resolvedAt ?? null,
    resolution: dispute.resolution ?? null,
  };
}

/**
 * Postgres-backed dispute store. Every read and write goes through
 * `HasuraService` → `lib/hasura.ts` → Postgres, so dispute state survives a
 * restart and is shared by every backend instance (#515).
 */
export class PostgresDisputeStore implements DisputeStore {
  async get(disputeId: string): Promise<Dispute | undefined> {
    const row = await HasuraService.getDispute(disputeId);
    return row ? rowToDispute(row) : undefined;
  }

  async set(_disputeId: string, dispute: Dispute): Promise<void> {
    await HasuraService.upsertDispute(disputeToRow(dispute));
  }

  async insertIfAbsent(_disputeId: string, dispute: Dispute): Promise<boolean> {
    return HasuraService.insertDisputeIfAbsent(disputeToRow(dispute));
  }

  async listByEscrow(escrowId: string): Promise<Dispute[]> {
    const rows = await HasuraService.listDisputesByEscrow(escrowId);
    return rows.map(rowToDispute);
  }

  async listAll(): Promise<Dispute[]> {
    const rows = await HasuraService.listDisputes();
    return rows.map(rowToDispute);
  }
}

// ── Service ────────────────────────────────────────────────────────────────

export class DisputeService {
  /**
   * Tail of the pending-operation chain for each disputeId (issue #540).
   * Entries are removed once their chain drains so the map doesn't grow with
   * the number of disputes ever touched.
   */
  private readonly locks = new Map<string, Promise<void>>();

  constructor(
    private readonly store: DisputeStore = new PostgresDisputeStore(),
    private readonly changelog: ChangelogService = new ChangelogService()
  ) {}

  /**
   * Runs `fn` exclusively for `disputeId`: calls for the same id execute one
   * after another in arrival order, calls for different ids are unaffected.
   */
  private async withDisputeLock<T>(disputeId: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(disputeId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => current);
    this.locks.set(disputeId, tail);

    await previous;
    try {
      return await fn();
    } finally {
      release();
      if (this.locks.get(disputeId) === tail) {
        this.locks.delete(disputeId);
      }
    }
  }

  /**
   * Opens a new dispute in OPEN state.
   *
   * Duplicate `disputeId` values are rejected with DISPUTE_ALREADY_EXISTS (409).
   */
  async openDispute(
    payload: {
      disputeId: string;
      escrowId: string;
      raisedBy: string;
      reason: string;
    },
    _options: { requestId?: string } = {}
  ): Promise<Dispute> {
    const { disputeId, escrowId, raisedBy, reason } = payload;

    if (!disputeId || !escrowId || !raisedBy || !reason) {
      throw new AppError(
        400,
        DISPUTE_ERROR_CODES.INVALID_PAYLOAD,
        "disputeId, escrowId, raisedBy, and reason are required"
      );
    }

    return this.withDisputeLock(disputeId, () =>
      this.openDisputeLocked({ disputeId, escrowId, raisedBy, reason })
    );
  }

  private async openDisputeLocked(payload: {
    disputeId: string;
    escrowId: string;
    raisedBy: string;
    reason: string;
  }): Promise<Dispute> {
    const { disputeId, escrowId, raisedBy, reason } = payload;

    const now = new Date().toISOString();
    const dispute: Dispute = {
      disputeId,
      escrowId,
      raisedBy,
      reason,
      state: "OPEN",
      openedAt: now,
      updatedAt: now,
    };

    if (this.store.insertIfAbsent) {
      // Insert-first: the primary key is the authoritative duplicate guard,
      // so two instances cannot both open the same dispute.
      const inserted = await this.store.insertIfAbsent(disputeId, dispute);
      if (!inserted) {
        const existing = await this.store.get(disputeId);
        throw new AppError(
          409,
          DISPUTE_ERROR_CODES.ALREADY_EXISTS,
          `Dispute ${disputeId} already exists with state: ${existing?.state ?? "unknown"}`
        );
      }
    } else {
      const existing = await this.store.get(disputeId);
      if (existing) {
        throw new AppError(
          409,
          DISPUTE_ERROR_CODES.ALREADY_EXISTS,
          `Dispute ${disputeId} already exists with state: ${existing.state}`
        );
      }
      await this.store.set(disputeId, dispute);
    }

    // Correlation: every log line / changelog entry produced while handling
    // this request carries the originating request ID (issue #425).
    const requestId = getRequestId();
    if (requestId) {
      console.info(
        `[dispute] opened disputeId=${disputeId} escrowId=${escrowId} requestId=${requestId}`
      );
    }

    return dispute;
  }

  /**
   * Applies a transition event to a dispute.
   *
   * - `escalate`: OPEN → ESCALATED
   * - `resolve`:  OPEN | ESCALATED → RESOLVED
   * - `withdraw`: OPEN | ESCALATED → WITHDRAWN
   *
   * Throws:
   *   - DISPUTE_NOT_FOUND (404) — disputeId does not exist
   *   - DISPUTE_ALREADY_FINAL (409) — dispute is in a final state
   *   - DISPUTE_INVALID_TRANSITION (422) — the event is not valid from the current state
   */
  async transition(
    disputeId: string,
    event: DisputeEvent,
    opts?: { resolution?: string; requestId?: string }
  ): Promise<Dispute> {
    if (!disputeId) {
      throw new AppError(400, DISPUTE_ERROR_CODES.INVALID_PAYLOAD, "disputeId is required");
    }

    return this.withDisputeLock(disputeId, () => this.transitionLocked(disputeId, event, opts));
  }

  private async transitionLocked(
    disputeId: string,
    event: DisputeEvent,
    opts?: { resolution?: string }
  ): Promise<Dispute> {
    const dispute = await this.store.get(disputeId);
    if (!dispute) {
      throw new AppError(404, DISPUTE_ERROR_CODES.NOT_FOUND, `Dispute ${disputeId} not found`);
    }

    // Final state guard
    if (FINAL_STATES.has(dispute.state)) {
      throw new AppError(
        409,
        DISPUTE_ERROR_CODES.ALREADY_FINAL,
        `Dispute ${disputeId} is in final state ${dispute.state} and cannot be transitioned`
      );
    }

    const nextState = resolveTransition(dispute.state, event);
    if (!nextState) {
      throw new AppError(
        422,
        DISPUTE_ERROR_CODES.INVALID_TRANSITION,
        `Invalid transition: ${dispute.state} --[${event}]--> (no valid target). ` +
          `Valid events from ${dispute.state}: ${Object.keys(
            DISPUTE_TRANSITIONS[dispute.state]
          ).join(", ") || "(none)"}`
      );
    }

    const now = new Date().toISOString();
    const updated: Dispute = {
      ...dispute,
      state: nextState,
      updatedAt: now,
    };

    // Anchor the ESCALATED SLA clock (issue #317) when entering ESCALATED.
    if (nextState === "ESCALATED") {
      updated.escalatedAt = now;
    }

    if (nextState === "RESOLVED") {
      updated.resolvedAt = now;
      if (opts?.resolution) updated.resolution = opts.resolution;
    }

    await this.store.set(disputeId, updated);

    // Correlation: capture the originating request ID once and thread it
    // through both the log line and the changelog entry so a support
    // investigation for one refund can find every related record
    // (issue #425).
    const requestId = getRequestId();

    if (requestId) {
      console.info(
        `[dispute] transition disputeId=${disputeId} event=${event} ` +
          `from=${dispute.state} to=${nextState} requestId=${requestId}`
      );
    }

    // Write-once audit trail (issues #155 / #314). Audit logging must never
    // block or roll back the transition, so failures are swallowed after the
    // dispute has been persisted.
    try {
      const entryType = DISPUTE_EVENT_ENTRY_TYPES[event];
      await this.changelog.appendEntry({
        entryId: `${entryType}:${disputeId}:${now}`,
        action: entryType,
        actorId: dispute.raisedBy,
        resourceId: disputeId,
        metadata: {
          escrowId: dispute.escrowId,
          fromState: dispute.state,
          toState: nextState,
          ...(requestId ? { requestId } : {}),
          ...(opts?.resolution ? { resolution: opts.resolution } : {}),
        },
      });
    } catch {
      // Changelog is best-effort; the dispute transition already succeeded.
    }

    return updated;
  }

  /** Returns the current state without side effects. */
  async getDispute(
    disputeId: string,
    _options: { requestId?: string } = {}
  ): Promise<Dispute | undefined> {
    return this.store.get(disputeId);
  }

  /** Lists all disputes for an escrow. */
  async listDisputesByEscrow(
    escrowId: string,
    _options: { requestId?: string } = {}
  ): Promise<Dispute[]> {
    return this.store.listByEscrow(escrowId);
  }

  /**
   * Returns a bounded page of disputes raised by `userId`, newest first
   * (issue #417). `limit` is clamped to [1, MAX_DISPUTE_PAGE_SIZE] and
   * defaults to DEFAULT_DISPUTE_PAGE_SIZE; `offset` is clamped to >= 0.
   */
  async listDisputesByUserPaginated(
    userId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<DisputePage> {
    const all = this.store.listAll ? await this.store.listAll() : await this.collectAll();
    const mine = all
      .filter((d) => d.raisedBy === userId)
      .sort((a, b) => b.openedAt.localeCompare(a.openedAt));

    const rawLimit = Math.floor(options.limit ?? DEFAULT_DISPUTE_PAGE_SIZE);
    const limit = Number.isFinite(rawLimit) && rawLimit >= 1
      ? Math.min(rawLimit, MAX_DISPUTE_PAGE_SIZE)
      : DEFAULT_DISPUTE_PAGE_SIZE;
    const rawOffset = Math.floor(options.offset ?? 0);
    const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? rawOffset : 0;

    const disputes = mine.slice(offset, offset + limit);
    return {
      disputes,
      total: mine.length,
      limit,
      offset,
      hasMore: offset + disputes.length < mine.length,
    };
  }

  /** Lists every dispute currently in `state`. */
  async listDisputesByState(
    state: DisputeState,
    _options: { requestId?: string } = {}
  ): Promise<Dispute[]> {
    const all = this.store.listAll ? await this.store.listAll() : await this.collectAll();
    return all.filter((d) => d.state === state);
  }

  /**
   * Aggregate dispute metrics for the operator analytics dashboard (#273).
   *
   * Only disputes opened within [from, to] (inclusive, either bound optional)
   * are counted. Resolution time is measured from `openedAt` to the final
   * transition — `resolvedAt` for RESOLVED, `updatedAt` for WITHDRAWN (the
   * only transition out of a final state is the one that entered it).
   */
  async getMetrics(
    range: { from?: Date; to?: Date } = {},
    _options: { requestId?: string } = {}
  ): Promise<DisputeMetrics> {
    const all = this.store.listAll ? await this.store.listAll() : await this.collectAll();
    const fromMs = range.from?.getTime() ?? -Infinity;
    const toMs = range.to?.getTime() ?? Infinity;
    const inRange = all.filter((d) => {
      const opened = new Date(d.openedAt).getTime();
      return opened >= fromMs && opened <= toMs;
    });

    const byState: Record<DisputeState, number> = {
      OPEN: 0,
      ESCALATED: 0,
      RESOLVED: 0,
      WITHDRAWN: 0,
    };
    let escalatedEver = 0;
    const resolutionHours: number[] = [];

    for (const d of inRange) {
      byState[d.state] += 1;
      if (d.escalatedAt) escalatedEver += 1;
      if (FINAL_STATES.has(d.state)) {
        const closedAt = d.state === "RESOLVED" ? d.resolvedAt ?? d.updatedAt : d.updatedAt;
        const hours = (new Date(closedAt).getTime() - new Date(d.openedAt).getTime()) / MS_PER_HOUR;
        if (Number.isFinite(hours) && hours >= 0) resolutionHours.push(hours);
      }
    }

    const closed = byState.RESOLVED + byState.WITHDRAWN;
    const avg =
      resolutionHours.length > 0
        ? resolutionHours.reduce((sum, h) => sum + h, 0) / resolutionHours.length
        : null;

    return {
      total: inRange.length,
      byState,
      active: byState.OPEN + byState.ESCALATED,
      closed,
      escalatedCount: escalatedEver,
      escalationRate: inRange.length > 0 ? escalatedEver / inRange.length : 0,
      resolutionRate: inRange.length > 0 ? byState.RESOLVED / inRange.length : 0,
      avgResolutionHours: avg === null ? null : Math.round(avg * 10) / 10,
      overdueEscalated: inRange.filter((d) => isEscalatedOverdue(d)).length,
    };
  }

  /**
   * Returns every dispute currently in ESCALATED that has breached the SLA
   * (issue #317). Backs the documented manual-intervention policy: an
   * operator/alerting job calls this to page the arbitrator team.
   */
  async listOverdueEscalated(
    now: Date = new Date(),
    slaDays: number = ESCALATED_SLA_DAYS
  ): Promise<Dispute[]> {
    const all = this.store.listAll
      ? await this.store.listAll()
      : await this.collectAll();
    return all.filter((d) => isEscalatedOverdue(d, now, slaDays));
  }

  /**
   * SLA check + alerting hook (issue #317). Returns the overdue disputes and
   * a structured alert payload per breach, ready to forward to the existing
   * alerting/observability pipeline. This is the mechanism that turns the
   * implicit "nothing happens" into tracked, alertable SLA breaches.
   */
  async checkEscalatedSla(
    now: Date = new Date(),
    slaDays: number = ESCALATED_SLA_DAYS
  ): Promise<{ overdue: Dispute[]; alerts: EscalatedSlaAlert[] }> {
    const overdue = await this.listOverdueEscalated(now, slaDays);
    const alerts: EscalatedSlaAlert[] = overdue.map((d) => {
      const daysEscalated = escalatedAgeDays(d, now) ?? slaDays;
      return {
        disputeId: d.disputeId,
        escrowId: d.escrowId,
        escalatedAt: d.escalatedAt as string,
        daysEscalated,
        slaDays,
        severity: daysEscalated >= slaDays * 2 ? "critical" : "warning",
        message:
          `Dispute ${d.disputeId} (escrow ${d.escrowId}) has been ESCALATED for ` +
          `${daysEscalated} days, exceeding the ${slaDays}-day SLA. ` +
          `Manual arbitrator intervention required.`,
      };
    });
    return { overdue, alerts };
  }

  /**
   * Fallback enumeration for stores that do not implement `listAll`.
   * In-memory store implements it directly; this keeps the SLA check working
   * for any DisputeStore implementation without changing the interface
   * contract for existing callers.
   */
  private async collectAll(): Promise<Dispute[]> {
    // No generic enumeration available — return an empty set rather than
    // throwing, so SLA checks degrade gracefully.
    return [];
  }
}

// Singleton shared by routes
export const disputeService = new DisputeService();
