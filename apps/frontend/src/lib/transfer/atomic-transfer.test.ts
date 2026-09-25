/**
 * Tests for atomic-transfer.ts — issue #656
 *
 * Verifies:
 * 1. Transfer initiates successfully, returning state PENDING_ACCEPTANCE.
 * 2. Concurrent initiation on same contract throws ConcurrentTransferError.
 * 3. Accepting a PENDING transfer moves it to COMPLETED.
 * 4. Cancelling a PENDING transfer moves it to CANCELLED.
 * 5. Re-initiating after COMPLETED/CANCELLED throws TransferConflictError.
 * 6. Accepting/cancelling from IDLE or terminal states throws.
 * 7. No partial state: a failed accept leaves transfer in PENDING.
 * 8. getTransferState defaults to IDLE.
 * 9. registerTransfer and resetTransfer work correctly.
 * 10. clearAllTransfers removes all records.
 * 11. Concurrent scenarios: second initiate after first is PENDING fails.
 */

import {
  TransferConflictError,
  ConcurrentTransferError,
  initiateTransfer,
  acceptTransfer,
  cancelTransfer,
  getTransferRecord,
  getTransferState,
  registerTransfer,
  resetTransfer,
  clearAllTransfers,
  _transferStore,
} from './atomic-transfer';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const CONTRACT_A = 'contract-transfer-aaa';
const CONTRACT_B = 'contract-transfer-bbb';
const ALICE = 'GALICE...SELLER';
const BOB = 'GBOB...BUYER';

