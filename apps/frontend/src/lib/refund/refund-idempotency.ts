/**
 * Refund Idempotency Guard — closes #657
 *
 * Ensures that a refund can be claimed at most once per escrow contract.
 * The first call succeeds; any subsequent call for the same contractId returns
 * a RefundAlreadyClaimed error instead of attempting a duplicate on-chain
 * transaction.
 *
 * Storage is intentionally in-memory (Map) so that the data never leaks
 * to disk / localStorage. The claim record is cleaned up via
 * `clearRefundClaim()` once the refund lifecycle is fully over.
 *
 * ## Storage clean-up procedure
 * 1. After the escrow status transitions to `released` or `resolved` on-chain,
 *    call `clearRefundClaim(contractId)` to free the in-memory entry.
 * 2. On application unmount / logout, call `clearAllRefundClaims()`.
 * 3. For persistent scenarios (e.g., after a page reload) the caller is
 *    responsible for re-hydrating the claimed set from its own durable store
 *    (e.g., Hasura) and calling `markRefundClaimed()` on startup.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Structured error thrown when a refund has already been claimed. */
export class RefundAlreadyClaimedError extends Error {
  readonly contractId: string;
  readonly claimedAt: Date;
  readonly code = 'REFUND_ALREADY_CLAIMED' as const;

  constructor(contractId: string, claimedAt: Date) {
    super(`Refund for contract ${contractId} has already been claimed at ${claimedAt.toISOString()}.`);
    this.name = 'RefundAlreadyClaimedError';
    this.contractId = contractId;
    this.claimedAt = claimedAt;
    // Maintain correct prototype chain in transpiled environments
    Object.setPrototypeOf(this, RefundAlreadyClaimedError.prototype);
  }
}

/** Metadata stored for each claimed refund. */
export interface RefundClaimRecord {
  contractId: string;
  claimedAt: Date;
  claimedBy: string;      // wallet address of the claimer
  txHash?: string;         // on-chain transaction hash once available
}

// ─────────────────────────────────────────────────────────────────────────────
// In-memory store (module-singleton)
// ─────────────────────────────────────────────────────────────────────────────

/** @internal — exported only for test introspection; do not use in production code. */
export const _refundClaimStore = new Map<string, RefundClaimRecord>();

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns `true` if a refund has already been claimed for `contractId`.
 */
export function isRefundAlreadyClaimed(contractId: string): boolean {
  return _refundClaimStore.has(contractId);
}

/**
 * Returns the claim record for `contractId`, or `undefined` if not claimed.
 */
export function getRefundClaimRecord(contractId: string): RefundClaimRecord | undefined {
  return _refundClaimStore.get(contractId);
}

/**
 * Marks a refund as claimed.
 *
 * Idempotent if the caller passes `{ allowReset: true }` — useful for
 * re-hydrating the store from a durable backend on startup.
 *
 * @throws {RefundAlreadyClaimedError} when the refund is already claimed and
 *   `allowReset` is not set.
 */
export function markRefundClaimed(
  contractId: string,
  claimedBy: string,
  options: { allowReset?: boolean; txHash?: string } = {}
): RefundClaimRecord {
  const existing = _refundClaimStore.get(contractId);

  if (existing && !options.allowReset) {
    throw new RefundAlreadyClaimedError(contractId, existing.claimedAt);
  }

  const record: RefundClaimRecord = {
    contractId,
    claimedAt: existing?.claimedAt ?? new Date(),
    claimedBy,
    txHash: options.txHash ?? existing?.txHash,
  };

  _refundClaimStore.set(contractId, record);
  return record;
}

/**
 * Atomically checks-and-claims a refund in a single call.
 *
 * This is the primary entry-point for the refund flow:
 * ```ts
 * const record = claimRefund(contractId, walletAddress);
 * // proceed with on-chain refund call
 * updateRefundTxHash(contractId, txHash);
 * ```
 *
 * @throws {RefundAlreadyClaimedError} if the refund has already been claimed.
 */
export function claimRefund(contractId: string, claimedBy: string): RefundClaimRecord {
  const existing = _refundClaimStore.get(contractId);
  if (existing) {
    throw new RefundAlreadyClaimedError(contractId, existing.claimedAt);
  }

  const record: RefundClaimRecord = {
    contractId,
    claimedAt: new Date(),
    claimedBy,
  };
  _refundClaimStore.set(contractId, record);
  return record;
}

/**
 * Updates the transaction hash on an already-claimed refund record.
 * Useful once the on-chain transaction hash is known after submission.
 *
 * @throws {Error} if the contract has not been claimed yet.
 */
export function updateRefundTxHash(contractId: string, txHash: string): void {
  const record = _refundClaimStore.get(contractId);
  if (!record) {
    throw new Error(`No refund claim found for contract ${contractId}.`);
  }
  _refundClaimStore.set(contractId, { ...record, txHash });
}

/**
 * Removes the claim record for `contractId`.
 *
 * Call this after the escrow lifecycle is fully resolved on-chain
 * (status: `released` or `resolved`) to free memory.
 *
 * @returns `true` if the record existed and was removed, `false` otherwise.
 */
export function clearRefundClaim(contractId: string): boolean {
  return _refundClaimStore.delete(contractId);
}

/**
 * Removes ALL refund claim records.
 *
 * Call this on application logout or full reset to avoid stale state.
 */
export function clearAllRefundClaims(): void {
  _refundClaimStore.clear();
}

/**
 * Returns a snapshot of all current claim records (read-only copy).
 * Intended for debugging / admin dashboards.
 */
export function getAllRefundClaimRecords(): Readonly<RefundClaimRecord>[] {
  return Array.from(_refundClaimStore.values());
}
