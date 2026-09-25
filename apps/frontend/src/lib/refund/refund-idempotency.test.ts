/**
 * Tests for refund-idempotency.ts — issue #657
 *
 * Verifies:
 * 1. First claim attempt succeeds and stores the record.
 * 2. Second claim attempt throws RefundAlreadyClaimedError.
 * 3. isRefundAlreadyClaimed / getRefundClaimRecord query correctly.
 * 4. markRefundClaimed with allowReset re-hydrates without throwing.
 * 5. updateRefundTxHash attaches the tx hash to the record.
 * 6. clearRefundClaim removes the record; clearAllRefundClaims clears all.
 * 7. getAllRefundClaimRecords returns a snapshot.
 * 8. Storage cleanup: records survive in memory between calls but are gone
 *    after explicit clear (documents the procedure).
 */

import {
  RefundAlreadyClaimedError,
  claimRefund,
  isRefundAlreadyClaimed,
  getRefundClaimRecord,
  markRefundClaimed,
  updateRefundTxHash,
  clearRefundClaim,
  clearAllRefundClaims,
  getAllRefundClaimRecords,
  _refundClaimStore,
} from './refund-idempotency';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const CONTRACT_A = 'contract-aaa-111';
const CONTRACT_B = 'contract-bbb-222';
const WALLET_ALICE = 'GALICE...';
const WALLET_BOB = 'GBOB...';

