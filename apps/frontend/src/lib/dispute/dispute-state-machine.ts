/**
 * Dispute State Machine — closes #654
 *
 * Defines and enforces all valid dispute lifecycle transitions for TrueStub
 * escrow contracts.
 *
 * ## State diagram
 *
 * ```
 *   NONE ──────────────────────────────────────────────────────────────────▶
 *    │
 *    │ openDispute()
 *    ▼
 *   OPEN ──────────────────────────────────────────────────────────────────▶
 *    │          │                 │
 *    │          │ escalate()      │ withdraw()
 *    │          ▼                 ▼
 *    │       ESCALATED ──────▶ WITHDRAWN_BY_CLAIMANT (terminal)
 *    │          │
 *    │          │ resolve()
 *    ▼          ▼
 *   RESOLVED  (terminal — valid from OPEN or ESCALATED)
 *    │
 *    └─ (buyer wins) ──▶ REFUNDED (terminal)
 *    └─ (seller wins) ──▶ RELEASED (terminal)
 *    └─ (split)       ──▶ RESOLVED (terminal)
 * ```
 *
 * All terminal states: RESOLVED, REFUNDED, RELEASED, WITHDRAWN_BY_CLAIMANT.
 *
 * ## Valid transitions table
 *
 * | From                    | Action          | To                       |
 * |-------------------------|-----------------|--------------------------|
 * | NONE                    | openDispute     | OPEN                     |
 * | OPEN                    | escalate        | ESCALATED                |
 * | OPEN                    | resolve         | RESOLVED / REFUNDED / RELEASED |
 * | OPEN                    | withdraw        | WITHDRAWN_BY_CLAIMANT    |
 * | ESCALATED               | resolve         | RESOLVED / REFUNDED / RELEASED |
 * | *any terminal*          | *any*           | InvalidDisputeTransition |
 *
 * ## Outcome-to-final-state mapping
 * | resolveOutcome      | final state |
 * |---------------------|-------------|
 * | 'buyer_wins'        | REFUNDED    |
 * | 'seller_wins'       | RELEASED    |
 * | 'split' / undefined | RESOLVED    |
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type DisputeState =
  | 'NONE'
  | 'OPEN'
  | 'ESCALATED'
  | 'RESOLVED'
  | 'REFUNDED'
  | 'RELEASED'
  | 'WITHDRAWN_BY_CLAIMANT';

export type DisputeAction =
  | 'openDispute'
  | 'escalate'
  | 'resolve'
  | 'withdraw';

export type ResolveOutcome = 'buyer_wins' | 'seller_wins' | 'split';

/** All states from which no further transitions are allowed. */
export const TERMINAL_DISPUTE_STATES = new Set<DisputeState>([
  'RESOLVED',
  'REFUNDED',
  'RELEASED',
  'WITHDRAWN_BY_CLAIMANT',
]);

/** A snapshot of an active (or historical) dispute. */
export interface DisputeRecord {
  contractId: string;
  state: DisputeState;
  openedAt?: Date;
  resolvedAt?: Date;
  openedBy: string;        // wallet address of the party that raised the dispute
  resolvedBy?: string;     // wallet address of the resolver / arbitrator
  reason?: string;         // free-text reason supplied at opening
  outcome?: ResolveOutcome;
  txHashOpen?: string;
  txHashResolve?: string;
  escalationNote?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Thrown when a caller attempts a state transition that is not permitted by
 * the dispute state machine.
 */
export class InvalidDisputeTransitionError extends Error {
  readonly code = 'INVALID_DISPUTE_TRANSITION' as const;
  readonly contractId: string;
  readonly fromState: DisputeState;
  readonly action: DisputeAction;

  constructor(contractId: string, fromState: DisputeState, action: DisputeAction) {
    super(
      `Invalid dispute transition: cannot '${action}' from state '${fromState}' on contract ${contractId}.`
    );
    this.name = 'InvalidDisputeTransitionError';
    this.contractId = contractId;
    this.fromState = fromState;
    this.action = action;
    Object.setPrototypeOf(this, InvalidDisputeTransitionError.prototype);
  }
}

export class DisputeNotFoundError extends Error {
  readonly code = 'DISPUTE_NOT_FOUND' as const;
  readonly contractId: string;

