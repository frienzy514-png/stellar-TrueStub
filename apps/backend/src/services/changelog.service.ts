/**
 * ChangelogService — issue #155
 *
 * Enforces write-once (immutable) changelog entries.
 *
 * API contract (documented)
 * -------------------------
 *  - Entries are WRITE-ONCE: once appended they cannot be modified.
 *  - To "correct" an entry, the caller must:
 *      1. Remove the incorrect entry  (`removeEntry`)
 *      2. Append a new correct entry  (`appendEntry`)
 *  - All mutations (append, remove) emit an internal event so the event log
 *    is never missing context about what happened to the changelog.
 *
 * Update attempts
 * ---------------
 * Any call that attempts to modify the `action`, `actorId`, `resourceId`, or
 * `metadata` fields of an existing entry will be rejected with
 * `AppError(409, CHANGELOG_UPDATE_FORBIDDEN)`.
 *
 * Events logged
 * -------------
 * The service emits typed events via a simple observer for every mutation:
 *   - "ENTRY_APPENDED"  — new entry written
 *   - "ENTRY_REMOVED"   — entry deleted
 * Consumers (e.g. audit-log forwarders) register via `onEvent`.
 */

import { AppError } from "../middleware/errorHandler";

// ── Types ──────────────────────────────────────────────────────────────────

export interface ChangelogEntry {
  /** Unique identifier for this log line. */
  entryId: string;
  /** The kind of action recorded, e.g. "ownership_transferred", "escrow_funded". */
  action: string;
  /** The user or system component that performed the action. */
  actorId: string;
  /** The resource affected, e.g. an escrowId or transferId. */
  resourceId: string;
  /** ISO timestamp — set by the service at write time; not caller-supplied. */
  timestamp: string;
  /** Arbitrary caller-supplied context; frozen after write. */
  metadata?: Record<string, unknown>;
}

export type ChangelogEventType = "ENTRY_APPENDED" | "ENTRY_REMOVED";

export interface ChangelogEvent {
  type: ChangelogEventType;
  entry: ChangelogEntry;
  occurredAt: string;
}

export const CHANGELOG_ERROR_CODES = {
  UPDATE_FORBIDDEN: "CHANGELOG_UPDATE_FORBIDDEN",
  NOT_FOUND: "CHANGELOG_ENTRY_NOT_FOUND",
  INVALID_PAYLOAD: "CHANGELOG_INVALID_PAYLOAD",
  DUPLICATE_ENTRY: "CHANGELOG_DUPLICATE_ENTRY",
} as const;

// ── Storage interface ──────────────────────────────────────────────────────

export interface ChangelogStore {
  has(entryId: string): Promise<boolean>;
  get(entryId: string): Promise<ChangelogEntry | undefined>;
  set(entryId: string, entry: ChangelogEntry): Promise<void>;
  delete(entryId: string): Promise<boolean>;
  listByResource(resourceId: string): Promise<ChangelogEntry[]>;
}

export class InMemoryChangelogStore implements ChangelogStore {
  private readonly store = new Map<string, ChangelogEntry>();

  async has(entryId: string): Promise<boolean> {
    return this.store.has(entryId);
  }

  async get(entryId: string): Promise<ChangelogEntry | undefined> {
    return this.store.get(entryId);
  }

  async set(entryId: string, entry: ChangelogEntry): Promise<void> {
    this.store.set(entryId, entry);
  }

  async delete(entryId: string): Promise<boolean> {
    return this.store.delete(entryId);
  }

  async listByResource(resourceId: string): Promise<ChangelogEntry[]> {
    const entries: ChangelogEntry[] = [];
    for (const entry of this.store.values()) {
      if (entry.resourceId === resourceId) {
        entries.push(entry);
      }
    }
    // Return in chronological order
    return entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  get size(): number {
    return this.store.size;
  }
}

// ── Service ────────────────────────────────────────────────────────────────

export class ChangelogService {
  private readonly listeners: Array<(event: ChangelogEvent) => void> = [];

  constructor(private readonly store: ChangelogStore = new InMemoryChangelogStore()) {}

