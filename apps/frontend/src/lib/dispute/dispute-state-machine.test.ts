/**
 * Tests for dispute-state-machine.ts — issue #654
 *
 * Verifies:
 * 1. openDispute transitions NONE → OPEN.
 * 2. escalateDispute transitions OPEN → ESCALATED.
 * 3. resolveDispute from OPEN/ESCALATED with all outcome variants.
 * 4. withdrawDispute transitions OPEN → WITHDRAWN_BY_CLAIMANT.
 * 5. All invalid transitions throw InvalidDisputeTransitionError with details.
 * 6. Terminal states reject any further action.
 * 7. isValidDisputeTransition correctly validates all combinations.
 * 8. getDisputeState defaults to NONE.
 * 9. registerDisputeRecord re-hydrates correctly.
 * 10. clearAllDisputes clears the store.
 * 11. State machine completeness: every valid (state, action) pair has a test.
 */

import {
  InvalidDisputeTransitionError,
  DisputeNotFoundError,
  openDispute,
  escalateDispute,
  resolveDispute,
  withdrawDispute,
  getDisputeState,
  getDisputeRecord,
  registerDisputeRecord,
  clearAllDisputes,
  isValidDisputeTransition,
  TERMINAL_DISPUTE_STATES,
  _disputeStore,
} from './dispute-state-machine';
import type { DisputeState, DisputeAction, ResolveOutcome } from './dispute-state-machine';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const CONTRACT_A = 'contract-dispute-aaa';
const CONTRACT_B = 'contract-dispute-bbb';
const ALICE = 'GALICE...BUYER';
const ARBITRATOR = 'GARBITRATOR...';