  constructor(contractId: string) {
    super(`No dispute record found for contract ${contractId}.`);
    this.name = 'DisputeNotFoundError';
    this.contractId = contractId;
    Object.setPrototypeOf(this, DisputeNotFoundError.prototype);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Transition validation — pure, export for docs / tests
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Allowed state transitions. Maps (currentState, action) → nextState.
 *
 * Only transitions listed here are valid; everything else throws
 * `InvalidDisputeTransitionError`.
 */
export const DISPUTE_TRANSITIONS: Readonly<
  Partial<Record<DisputeState, Partial<Record<DisputeAction, DisputeState | ((outcome?: ResolveOutcome) => DisputeState)>>>>
> = {
  NONE: {
    openDispute: 'OPEN',
  },
  OPEN: {
    escalate: 'ESCALATED',
    resolve: (outcome?: ResolveOutcome) => resolveOutcomeToState(outcome),
    withdraw: 'WITHDRAWN_BY_CLAIMANT',
  },
  ESCALATED: {
    resolve: (outcome?: ResolveOutcome) => resolveOutcomeToState(outcome),
  },
};

function resolveOutcomeToState(outcome?: ResolveOutcome): DisputeState {
  switch (outcome) {
    case 'buyer_wins':
      return 'REFUNDED';
    case 'seller_wins':
      return 'RELEASED';
    default:
      return 'RESOLVED';
  }
}

/**
 * Returns `true` if `action` can be performed from `state`.
 */
export function isValidDisputeTransition(
  state: DisputeState,
  action: DisputeAction
): boolean {
  if (TERMINAL_DISPUTE_STATES.has(state)) return false;
  const allowed = DISPUTE_TRANSITIONS[state];
  return allowed != null && action in allowed;
}

// ─────────────────────────────────────────────────────────────────────────────
// In-memory store (module-singleton)
// ─────────────────────────────────────────────────────────────────────────────

/** @internal — exported only for test introspection. */
export const _disputeStore = new Map<string, DisputeRecord>();

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the current dispute state for `contractId`, defaulting to `'NONE'`.
 */
export function getDisputeState(contractId: string): DisputeState {
  return _disputeStore.get(contractId)?.state ?? 'NONE';
}

/**
 * Returns the full dispute record, or `undefined` if no dispute has been opened.
 */
export function getDisputeRecord(contractId: string): DisputeRecord | undefined {
  return _disputeStore.get(contractId);
}

/**
 * Opens a new dispute for `contractId`.
 *
 * @throws {InvalidDisputeTransitionError} if a dispute already exists (state ≠ NONE).
 */
export function openDispute(
  contractId: string,
  openedBy: string,
  options: { reason?: string; txHash?: string } = {}
): DisputeRecord {
  _assertTransition(contractId, 'openDispute');

  const record: DisputeRecord = {
    contractId,
    state: 'OPEN',
    openedAt: new Date(),
    openedBy,
    reason: options.reason,
    txHashOpen: options.txHash,
  };

  _disputeStore.set(contractId, record);
  return { ...record };
}

/**
 * Escalates an OPEN dispute to ESCALATED.
 *
 * @throws {InvalidDisputeTransitionError} if dispute is not OPEN.
 */
export function escalateDispute(
  contractId: string,
  options: { escalationNote?: string } = {}
): DisputeRecord {
  _assertTransition(contractId, 'escalate');

  const record = _requireRecord(contractId);
  const updated: DisputeRecord = {
    ...record,
    state: 'ESCALATED',
    escalationNote: options.escalationNote,
  };

  _disputeStore.set(contractId, updated);
  return { ...updated };
}

/**
 * Resolves a dispute from OPEN or ESCALATED.
 *
 * `outcome` determines the terminal state:
 * - `'buyer_wins'`  → REFUNDED
 * - `'seller_wins'` → RELEASED
 * - `'split'` / omitted → RESOLVED
 *
 * @throws {InvalidDisputeTransitionError} if the transition is not allowed.
 */
export function resolveDispute(
  contractId: string,
  resolvedBy: string,
  options: { outcome?: ResolveOutcome; txHash?: string } = {}
): DisputeRecord {
  _assertTransition(contractId, 'resolve');

  const record = _requireRecord(contractId);
  const nextState = resolveOutcomeToState(options.outcome);

  const updated: DisputeRecord = {
    ...record,
    state: nextState,
    resolvedAt: new Date(),
    resolvedBy,
    outcome: options.outcome,
    txHashResolve: options.txHash,
  };

  _disputeStore.set(contractId, updated);
  return { ...updated };
}

/**
 * Claimant withdraws an OPEN dispute (no arbitration needed).
 *
 * @throws {InvalidDisputeTransitionError} if dispute is not OPEN.
 */
export function withdrawDispute(
  contractId: string,
  withdrawnBy: string
): DisputeRecord {
  _assertTransition(contractId, 'withdraw');

  const record = _requireRecord(contractId);
  const updated: DisputeRecord = {
    ...record,
    state: 'WITHDRAWN_BY_CLAIMANT',
    resolvedAt: new Date(),
    resolvedBy: withdrawnBy,
  };

  _disputeStore.set(contractId, updated);
  return { ...updated };
}

/**
 * Re-hydrates a dispute record from an external source on startup.
 * Overwrites any existing in-memory record for the same `contractId`.
 */
export function registerDisputeRecord(record: DisputeRecord): void {
  _disputeStore.set(record.contractId, { ...record });
}

/**
 * Clears all dispute records.  Call on logout / test teardown.
 */
export function clearAllDisputes(): void {
  _disputeStore.clear();
}

// ─────────────────────────────────────────────────────────────────────────────
// Private helpers
// ─────────────────────────────────────────────────────────────────────────────

function _assertTransition(contractId: string, action: DisputeAction): void {
  const currentState = getDisputeState(contractId);
  if (!isValidDisputeTransition(currentState, action)) {
    throw new InvalidDisputeTransitionError(contractId, currentState, action);
  }
}

function _requireRecord(contractId: string): DisputeRecord {
  const record = _disputeStore.get(contractId);
  if (!record) throw new DisputeNotFoundError(contractId);
  return record;
}