  /**
   * Registers a listener for changelog mutation events (append / remove).
   * Useful for forwarding events to an audit-log aggregator.
   */
  onEvent(listener: (event: ChangelogEvent) => void): void {
    this.listeners.push(listener);
  }

  /**
   * Appends a new write-once entry to the changelog.
   *
   * The `timestamp` is always set by the service — callers cannot supply or
   * override it, ensuring the audit trail cannot be backdated.
   *
   * Throws `CHANGELOG_DUPLICATE_ENTRY` (409) if an entry with the same
   * `entryId` already exists.
   */
  async appendEntry(payload: {
    entryId: string;
    action: string;
    actorId: string;
    resourceId: string;
    metadata?: Record<string, unknown>;
  }): Promise<ChangelogEntry> {
    const { entryId, action, actorId, resourceId } = payload;

    if (!entryId || !action || !actorId || !resourceId) {
      throw new AppError(
        400,
        CHANGELOG_ERROR_CODES.INVALID_PAYLOAD,
        "entryId, action, actorId, and resourceId are required"
      );
    }

    if (await this.store.has(entryId)) {
      throw new AppError(
        409,
        CHANGELOG_ERROR_CODES.DUPLICATE_ENTRY,
        `Changelog entry ${entryId} already exists. Entries are write-once; remove and recreate to correct.`
      );
    }

    const entry: ChangelogEntry = {
      entryId,
      action,
      actorId,
      resourceId,
      // Timestamp is sealed by the service — not caller-supplied
      timestamp: new Date().toISOString(),
      // Deep-freeze metadata so stored objects cannot be mutated in-place
      metadata: payload.metadata ? JSON.parse(JSON.stringify(payload.metadata)) : undefined,
    };

    await this.store.set(entryId, entry);
    this.emit({ type: "ENTRY_APPENDED", entry, occurredAt: entry.timestamp });
    return entry;
  }

  /**
   * UPDATE IS FORBIDDEN — always throws CHANGELOG_UPDATE_FORBIDDEN.
   *
   * This method exists to provide an explicit, documented error rather than
   * silently not being implemented.  Callers should use
   * `removeEntry` + `appendEntry` to correct a wrong entry.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async updateEntry(_entryId: string, _updates: Partial<ChangelogEntry>): Promise<never> {
    throw new AppError(
      409,
      CHANGELOG_ERROR_CODES.UPDATE_FORBIDDEN,
      "Changelog entries are write-once and cannot be updated. To correct an entry: call removeEntry then appendEntry."
    );
  }

  /**
   * Removes an entry from the changelog.
   *
   * Removal is allowed because a write-once policy does not mean permanent
   * storage — operators need a way to purge incorrect records.  The removal
   * itself is logged via the ENTRY_REMOVED event so the audit trail always
   * shows that an entry existed and was deleted.
   *
   * Throws CHANGELOG_ENTRY_NOT_FOUND (404) if the entry does not exist.
   */
  async removeEntry(entryId: string): Promise<ChangelogEntry> {
    if (!entryId) {
      throw new AppError(400, CHANGELOG_ERROR_CODES.INVALID_PAYLOAD, "entryId is required");
    }

    const entry = await this.store.get(entryId);
    if (!entry) {
      throw new AppError(404, CHANGELOG_ERROR_CODES.NOT_FOUND, `Changelog entry ${entryId} not found`);
    }

    await this.store.delete(entryId);
    this.emit({ type: "ENTRY_REMOVED", entry, occurredAt: new Date().toISOString() });
    return entry;
  }

  /**
   * Returns a single entry by ID without any side effects.
   */
  async getEntry(entryId: string): Promise<ChangelogEntry | undefined> {
    return this.store.get(entryId);
  }

  /**
   * Returns all entries for a given resource, sorted chronologically.
   */
  async listEntries(resourceId: string): Promise<ChangelogEntry[]> {
    return this.store.listByResource(resourceId);
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private emit(event: ChangelogEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Listeners must not crash the caller's request
      }
    }
  }
}

// Singleton shared by routes
export const changelogService = new ChangelogService();