beforeEach(() => {
  clearAllDisputes();
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. openDispute — NONE → OPEN
// ─────────────────────────────────────────────────────────────────────────────

describe('openDispute()', () => {
  it('transitions state from NONE to OPEN', () => {
    expect(getDisputeState(CONTRACT_A)).toBe('NONE');
    const record = openDispute(CONTRACT_A, ALICE, { reason: 'ticket_not_delivered' });

    expect(record.state).toBe('OPEN');
    expect(record.openedBy).toBe(ALICE);
    expect(record.reason).toBe('ticket_not_delivered');
    expect(record.openedAt).toBeInstanceOf(Date);
  });

  it('stores optional txHash', () => {
    const record = openDispute(CONTRACT_A, ALICE, { txHash: 'tx-open-001' });
    expect(record.txHashOpen).toBe('tx-open-001');
  });

  it('throws InvalidDisputeTransitionError if already OPEN', () => {
    openDispute(CONTRACT_A, ALICE);
    expect(() => openDispute(CONTRACT_A, ALICE)).toThrow(InvalidDisputeTransitionError);
  });

  it('allows independent disputes on different contracts', () => {
    expect(() => openDispute(CONTRACT_A, ALICE)).not.toThrow();
    expect(() => openDispute(CONTRACT_B, ALICE)).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. escalateDispute — OPEN → ESCALATED
// ─────────────────────────────────────────────────────────────────────────────

describe('escalateDispute()', () => {
  it('transitions OPEN to ESCALATED', () => {
    openDispute(CONTRACT_A, ALICE);
    const record = escalateDispute(CONTRACT_A, { escalationNote: 'No response for 48h' });

    expect(record.state).toBe('ESCALATED');
    expect(record.escalationNote).toBe('No response for 48h');
  });

  it('throws when escalating from NONE', () => {
    expect(() => escalateDispute(CONTRACT_A)).toThrow(InvalidDisputeTransitionError);
  });

  it('throws when escalating from ESCALATED (already escalated)', () => {
    openDispute(CONTRACT_A, ALICE);
    escalateDispute(CONTRACT_A);
    expect(() => escalateDispute(CONTRACT_A)).toThrow(InvalidDisputeTransitionError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. resolveDispute — OPEN/ESCALATED → RESOLVED/REFUNDED/RELEASED
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveDispute()', () => {
  const outcomes: Array<{ outcome: ResolveOutcome | undefined; expectedState: DisputeState }> = [
    { outcome: 'buyer_wins', expectedState: 'REFUNDED' },
    { outcome: 'seller_wins', expectedState: 'RELEASED' },
    { outcome: 'split', expectedState: 'RESOLVED' },
    { outcome: undefined, expectedState: 'RESOLVED' },
  ];

  outcomes.forEach(({ outcome, expectedState }) => {
    it(`outcome '${outcome ?? 'undefined'}' → state '${expectedState}' (from OPEN)`, () => {
      openDispute(CONTRACT_A, ALICE);
      const record = resolveDispute(CONTRACT_A, ARBITRATOR, { outcome });

      expect(record.state).toBe(expectedState);
      expect(record.resolvedBy).toBe(ARBITRATOR);
      expect(record.resolvedAt).toBeInstanceOf(Date);
    });
  });

  it('resolves from ESCALATED with buyer_wins → REFUNDED', () => {
    openDispute(CONTRACT_A, ALICE);
    escalateDispute(CONTRACT_A);
    const record = resolveDispute(CONTRACT_A, ARBITRATOR, { outcome: 'buyer_wins' });

    expect(record.state).toBe('REFUNDED');
  });

  it('resolves from ESCALATED with seller_wins → RELEASED', () => {
    openDispute(CONTRACT_A, ALICE);
    escalateDispute(CONTRACT_A);
    const record = resolveDispute(CONTRACT_A, ARBITRATOR, { outcome: 'seller_wins' });

    expect(record.state).toBe('RELEASED');
  });

  it('stores txHash on resolution', () => {
    openDispute(CONTRACT_A, ALICE);
    const record = resolveDispute(CONTRACT_A, ARBITRATOR, {
      outcome: 'buyer_wins',
      txHash: 'tx-resolve-999',
    });
    expect(record.txHashResolve).toBe('tx-resolve-999');
  });

  it('throws when resolving from NONE', () => {
    expect(() => resolveDispute(CONTRACT_A, ARBITRATOR)).toThrow(
      InvalidDisputeTransitionError
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. withdrawDispute — OPEN → WITHDRAWN_BY_CLAIMANT
// ─────────────────────────────────────────────────────────────────────────────

describe('withdrawDispute()', () => {
  it('transitions OPEN to WITHDRAWN_BY_CLAIMANT', () => {
    openDispute(CONTRACT_A, ALICE);
    const record = withdrawDispute(CONTRACT_A, ALICE);

    expect(record.state).toBe('WITHDRAWN_BY_CLAIMANT');
    expect(record.resolvedBy).toBe(ALICE);
    expect(record.resolvedAt).toBeInstanceOf(Date);
  });

  it('throws when withdrawing from NONE', () => {
    expect(() => withdrawDispute(CONTRACT_A, ALICE)).toThrow(
      InvalidDisputeTransitionError
    );
  });

  it('throws when withdrawing from ESCALATED', () => {
    openDispute(CONTRACT_A, ALICE);
    escalateDispute(CONTRACT_A);
    expect(() => withdrawDispute(CONTRACT_A, ALICE)).toThrow(
      InvalidDisputeTransitionError
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. InvalidDisputeTransitionError details
// ─────────────────────────────────────────────────────────────────────────────

describe('InvalidDisputeTransitionError', () => {
  it('contains contractId, fromState, action, and code', () => {
    openDispute(CONTRACT_A, ALICE);
    resolveDispute(CONTRACT_A, ARBITRATOR); // → RESOLVED (terminal)

    try {
      resolveDispute(CONTRACT_A, ARBITRATOR);
      fail('Expected InvalidDisputeTransitionError');
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidDisputeTransitionError);
      const typed = err as InvalidDisputeTransitionError;
      expect(typed.contractId).toBe(CONTRACT_A);
      expect(typed.fromState).toBe('RESOLVED');
      expect(typed.action).toBe('resolve');
      expect(typed.code).toBe('INVALID_DISPUTE_TRANSITION');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Terminal states reject all actions
// ─────────────────────────────────────────────────────────────────────────────

describe('terminal states', () => {
  const terminalStates: DisputeState[] = [
    'RESOLVED',
    'REFUNDED',
    'RELEASED',
    'WITHDRAWN_BY_CLAIMANT',
  ];

  const actions: DisputeAction[] = ['openDispute', 'escalate', 'resolve', 'withdraw'];

  terminalStates.forEach((state) => {
    actions.forEach((action) => {
      it(`${state} + ${action} → rejected`, () => {
        expect(isValidDisputeTransition(state, action)).toBe(false);
      });
    });
  });

  it('TERMINAL_DISPUTE_STATES contains all terminal states', () => {
    terminalStates.forEach((s) => {
      expect(TERMINAL_DISPUTE_STATES.has(s)).toBe(true);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. isValidDisputeTransition — complete coverage
// ─────────────────────────────────────────────────────────────────────────────

describe('isValidDisputeTransition()', () => {
  // Valid transitions
  it.each<[DisputeState, DisputeAction]>([
    ['NONE', 'openDispute'],
    ['OPEN', 'escalate'],
    ['OPEN', 'resolve'],
    ['OPEN', 'withdraw'],
    ['ESCALATED', 'resolve'],
  ])('valid: %s + %s → true', (state, action) => {
    expect(isValidDisputeTransition(state, action)).toBe(true);
  });

  // Invalid transitions
  it.each<[DisputeState, DisputeAction]>([
    ['NONE', 'escalate'],
    ['NONE', 'resolve'],
    ['NONE', 'withdraw'],
    ['OPEN', 'openDispute'],
    ['ESCALATED', 'openDispute'],
    ['ESCALATED', 'escalate'],
    ['ESCALATED', 'withdraw'],
  ])('invalid: %s + %s → false', (state, action) => {
    expect(isValidDisputeTransition(state, action)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. getDisputeState defaults
// ─────────────────────────────────────────────────────────────────────────────

describe('getDisputeState()', () => {
  it('returns NONE for unknown contractId', () => {
    expect(getDisputeState('unknown-contract')).toBe('NONE');
  });

  it('reflects each state change', () => {
    expect(getDisputeState(CONTRACT_A)).toBe('NONE');
    openDispute(CONTRACT_A, ALICE);
    expect(getDisputeState(CONTRACT_A)).toBe('OPEN');
    escalateDispute(CONTRACT_A);
    expect(getDisputeState(CONTRACT_A)).toBe('ESCALATED');
    resolveDispute(CONTRACT_A, ARBITRATOR, { outcome: 'buyer_wins' });
    expect(getDisputeState(CONTRACT_A)).toBe('REFUNDED');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. registerDisputeRecord
// ─────────────────────────────────────────────────────────────────────────────

describe('registerDisputeRecord()', () => {
  it('re-hydrates a record bypassing normal transitions', () => {
    registerDisputeRecord({
      contractId: CONTRACT_A,
      state: 'ESCALATED',
      openedBy: ALICE,
      openedAt: new Date(),
    });

    expect(getDisputeState(CONTRACT_A)).toBe('ESCALATED');
  });

  it('overwrites an existing record', () => {
    openDispute(CONTRACT_A, ALICE);
    registerDisputeRecord({
      contractId: CONTRACT_A,
      state: 'RESOLVED',
      openedBy: ALICE,
      resolvedBy: ARBITRATOR,
      resolvedAt: new Date(),
      openedAt: new Date(),
    });

    expect(getDisputeState(CONTRACT_A)).toBe('RESOLVED');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. clearAllDisputes
// ─────────────────────────────────────────────────────────────────────────────

describe('clearAllDisputes()', () => {
  it('removes all dispute records', () => {
    openDispute(CONTRACT_A, ALICE);
    openDispute(CONTRACT_B, ALICE);

    clearAllDisputes();

    expect(_disputeStore.size).toBe(0);
    expect(getDisputeState(CONTRACT_A)).toBe('NONE');
    expect(getDisputeState(CONTRACT_B)).toBe('NONE');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. Full happy-path lifecycle: NONE → OPEN → ESCALATED → REFUNDED
// ─────────────────────────────────────────────────────────────────────────────

describe('full lifecycle', () => {
  it('NONE → OPEN → ESCALATED → REFUNDED (buyer wins)', () => {
    // 1. No dispute exists
    expect(getDisputeState(CONTRACT_A)).toBe('NONE');

    // 2. Buyer raises dispute
    const opened = openDispute(CONTRACT_A, ALICE, {
      reason: 'ticket_not_delivered',
      txHash: 'tx-open',
    });
    expect(opened.state).toBe('OPEN');

    // 3. Buyer escalates after seller non-response
    const escalated = escalateDispute(CONTRACT_A, {
      escalationNote: 'No response for 72h',
    });
    expect(escalated.state).toBe('ESCALATED');

    // 4. Arbitrator resolves in buyer's favour
    const resolved = resolveDispute(CONTRACT_A, ARBITRATOR, {
      outcome: 'buyer_wins',
      txHash: 'tx-resolve',
    });
    expect(resolved.state).toBe('REFUNDED');
    expect(resolved.outcome).toBe('buyer_wins');
    expect(resolved.txHashResolve).toBe('tx-resolve');

    // 5. Verify final record
    const record = getDisputeRecord(CONTRACT_A);
    expect(record?.state).toBe('REFUNDED');
    expect(record?.resolvedBy).toBe(ARBITRATOR);

    // 6. Further actions are rejected
    expect(() => resolveDispute(CONTRACT_A, ARBITRATOR)).toThrow(
      InvalidDisputeTransitionError
    );
  });

  it('NONE → OPEN → WITHDRAWN (claimant changes mind)', () => {
    openDispute(CONTRACT_A, ALICE);
    const withdrawn = withdrawDispute(CONTRACT_A, ALICE);
    expect(withdrawn.state).toBe('WITHDRAWN_BY_CLAIMANT');

    // Verify no further actions allowed
    expect(() => escalateDispute(CONTRACT_A)).toThrow(InvalidDisputeTransitionError);
  });
});
