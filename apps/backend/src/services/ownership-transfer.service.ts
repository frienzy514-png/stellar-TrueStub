/**
 * OwnershipTransferService — issue #154
 *
 * Manages ticket-ownership transfers atomically through a two-phase workflow:
 *
 *   1. PENDING  — transfer initiated by the current owner (seller).
 *   2. ACCEPTED — buyer confirms receipt; ownership moves.
 *      CANCELLED — either party cancels; ownership stays with the original owner.
 *
 * Atomicity guarantee
 * -------------------
 * A transfer transitions through states via `accept` or `cancel`.  Each
 * state change is guarded so that only one outcome can occur:
 *   - Once ACCEPTED or CANCELLED, no further transitions are allowed.
 *   - Concurrent `accept` / `cancel` calls for the same transferId are
 *     serialised through an async mutex per transferId, preventing two
 *     callers from racing to finalise the same transfer.
 *
 * In-process store
 * ----------------
 * The default `InMemoryOwnershipStore` is correct for single-node use.
 * For multi-node or persistent deployments, swap it with a DB-backed
 * implementation that uses row-level locking (e.g. SELECT FOR UPDATE) to
 * provide the same atomicity guarantee across processes.
 */

import { AppError } from "../middleware/errorHandler";

// ── Types ──────────────────────────────────────────────────────────────────

export type TransferState = "PENDING" | "ACCEPTED" | "CANCELLED";

export interface OwnershipTransfer {
  transferId: string;
  escrowId: string;
  /** Current owner at the time of initiation. */
  fromOwner: string;
  /** Intended new owner. */
  toOwner: string;
  state: TransferState;
  initiatedAt: string;
  finalizedAt?: string;
}

export interface OwnershipStore {
  get(transferId: string): Promise<OwnershipTransfer | undefined>;
  set(transferId: string, record: OwnershipTransfer): Promise<void>;
}

export const TRANSFER_ERROR_CODES = {
  NOT_FOUND: "TRANSFER_NOT_FOUND",
  ALREADY_FINALIZED: "TRANSFER_ALREADY_FINALIZED",
  INVALID_PAYLOAD: "TRANSFER_INVALID_PAYLOAD",
  CONFLICT: "TRANSFER_CONFLICT",
} as const;

// ── In-memory store ────────────────────────────────────────────────────────

export class InMemoryOwnershipStore implements OwnershipStore {
  private readonly store = new Map<string, OwnershipTransfer>();

  async get(transferId: string): Promise<OwnershipTransfer | undefined> {
    return this.store.get(transferId);
  }

  async set(transferId: string, record: OwnershipTransfer): Promise<void> {
    this.store.set(transferId, record);
  }

  /** Visible for testing. */
  get size(): number {
    return this.store.size;
  }
}

// ── Concurrency mutex ──────────────────────────────────────────────────────
//
// For the in-memory store the mutex prevents two concurrent async calls
// from both reading "PENDING" and then both writing "ACCEPTED", producing
// two confirmations for the same transfer (TOCTOU race).
//
// Each transferId gets its own lock queue.  When the lock is released the
// next queued waiter takes it.

class Lock {
  private queue: Array<() => void> = [];
  private locked = false;

  async acquire(): Promise<() => void> {
    if (!this.locked) {
      this.locked = true;
      return () => this.release();
    }
    return new Promise<() => void>((resolve) => {
      this.queue.push(() => {
        resolve(() => this.release());
      });
    });
  }

  private release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.locked = false;
    }
  }
}

// ── Service ────────────────────────────────────────────────────────────────

export class OwnershipTransferService {
  private readonly locks = new Map<string, Lock>();

  constructor(private readonly store: OwnershipStore = new InMemoryOwnershipStore()) {}

  private getLock(transferId: string): Lock {
    if (!this.locks.has(transferId)) {
      this.locks.set(transferId, new Lock());
    }
    return this.locks.get(transferId)!;
  }

  /**
   * Initiates a new ownership transfer (PENDING state).
   * Duplicate transferIds are rejected with 409 TRANSFER_CONFLICT.
   */
  async initiateTransfer(payload: {
    transferId: string;
    escrowId: string;
    fromOwner: string;
    toOwner: string;
  }): Promise<OwnershipTransfer> {
    const { transferId, escrowId, fromOwner, toOwner } = payload;

    if (!transferId || !escrowId || !fromOwner || !toOwner) {
      throw new AppError(400, TRANSFER_ERROR_CODES.INVALID_PAYLOAD, "transferId, escrowId, fromOwner, and toOwner are required");
    }

    const release = await this.getLock(transferId).acquire();
    try {
      const existing = await this.store.get(transferId);
      if (existing) {
        throw new AppError(409, TRANSFER_ERROR_CODES.CONFLICT, `Transfer ${transferId} already exists with state: ${existing.state}`);
      }

      const record: OwnershipTransfer = {
        transferId,
        escrowId,
        fromOwner,
        toOwner,
        state: "PENDING",
        initiatedAt: new Date().toISOString(),
      };

      await this.store.set(transferId, record);
      return record;
    } finally {
      release();
    }
  }

  /**
   * Accepts a PENDING transfer → moves state to ACCEPTED.
   * Throws 404 if not found; 409 if already finalised.
   */
  async acceptTransfer(transferId: string): Promise<OwnershipTransfer> {
    return this.finalize(transferId, "ACCEPTED");
  }

  /**
   * Cancels a PENDING transfer → moves state to CANCELLED.
   * Throws 404 if not found; 409 if already finalised.
   */
  async cancelTransfer(transferId: string): Promise<OwnershipTransfer> {
    return this.finalize(transferId, "CANCELLED");
  }

  /** Returns the current state of a transfer without mutating it. */
  async getTransfer(transferId: string): Promise<OwnershipTransfer | undefined> {
    return this.store.get(transferId);
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private async finalize(
    transferId: string,
    nextState: "ACCEPTED" | "CANCELLED"
  ): Promise<OwnershipTransfer> {
    if (!transferId) {
      throw new AppError(400, TRANSFER_ERROR_CODES.INVALID_PAYLOAD, "transferId is required");
    }

    const release = await this.getLock(transferId).acquire();
    try {
      const transfer = await this.store.get(transferId);

      if (!transfer) {
        throw new AppError(404, TRANSFER_ERROR_CODES.NOT_FOUND, `Transfer ${transferId} not found`);
      }

      if (transfer.state !== "PENDING") {
        throw new AppError(
          409,
          TRANSFER_ERROR_CODES.ALREADY_FINALIZED,
          `Transfer ${transferId} is already in state ${transfer.state} and cannot be ${nextState.toLowerCase()}`
        );
      }

      const updated: OwnershipTransfer = {
        ...transfer,
        state: nextState,
        finalizedAt: new Date().toISOString(),
      };

      await this.store.set(transferId, updated);
      return updated;
    } finally {
      release();
    }
  }
}

// Singleton shared by routes
export const ownershipTransferService = new OwnershipTransferService();
