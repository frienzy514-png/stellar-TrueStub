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
 */

import { AppError } from "../middleware/errorHandler";

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
  resolvedAt?: string;
  resolution?: string;
}

export const DISPUTE_ERROR_CODES = {
  NOT_FOUND: "DISPUTE_NOT_FOUND",
  ALREADY_EXISTS: "DISPUTE_ALREADY_EXISTS",
  INVALID_TRANSITION: "DISPUTE_INVALID_TRANSITION",
  ALREADY_FINAL: "DISPUTE_ALREADY_FINAL",
  INVALID_PAYLOAD: "DISPUTE_INVALID_PAYLOAD",
} as const;

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
}

export class InMemoryDisputeStore implements DisputeStore {
  private readonly store = new Map<string, Dispute>();

  async get(disputeId: string): Promise<Dispute | undefined> {
    return this.store.get(disputeId);
  }

  async set(disputeId: string, dispute: Dispute): Promise<void> {
    this.store.set(disputeId, dispute);
  }

  async listByEscrow(escrowId: string): Promise<Dispute[]> {
    const results: Dispute[] = [];
    for (const d of this.store.values()) {
      if (d.escrowId === escrowId) results.push(d);
    }
    return results;
  }

  get size(): number {
    return this.store.size;
  }
}

// ── Service ────────────────────────────────────────────────────────────────

export class DisputeService {
  constructor(private readonly store: DisputeStore = new InMemoryDisputeStore()) {}

  /**
   * Opens a new dispute in OPEN state.
   *
   * Duplicate `disputeId` values are rejected with DISPUTE_ALREADY_EXISTS (409).
   */
  async openDispute(payload: {
    disputeId: string;
    escrowId: string;
    raisedBy: string;
    reason: string;
  }): Promise<Dispute> {
    const { disputeId, escrowId, raisedBy, reason } = payload;

    if (!disputeId || !escrowId || !raisedBy || !reason) {
      throw new AppError(
        400,
        DISPUTE_ERROR_CODES.INVALID_PAYLOAD,
        "disputeId, escrowId, raisedBy, and reason are required"
      );
    }

    const existing = await this.store.get(disputeId);
    if (existing) {
      throw new AppError(
        409,
        DISPUTE_ERROR_CODES.ALREADY_EXISTS,
        `Dispute ${disputeId} already exists with state: ${existing.state}`
      );
    }

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

    await this.store.set(disputeId, dispute);
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
    opts?: { resolution?: string }
  ): Promise<Dispute> {
    if (!disputeId) {
      throw new AppError(400, DISPUTE_ERROR_CODES.INVALID_PAYLOAD, "disputeId is required");
    }

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
          `Valid events from ${dispute.state}: ${Object.keys(DISPUTE_TRANSITIONS[dispute.state]).join(", ") || "none"}`
      );
    }

    const now = new Date().toISOString();
    const updated: Dispute = {
      ...dispute,
      state: nextState,
      updatedAt: now,
      ...(nextState === "RESOLVED"
        ? { resolvedAt: now, resolution: opts?.resolution }
        : {}),
    };

    await this.store.set(disputeId, updated);
    return updated;
  }

  /** Returns the current state without side effects. */
  async getDispute(disputeId: string): Promise<Dispute | undefined> {
    return this.store.get(disputeId);
  }

  /** Lists all disputes for an escrow. */
  async listDisputesByEscrow(escrowId: string): Promise<Dispute[]> {
    return this.store.listByEscrow(escrowId);
  }
}

// Singleton shared by routes
export const disputeService = new DisputeService();
