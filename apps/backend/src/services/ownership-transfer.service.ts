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
 * A transfer transitions through states via `accept` or `cancel`. Each state
 * change is guarded so that only one outcome can occur:
 *   - Once ACCEPTED or CANCELLED, no further transitions are allowed.
 *   - Concurrent `accept` / `cancel` calls for the same transferId are
 *     serialised by a Postgres row lock (`SELECT ... FOR UPDATE`), so the
 *     guarantee also holds across multiple backend instances.
 *
 * Persistence (#517)
 * ------------------
 * Transfers live in the `ownership_transfers` table (migration 010). The
 * primary key / unique constraint on `transfer_id` is the idempotency guard:
 * a duplicate concurrent initiate fails at the database level rather than
 * relying on an in-process Map or mutex.
 */

import { AppError } from "../middleware/errorHandler";
import { getCorrelationId as getRequestId } from "../middleware/requestLogger";
import { logger } from "../lib/logger";
import { queryWithTimeout, withTransaction } from "../lib/postgres";
import * as Sentry from "@sentry/node";

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
  /**
   * Atomically inserts a new transfer record, relying on a unique constraint
   * on `transferId` to reject duplicates. Must throw
   * `AppError(409, TRANSFER_ERROR_CODES.CONFLICT, ...)` when the transferId
   * already exists. This is the authoritative guard against concurrent
   * identical transfer requests (issue #424).
   */
  insertIfAbsent(transferId: string, record: OwnershipTransfer): Promise<void>;
  /**
   * Atomically moves a PENDING transfer to a final state under a database row
   * lock. Must throw 404 when the transfer does not exist and 409
   * ALREADY_FINALIZED when it is no longer PENDING.
   */
  finalize(
    transferId: string,
    nextState: "ACCEPTED" | "CANCELLED"
  ): Promise<OwnershipTransfer>;
}

export const TRANSFER_ERROR_CODES = {
  NOT_FOUND: "TRANSFER_NOT_FOUND",
  ALREADY_FINALIZED: "TRANSFER_ALREADY_FINALIZED",
  INVALID_PAYLOAD: "TRANSFER_INVALID_PAYLOAD",
  CONFLICT: "TRANSFER_CONFLICT",
} as const;

// ── Postgres store ─────────────────────────────────────────────────────────

interface OwnershipTransferRow {
  transfer_id: string;
  escrow_id: string;
  from_owner: string;
  to_owner: string;
  state: TransferState;
  initiated_at: string | Date;
  finalized_at: string | Date | null;
}

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function rowToTransfer(row: OwnershipTransferRow): OwnershipTransfer {
  return {
    transferId: row.transfer_id,
    escrowId: row.escrow_id,
    fromOwner: row.from_owner,
    toOwner: row.to_owner,
    state: row.state,
    initiatedAt: toIso(row.initiated_at),
    ...(row.finalized_at ? { finalizedAt: toIso(row.finalized_at) } : {}),
  };
}

export class PostgresOwnershipStore implements OwnershipStore {
  async get(transferId: string): Promise<OwnershipTransfer | undefined> {
    const result = await queryWithTimeout<OwnershipTransferRow>(
      `SELECT transfer_id, escrow_id, from_owner, to_owner, state,
              initiated_at, finalized_at
         FROM ownership_transfers
        WHERE transfer_id = $1`,
      [transferId]
    );
    const row = result.rows[0];
    return row ? rowToTransfer(row) : undefined;
  }

  async set(_transferId: string, record: OwnershipTransfer): Promise<void> {
    await queryWithTimeout(
      `INSERT INTO ownership_transfers
         (transfer_id, escrow_id, from_owner, to_owner, state, initiated_at, finalized_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (transfer_id) DO UPDATE
         SET escrow_id = EXCLUDED.escrow_id,
             from_owner = EXCLUDED.from_owner,
             to_owner = EXCLUDED.to_owner,
             state = EXCLUDED.state,
             initiated_at = EXCLUDED.initiated_at,
             finalized_at = EXCLUDED.finalized_at`,
      [
        record.transferId,
        record.escrowId,
        record.fromOwner,
        record.toOwner,
        record.state,
        record.initiatedAt,
        record.finalizedAt ?? null,
      ]
    );
  }

  async insertIfAbsent(transferId: string, record: OwnershipTransfer): Promise<void> {
    const result = await queryWithTimeout<{ transfer_id: string }>(
      `INSERT INTO ownership_transfers
         (transfer_id, escrow_id, from_owner, to_owner, state, initiated_at, finalized_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (transfer_id) DO NOTHING
       RETURNING transfer_id`,
      [
        transferId,
        record.escrowId,
        record.fromOwner,
        record.toOwner,
        record.state,
        record.initiatedAt,
        record.finalizedAt ?? null,
      ]
    );

    if (result.rowCount === 0) {
      const existing = await this.get(transferId);
      throw new AppError(
        409,
        TRANSFER_ERROR_CODES.CONFLICT,
        `Transfer ${transferId} already exists with state: ${existing?.state ?? "unknown"}`
      );
    }
  }