beforeEach(() => {
  // Reset the in-memory store before every test to ensure isolation
  clearAllRefundClaims();
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. First claim succeeds
// ─────────────────────────────────────────────────────────────────────────────

describe('claimRefund()', () => {
  it('returns a RefundClaimRecord on first call', () => {
    const record = claimRefund(CONTRACT_A, WALLET_ALICE);

    expect(record.contractId).toBe(CONTRACT_A);
    expect(record.claimedBy).toBe(WALLET_ALICE);
    expect(record.claimedAt).toBeInstanceOf(Date);
    expect(record.txHash).toBeUndefined();
  });

  it('marks the contract as claimed after first call', () => {
    claimRefund(CONTRACT_A, WALLET_ALICE);
    expect(isRefundAlreadyClaimed(CONTRACT_A)).toBe(true);
  });

  // 2. Second claim attempt throws
  it('throws RefundAlreadyClaimedError on second call for same contract', () => {
    claimRefund(CONTRACT_A, WALLET_ALICE);

    expect(() => claimRefund(CONTRACT_A, WALLET_BOB)).toThrow(
      RefundAlreadyClaimedError
    );
  });

  it('RefundAlreadyClaimedError contains correct contractId and claimedAt', () => {
    const first = claimRefund(CONTRACT_A, WALLET_ALICE);

    try {
      claimRefund(CONTRACT_A, WALLET_BOB);
      fail('Expected RefundAlreadyClaimedError to be thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(RefundAlreadyClaimedError);
      const typed = err as RefundAlreadyClaimedError;
      expect(typed.contractId).toBe(CONTRACT_A);
      expect(typed.claimedAt.getTime()).toBe(first.claimedAt.getTime());
      expect(typed.code).toBe('REFUND_ALREADY_CLAIMED');
    }
  });

  it('allows independent claims on different contracts', () => {
    const r1 = claimRefund(CONTRACT_A, WALLET_ALICE);
    const r2 = claimRefund(CONTRACT_B, WALLET_BOB);

    expect(r1.contractId).toBe(CONTRACT_A);
    expect(r2.contractId).toBe(CONTRACT_B);
    expect(isRefundAlreadyClaimed(CONTRACT_A)).toBe(true);
    expect(isRefundAlreadyClaimed(CONTRACT_B)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Query functions
// ─────────────────────────────────────────────────────────────────────────────

describe('isRefundAlreadyClaimed()', () => {
  it('returns false for unclaimed contract', () => {
    expect(isRefundAlreadyClaimed(CONTRACT_A)).toBe(false);
  });

  it('returns true after claim', () => {
    claimRefund(CONTRACT_A, WALLET_ALICE);
    expect(isRefundAlreadyClaimed(CONTRACT_A)).toBe(true);
  });
});

describe('getRefundClaimRecord()', () => {
  it('returns undefined for unclaimed contract', () => {
    expect(getRefundClaimRecord(CONTRACT_A)).toBeUndefined();
  });

  it('returns the stored record after claim', () => {
    const claimed = claimRefund(CONTRACT_A, WALLET_ALICE);
    const fetched = getRefundClaimRecord(CONTRACT_A);

    expect(fetched).toBeDefined();
    expect(fetched?.contractId).toBe(CONTRACT_A);
    expect(fetched?.claimedAt.getTime()).toBe(claimed.claimedAt.getTime());
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. markRefundClaimed with allowReset
// ─────────────────────────────────────────────────────────────────────────────

describe('markRefundClaimed()', () => {
  it('throws without allowReset if already claimed', () => {
    claimRefund(CONTRACT_A, WALLET_ALICE);
    expect(() => markRefundClaimed(CONTRACT_A, WALLET_BOB)).toThrow(
      RefundAlreadyClaimedError
    );
  });

  it('succeeds with allowReset — re-hydration path', () => {
    claimRefund(CONTRACT_A, WALLET_ALICE);

    expect(() =>
      markRefundClaimed(CONTRACT_A, WALLET_ALICE, { allowReset: true, txHash: 'hash-xyz' })
    ).not.toThrow();

    const record = getRefundClaimRecord(CONTRACT_A);
    expect(record?.txHash).toBe('hash-xyz');
    // claimedAt is preserved from the original claim
    expect(record?.claimedBy).toBe(WALLET_ALICE);
  });

  it('creates a new record if not claimed yet', () => {
    const record = markRefundClaimed(CONTRACT_A, WALLET_ALICE);
    expect(record.contractId).toBe(CONTRACT_A);
    expect(isRefundAlreadyClaimed(CONTRACT_A)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. updateRefundTxHash
// ─────────────────────────────────────────────────────────────────────────────

describe('updateRefundTxHash()', () => {
  it('attaches txHash to an existing record', () => {
    claimRefund(CONTRACT_A, WALLET_ALICE);
    updateRefundTxHash(CONTRACT_A, 'tx-abc-123');

    const record = getRefundClaimRecord(CONTRACT_A);
    expect(record?.txHash).toBe('tx-abc-123');
  });

  it('throws if contract has not been claimed', () => {
    expect(() => updateRefundTxHash(CONTRACT_A, 'tx-xyz')).toThrow(
      /No refund claim found/
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Clear functions
// ─────────────────────────────────────────────────────────────────────────────

describe('clearRefundClaim()', () => {
  it('removes the record and returns true', () => {
    claimRefund(CONTRACT_A, WALLET_ALICE);
    const removed = clearRefundClaim(CONTRACT_A);

    expect(removed).toBe(true);
    expect(isRefundAlreadyClaimed(CONTRACT_A)).toBe(false);
  });

  it('returns false if no record existed', () => {
    const removed = clearRefundClaim(CONTRACT_A);
    expect(removed).toBe(false);
  });

  it('allows re-claiming after clear (clean lifecycle)', () => {
    claimRefund(CONTRACT_A, WALLET_ALICE);
    clearRefundClaim(CONTRACT_A);

    // Should not throw
    expect(() => claimRefund(CONTRACT_A, WALLET_ALICE)).not.toThrow();
  });
});

describe('clearAllRefundClaims()', () => {
  it('removes all records', () => {
    claimRefund(CONTRACT_A, WALLET_ALICE);
    claimRefund(CONTRACT_B, WALLET_BOB);

    clearAllRefundClaims();

    expect(_refundClaimStore.size).toBe(0);
    expect(isRefundAlreadyClaimed(CONTRACT_A)).toBe(false);
    expect(isRefundAlreadyClaimed(CONTRACT_B)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. getAllRefundClaimRecords
// ─────────────────────────────────────────────────────────────────────────────

describe('getAllRefundClaimRecords()', () => {
  it('returns empty array when no claims exist', () => {
    expect(getAllRefundClaimRecords()).toHaveLength(0);
  });

  it('returns all stored records', () => {
    claimRefund(CONTRACT_A, WALLET_ALICE);
    claimRefund(CONTRACT_B, WALLET_BOB);

    const records = getAllRefundClaimRecords();
    expect(records).toHaveLength(2);
    const ids = records.map((r) => r.contractId);
    expect(ids).toContain(CONTRACT_A);
    expect(ids).toContain(CONTRACT_B);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Storage cleanup documentation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * This test documents the intended storage cleanup procedure.
 *
 * In production:
 *   1. After the escrow reaches a terminal on-chain state (`released` /
 *      `resolved`), call clearRefundClaim(contractId).
 *   2. On app logout / full reset call clearAllRefundClaims().
 *   3. To survive page reloads, re-hydrate from Hasura on startup using
 *      markRefundClaimed(contractId, wallet, { allowReset: true, txHash }).
 */
describe('Storage cleanup procedure', () => {
  it('demonstrates the full lifecycle: claim → update tx → clear', () => {
    // Step 1: Claim the refund (idempotency guard)
    const record = claimRefund(CONTRACT_A, WALLET_ALICE);
    expect(record.txHash).toBeUndefined();

    // Step 2: Attach the tx hash once on-chain submission completes
    updateRefundTxHash(CONTRACT_A, 'stellar-tx-hash-999');
    expect(getRefundClaimRecord(CONTRACT_A)?.txHash).toBe('stellar-tx-hash-999');

    // Step 3: Escrow resolves on-chain — clean up memory
    const wasRemoved = clearRefundClaim(CONTRACT_A);
    expect(wasRemoved).toBe(true);
    expect(isRefundAlreadyClaimed(CONTRACT_A)).toBe(false);
  });

  it('demonstrates re-hydration from durable store on app startup', () => {
    // Simulate re-hydration after page reload
    markRefundClaimed(CONTRACT_A, WALLET_ALICE, {
      allowReset: true,
      txHash: 'persisted-tx-hash',
    });

    // Now a duplicate claim is correctly rejected
    expect(() => claimRefund(CONTRACT_A, WALLET_BOB)).toThrow(
      RefundAlreadyClaimedError
    );
  });
});