beforeEach(() => {
  clearAllTransfers();
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. Successful initiation
// ─────────────────────────────────────────────────────────────────────────────

describe('initiateTransfer()', () => {
  it('returns a TransferRecord with state PENDING_ACCEPTANCE', () => {
    const record = initiateTransfer(CONTRACT_A, ALICE, BOB);

    expect(record.contractId).toBe(CONTRACT_A);
    expect(record.fromAddress).toBe(ALICE);
    expect(record.toAddress).toBe(BOB);
    expect(record.state).toBe('PENDING_ACCEPTANCE');
    expect(record.initiatedAt).toBeInstanceOf(Date);
    expect(record.resolvedAt).toBeUndefined();
  });

  it('stores an optional txHash', () => {
    const record = initiateTransfer(CONTRACT_A, ALICE, BOB, 'tx-initiate-123');
    expect(record.txHashInitiate).toBe('tx-initiate-123');
  });

  it('transitions state from IDLE to PENDING_ACCEPTANCE', () => {
    expect(getTransferState(CONTRACT_A)).toBe('IDLE');
    initiateTransfer(CONTRACT_A, ALICE, BOB);
    expect(getTransferState(CONTRACT_A)).toBe('PENDING_ACCEPTANCE');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Concurrent initiation rejected
// ─────────────────────────────────────────────────────────────────────────────

describe('concurrent initiation', () => {
  it('throws ConcurrentTransferError if transfer is already PENDING', () => {
    initiateTransfer(CONTRACT_A, ALICE, BOB);

    expect(() => initiateTransfer(CONTRACT_A, ALICE, BOB)).toThrow(
      ConcurrentTransferError
    );
  });

  it('ConcurrentTransferError has correct contractId and code', () => {
    initiateTransfer(CONTRACT_A, ALICE, BOB);

    try {
      initiateTransfer(CONTRACT_A, ALICE, BOB);
      fail('Expected ConcurrentTransferError');
    } catch (err) {
      expect(err).toBeInstanceOf(ConcurrentTransferError);
      const typed = err as ConcurrentTransferError;
      expect(typed.contractId).toBe(CONTRACT_A);
      expect(typed.code).toBe('CONCURRENT_TRANSFER');
    }
  });

  it('allows parallel transfers on different contracts', () => {
    expect(() => initiateTransfer(CONTRACT_A, ALICE, BOB)).not.toThrow();
    expect(() => initiateTransfer(CONTRACT_B, ALICE, BOB)).not.toThrow();

    expect(getTransferState(CONTRACT_A)).toBe('PENDING_ACCEPTANCE');
    expect(getTransferState(CONTRACT_B)).toBe('PENDING_ACCEPTANCE');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Accept
// ─────────────────────────────────────────────────────────────────────────────

describe('acceptTransfer()', () => {
  it('moves PENDING_ACCEPTANCE to COMPLETED', () => {
    initiateTransfer(CONTRACT_A, ALICE, BOB);
    const record = acceptTransfer(CONTRACT_A, 'tx-accept-456');

    expect(record.state).toBe('COMPLETED');
    expect(record.txHashResolve).toBe('tx-accept-456');
    expect(record.resolvedAt).toBeInstanceOf(Date);
  });

  it('throws TransferConflictError when accepting an IDLE contract', () => {
    expect(() => acceptTransfer(CONTRACT_A)).toThrow(TransferConflictError);
  });

  it('throws TransferConflictError when accepting an already COMPLETED transfer', () => {
    initiateTransfer(CONTRACT_A, ALICE, BOB);
    acceptTransfer(CONTRACT_A);

    expect(() => acceptTransfer(CONTRACT_A)).toThrow(TransferConflictError);
  });

  it('throws TransferConflictError when accepting a CANCELLED transfer', () => {
    initiateTransfer(CONTRACT_A, ALICE, BOB);
    cancelTransfer(CONTRACT_A);

    expect(() => acceptTransfer(CONTRACT_A)).toThrow(TransferConflictError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Cancel
// ─────────────────────────────────────────────────────────────────────────────

describe('cancelTransfer()', () => {
  it('moves PENDING_ACCEPTANCE to CANCELLED', () => {
    initiateTransfer(CONTRACT_A, ALICE, BOB);
    const record = cancelTransfer(CONTRACT_A, 'tx-cancel-789');

    expect(record.state).toBe('CANCELLED');
    expect(record.txHashResolve).toBe('tx-cancel-789');
    expect(record.resolvedAt).toBeInstanceOf(Date);
  });

  it('throws TransferConflictError when cancelling an IDLE contract', () => {
    expect(() => cancelTransfer(CONTRACT_A)).toThrow(TransferConflictError);
  });

  it('throws TransferConflictError when cancelling an already COMPLETED transfer', () => {
    initiateTransfer(CONTRACT_A, ALICE, BOB);
    acceptTransfer(CONTRACT_A);

    expect(() => cancelTransfer(CONTRACT_A)).toThrow(TransferConflictError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Re-initiation after terminal states
// ─────────────────────────────────────────────────────────────────────────────

describe('re-initiation after terminal states', () => {
  it('throws TransferConflictError when re-initiating after COMPLETED', () => {
    initiateTransfer(CONTRACT_A, ALICE, BOB);
    acceptTransfer(CONTRACT_A);

    expect(() => initiateTransfer(CONTRACT_A, ALICE, BOB)).toThrow(
      TransferConflictError
    );
  });

  it('throws TransferConflictError when re-initiating after CANCELLED', () => {
    initiateTransfer(CONTRACT_A, ALICE, BOB);
    cancelTransfer(CONTRACT_A);

    expect(() => initiateTransfer(CONTRACT_A, ALICE, BOB)).toThrow(
      TransferConflictError
    );
  });

  it('allows re-initiation after resetTransfer', () => {
    initiateTransfer(CONTRACT_A, ALICE, BOB);
    acceptTransfer(CONTRACT_A);
    resetTransfer(CONTRACT_A);

    expect(() => initiateTransfer(CONTRACT_A, ALICE, BOB)).not.toThrow();
    expect(getTransferState(CONTRACT_A)).toBe('PENDING_ACCEPTANCE');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. No partial state guarantee
// ─────────────────────────────────────────────────────────────────────────────

describe('no partial state', () => {
  it('transfer stays PENDING if accept throws (simulated)', () => {
    initiateTransfer(CONTRACT_A, ALICE, BOB);

    // Simulate an error during acceptance by accepting a wrong contract
    expect(() => acceptTransfer('non-existent-contract')).toThrow(TransferConflictError);

    // Original transfer is still PENDING — not corrupted
    expect(getTransferState(CONTRACT_A)).toBe('PENDING_ACCEPTANCE');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. getTransferState default
// ─────────────────────────────────────────────────────────────────────────────

describe('getTransferState()', () => {
  it('returns IDLE for unknown contractId', () => {
    expect(getTransferState('unknown-contract')).toBe('IDLE');
  });

  it('reflects state changes accurately', () => {
    expect(getTransferState(CONTRACT_A)).toBe('IDLE');
    initiateTransfer(CONTRACT_A, ALICE, BOB);
    expect(getTransferState(CONTRACT_A)).toBe('PENDING_ACCEPTANCE');
    acceptTransfer(CONTRACT_A);
    expect(getTransferState(CONTRACT_A)).toBe('COMPLETED');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. registerTransfer and resetTransfer
// ─────────────────────────────────────────────────────────────────────────────

describe('registerTransfer()', () => {
  it('re-hydrates a record without going through state transitions', () => {
    registerTransfer({
      contractId: CONTRACT_A,
      fromAddress: ALICE,
      toAddress: BOB,
      state: 'PENDING_ACCEPTANCE',
      initiatedAt: new Date(),
    });

    expect(getTransferState(CONTRACT_A)).toBe('PENDING_ACCEPTANCE');
  });

  it('overwrites an existing record', () => {
    initiateTransfer(CONTRACT_A, ALICE, BOB);

    registerTransfer({
      contractId: CONTRACT_A,
      fromAddress: ALICE,
      toAddress: BOB,
      state: 'COMPLETED',
      initiatedAt: new Date(),
      resolvedAt: new Date(),
    });

    expect(getTransferState(CONTRACT_A)).toBe('COMPLETED');
  });
});

describe('resetTransfer()', () => {
  it('returns true when a record was removed', () => {
    initiateTransfer(CONTRACT_A, ALICE, BOB);
    expect(resetTransfer(CONTRACT_A)).toBe(true);
    expect(getTransferRecord(CONTRACT_A)).toBeUndefined();
  });

  it('returns false when no record existed', () => {
    expect(resetTransfer(CONTRACT_A)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. clearAllTransfers
// ─────────────────────────────────────────────────────────────────────────────

describe('clearAllTransfers()', () => {
  it('removes all records', () => {
    initiateTransfer(CONTRACT_A, ALICE, BOB);
    initiateTransfer(CONTRACT_B, ALICE, BOB);

    clearAllTransfers();

    expect(_transferStore.size).toBe(0);
    expect(getTransferState(CONTRACT_A)).toBe('IDLE');
    expect(getTransferState(CONTRACT_B)).toBe('IDLE');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. TransferConflictError details
// ─────────────────────────────────────────────────────────────────────────────

describe('TransferConflictError', () => {
  it('includes contractId, currentState, and code', () => {
    initiateTransfer(CONTRACT_A, ALICE, BOB);
    acceptTransfer(CONTRACT_A);

    try {
      acceptTransfer(CONTRACT_A);
      fail('Expected TransferConflictError');
    } catch (err) {
      expect(err).toBeInstanceOf(TransferConflictError);
      const typed = err as TransferConflictError;
      expect(typed.contractId).toBe(CONTRACT_A);
      expect(typed.currentState).toBe('COMPLETED');
      expect(typed.code).toBe('TRANSFER_CONFLICT');
    }
  });
});