  async finalize(
    transferId: string,
    nextState: "ACCEPTED" | "CANCELLED"
  ): Promise<OwnershipTransfer> {
    return withTransaction(async (client) => {
      // Row-level lock: concurrent accept/cancel (on any instance) serialises
      // here, so only one caller can observe PENDING and move it to a final
      // state.
      const locked = await client.query<OwnershipTransferRow>(
        `SELECT transfer_id, escrow_id, from_owner, to_owner, state,
                initiated_at, finalized_at
           FROM ownership_transfers
          WHERE transfer_id = $1
          FOR UPDATE`,
        [transferId]
      );

      const row = locked.rows[0];
      if (!row) {
        throw new AppError(
          404,
          TRANSFER_ERROR_CODES.NOT_FOUND,
          `Transfer ${transferId} not found`
        );
      }

      if (row.state !== "PENDING") {
        throw new AppError(
          409,
          TRANSFER_ERROR_CODES.ALREADY_FINALIZED,
          `Transfer ${transferId} is already in state ${row.state} and cannot be ${nextState.toLowerCase()}`
        );
      }

      const updated = await client.query<OwnershipTransferRow>(
        `UPDATE ownership_transfers
            SET state = $2, finalized_at = NOW()
          WHERE transfer_id = $1
          RETURNING transfer_id, escrow_id, from_owner, to_owner, state,
                    initiated_at, finalized_at`,
        [transferId, nextState]
      );

      return rowToTransfer(updated.rows[0]);
    });
  }
}

// ── Service ────────────────────────────────────────────────────────────────

export class OwnershipTransferService {
  constructor(private readonly store: OwnershipStore = new PostgresOwnershipStore()) {}

  /**
   * Initiates a new ownership transfer (PENDING state).
   * Duplicate transferIds are rejected with 409 TRANSFER_CONFLICT.
   */
  async initiateTransfer(payload: {
    transferId: string;
    escrowId: string;
    fromOwner: string;
    toOwner: string;
    requestId?: string;
  }): Promise<OwnershipTransfer> {
    const { transferId, escrowId, fromOwner, toOwner } = payload;

    if (!transferId || !escrowId || !fromOwner || !toOwner) {
      throw new AppError(
        400,
        TRANSFER_ERROR_CODES.INVALID_PAYLOAD,
        "transferId, escrowId, fromOwner, and toOwner are required"
      );
    }

    const requestId = payload.requestId ?? getRequestId();

    const record: OwnershipTransfer = {
      transferId,
      escrowId,
      fromOwner,
      toOwner,
      state: "PENDING",
      initiatedAt: new Date().toISOString(),
    };

    logger.info({
      requestId,
      transferId,
      escrowId,
      fromOwner,
      toOwner,
    }, "ownership-transfer.initiate.attempt");

    try {
      // The DB unique constraint is the authoritative guard: it rejects
      // duplicate transferIds before any ownership mutation or on-chain
      // action, across every backend instance.
      await this.store.insertIfAbsent(transferId, record);
    } catch (err) {
      if (err instanceof AppError && err.code === TRANSFER_ERROR_CODES.CONFLICT) {
        logger.warn({
          requestId,
          transferId,
          escrowId,
        }, "ownership-transfer.initiate.conflict");
        Sentry.captureEvent({
          message: "ownership-transfer.initiate.conflict",
          level: "warning",
          tags: { requestId, transferId, escrowId },
        });
      }
      throw err;
    }

    logger.info({
      requestId,
      transferId,
      escrowId,
      state: record.state,
    }, "ownership-transfer.initiate.success");

    return record;
  }

  /**
   * Accepts a PENDING transfer → moves state to ACCEPTED.
   * Throws 404 if not found; 409 if already finalised.
   */
  async acceptTransfer(
    transferId: string,
    _actorId?: string,
    requestId?: string
  ): Promise<OwnershipTransfer> {
    return this.finalize(transferId, "ACCEPTED", requestId);
  }

  /**
   * Cancels a PENDING transfer → moves state to CANCELLED.
   * Throws 404 if not found; 409 if already finalised.
   */
  async cancelTransfer(
    transferId: string,
    _actorId?: string,
    requestId?: string
  ): Promise<OwnershipTransfer> {
    return this.finalize(transferId, "CANCELLED", requestId);
  }

  /** Returns the current state of a transfer without mutating it. */
  async getTransfer(transferId: string): Promise<OwnershipTransfer | undefined> {
    return this.store.get(transferId);
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private async finalize(
    transferId: string,
    nextState: "ACCEPTED" | "CANCELLED",
    explicitRequestId?: string
  ): Promise<OwnershipTransfer> {
    if (!transferId) {
      throw new AppError(
        400,
        TRANSFER_ERROR_CODES.INVALID_PAYLOAD,
        "transferId is required"
      );
    }

    const requestId = explicitRequestId ?? getRequestId();

    try {
      const updated = await this.store.finalize(transferId, nextState);

      logger.info({
        requestId,
        transferId,
        state: updated.state,
      }, "ownership-transfer.finalize.success");

      return updated;
    } catch (err) {
      if (err instanceof AppError && err.code === TRANSFER_ERROR_CODES.NOT_FOUND) {
        logger.warn({
          requestId,
          transferId,
          nextState,
        }, "ownership-transfer.finalize.not-found");
      } else if (
        err instanceof AppError &&
        err.code === TRANSFER_ERROR_CODES.ALREADY_FINALIZED
      ) {
        logger.warn({
          requestId,
          transferId,
          nextState,
        }, "ownership-transfer.finalize.already-finalized");
        Sentry.captureEvent({
          message: "ownership-transfer.finalize.already-finalized",
          level: "warning",
          tags: { requestId, transferId, nextState },
        });
      }
      throw err;
    }
  }
}

// Singleton shared by routes
export const ownershipTransferService = new OwnershipTransferService();
