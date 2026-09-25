/**
 * Atomic Ownership Transfer Workflow — closes #656
 *
 * Implements a state-machine-based, two-phase ticket ownership transfer that
 * guarantees atomicity:
 *
 *   IDLE ──initiate()──▶ PENDING_ACCEPTANCE
 *          ├──accept()──▶ COMPLETED
 *          └──cancel()──▶ CANCELLED (or IDLE via reset)
 *
 * Concurrent `initiate()` calls on the same contract are rejected; only one
 * transfer can be in-flight at a time per `contractId`.
 *
 * ## Failure recovery
 * - If `initiate()` succeeds but `accept()` / `cancel()` never arrives, the
 *   transfer stays in PENDING_ACCEPTANCE.  Callers should implement a
 *   timeout / TTL sweep that calls `cancelTransfer()` after a deadline.
 * - The store is in-memory.  For durable recovery, re-hydrate via
 *   `registerTransfer()` on startup by reading Hasura / on-chain state.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type TransferState =
  | 'IDLE'
  | 'PENDING_ACCEPTANCE'
  | 'COMPLETED'
  | 'CANCELLED';

export interface TransferRecord {
  contractId: string;
  fromAddress: string;
  toAddress: string;
  state: TransferState;
  initiatedAt: Date;
  resolvedAt?: Date;
  txHashInitiate?: string;
  txHashResolve?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────────────────────

export class TransferConflictError extends Error {
  readonly code = 'TRANSFER_CONFLICT' as const;
  readonly contractId: string;
  readonly currentState: TransferState;

  constructor(contractId: string, currentState: TransferState, action: string) {
    super(
      `Cannot perform '${action}' on contract ${contractId}: transfer is in state '${currentState}'.`
    );
    this.name = 'TransferConflictError';
    this.contractId = contractId;
    this.currentState = currentState;
    Object.setPrototypeOf(this, TransferConflictError.prototype);
  }
}

export class ConcurrentTransferError extends Error {
  readonly code = 'CONCURRENT_TRANSFER' as const;
  readonly contractId: string;

  constructor(contractId: string) {
    super(
      `A transfer for contract ${contractId} is already in progress (PENDING_ACCEPTANCE).`
    );
    this.name = 'ConcurrentTransferError';
    this.contractId = contractId;
    Object.setPrototypeOf(this, ConcurrentTransferError.prototype);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// In-memory store (module-singleton)
// ─────────────────────────────────────────────────────────────────────────────

/** @internal — exported only for test introspection. */
export const _transferStore = new Map<string, TransferRecord>();

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the current transfer record for `contractId`, or `undefined`
 * if no transfer has been initiated.
 */
export function getTransferRecord(contractId: string): TransferRecord | undefined {
  return _transferStore.get(contractId);
}

/**
 * Returns the current state of the transfer, defaulting to `'IDLE'`.
 */
export function getTransferState(contractId: string): TransferState {
  return _transferStore.get(contractId)?.state ?? 'IDLE';
}

/**
 * Initiates a new transfer.
 *
 * - Only one transfer per `contractId` can be PENDING_ACCEPTANCE at a time.
 *   Attempting a second concurrent initiation throws `ConcurrentTransferError`.
 * - A completed or cancelled transfer must be explicitly reset (or removed)
 *   before a new one can start; otherwise a `TransferConflictError` is thrown.
 *
 * @param contractId - Escrow contract identifier.
 * @param fromAddress - Current owner (seller) wallet address.
 * @param toAddress - Intended new owner (buyer) wallet address.
 * @param txHash - Optional on-chain transaction hash for the initiation step.
 */
export function initiateTransfer(
  contractId: string,
  fromAddress: string,
  toAddress: string,
  txHash?: string
): TransferRecord {
  const existing = _transferStore.get(contractId);

  if (existing) {
    if (existing.state === 'PENDING_ACCEPTANCE') {
      throw new ConcurrentTransferError(contractId);
    }
    if (existing.state === 'COMPLETED' || existing.state === 'CANCELLED') {
      throw new TransferConflictError(contractId, existing.state, 'initiate');
    }
  }

  const record: TransferRecord = {
    contractId,
    fromAddress,
    toAddress,
    state: 'PENDING_ACCEPTANCE',
    initiatedAt: new Date(),
    txHashInitiate: txHash,
  };

  _transferStore.set(contractId, record);
  return { ...record };
}

/**
 * Accepts a pending transfer, moving it to COMPLETED.
 *
 * @throws {TransferConflictError} if the transfer is not in PENDING_ACCEPTANCE.
 */
export function acceptTransfer(contractId: string, txHash?: string): TransferRecord {
  const record = _requireRecord(contractId);

  if (record.state !== 'PENDING_ACCEPTANCE') {
    throw new TransferConflictError(contractId, record.state, 'accept');
  }

  const updated: TransferRecord = {
    ...record,
    state: 'COMPLETED',
    resolvedAt: new Date(),
    txHashResolve: txHash,
  };

  _transferStore.set(contractId, updated);
  return { ...updated };
}

/**
 * Cancels a pending transfer, moving it to CANCELLED.
 *
 * @throws {TransferConflictError} if the transfer is not in PENDING_ACCEPTANCE.
 */
export function cancelTransfer(contractId: string, txHash?: string): TransferRecord {
  const record = _requireRecord(contractId);

  if (record.state !== 'PENDING_ACCEPTANCE') {
    throw new TransferConflictError(contractId, record.state, 'cancel');
  }

  const updated: TransferRecord = {
    ...record,
    state: 'CANCELLED',
    resolvedAt: new Date(),
    txHashResolve: txHash,
  };

  _transferStore.set(contractId, updated);
  return { ...updated };
}

/**
 * Re-hydrates (or registers) a transfer record from an external source
 * (e.g., Hasura / on-chain data on app startup).
 *
 * Overwrites any existing in-memory record for the same `contractId`.
 */
export function registerTransfer(record: TransferRecord): void {
  _transferStore.set(record.contractId, { ...record });
}

/**
 * Removes the transfer record for `contractId`, resetting it to IDLE.
 * Use this to allow a new transfer after a previous one has been COMPLETED
 * or CANCELLED and no longer needs to be tracked.
 *
 * @returns `true` if a record existed and was removed.
 */
export function resetTransfer(contractId: string): boolean {
  return _transferStore.delete(contractId);
}

/**
 * Clears all transfer records.  Call on logout / full reset.
 */
export function clearAllTransfers(): void {
  _transferStore.clear();
}

// ─────────────────────────────────────────────────────────────────────────────
// Private helpers
// ─────────────────────────────────────────────────────────────────────────────

function _requireRecord(contractId: string): TransferRecord {
  const record = _transferStore.get(contractId);
  if (!record) {
    throw new TransferConflictError(contractId, 'IDLE', 'resolve');
  }
  return record;
}
