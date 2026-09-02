/**
 * Escrow Changelog — closes #655
 *
 * Enforces write-once (immutable) changelog entries for escrow lifecycle events.
 *
 * ## Immutability contract
 * - Entries are **append-only**: once created, a `ChangelogEntry` cannot be
 *   updated in place.
 * - The only way to "correct" an entry is to **remove it and create a new one**
 *   (remove-and-recreate pattern).
 * - Attempting to call `updateChangelogEntry()` throws
 *   `ChangelogImmutabilityError` on every call — the method exists only to
 *   provide a clear, documented refusal.
 *
 * ## API summary
 * | Operation  | Method                    | Notes                         |
 * |------------|---------------------------|-------------------------------|
 * | Append     | `appendChangelogEntry()`  | Only allowed write operation  |
 * | Read all   | `getChangelog()`          | Returns immutable snapshot    |
 * | Read one   | `getChangelogEntry()`     | Returns entry copy or undef.  |
 * | Remove     | `removeChangelogEntry()`  | Returns removed entry or null |
 * | Clear      | `clearChangelog()`        | Admin / test reset            |
 * | Update     | `updateChangelogEntry()`  | Always throws — by design     |
 *
 * ## Event logging
 * Every mutation (append / remove) emits a structured `ChangelogEvent` via
 * `logChangelogEvent()` — replace the default implementation with your
 * preferred logger (console, Sentry, Hasura, etc.).
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** All supported lifecycle event kinds for escrow changelog entries. */
export type ChangelogEventKind =
  | 'ESCROW_CREATED'
  | 'ESCROW_FUNDED'
  | 'MILESTONE_APPROVED'
  | 'MILESTONE_STATUS_CHANGED'
  | 'FUNDS_RELEASED'
  | 'DISPUTE_STARTED'
  | 'DISPUTE_RESOLVED'
  | 'TRANSFER_INITIATED'
  | 'TRANSFER_COMPLETED'
  | 'TRANSFER_CANCELLED'
  | 'REFUND_CLAIMED'
  | 'ESCROW_CANCELLED'
  | 'CUSTOM';

/** A single, immutable changelog entry. */
export interface ChangelogEntry {
  /** Unique entry identifier (UUID or caller-supplied opaque string). */
  readonly id: string;
  /** The escrow contract this event belongs to. */
  readonly contractId: string;
  /** What kind of lifecycle event occurred. */
  readonly kind: ChangelogEventKind;
  /** Human-readable description. */
  readonly description: string;
  /** ISO-8601 timestamp (set once at creation). */
  readonly createdAt: string;
  /** Wallet address of the actor who triggered the event. */
  readonly actor: string;
  /** Optional on-chain transaction hash. */
  readonly txHash?: string;
  /** Arbitrary structured metadata (sealed at creation). */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Structured audit event emitted by the changelog store. */
export interface ChangelogStoreEvent {
  type: 'ENTRY_APPENDED' | 'ENTRY_REMOVED' | 'CHANGELOG_CLEARED';
  contractId?: string;
  entryId?: string;
  timestamp: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Thrown whenever a caller tries to update an existing changelog entry.
 * Per the immutability contract, updates are never permitted — use
 * remove-and-recreate instead.
 */
export class ChangelogImmutabilityError extends Error {
  readonly code = 'CHANGELOG_IMMUTABILITY_VIOLATION' as const;
  readonly entryId: string;

  constructor(entryId: string) {
    super(
      `Changelog entry '${entryId}' is immutable and cannot be updated. ` +
        'To correct it, remove the entry and append a new one.'
    );
    this.name = 'ChangelogImmutabilityError';
    this.entryId = entryId;
    Object.setPrototypeOf(this, ChangelogImmutabilityError.prototype);
  }
}

export class DuplicateChangelogEntryError extends Error {
  readonly code = 'DUPLICATE_CHANGELOG_ENTRY' as const;
  readonly entryId: string;

  constructor(entryId: string) {
    super(`A changelog entry with id '${entryId}' already exists.`);
    this.name = 'DuplicateChangelogEntryError';
    this.entryId = entryId;
    Object.setPrototypeOf(this, DuplicateChangelogEntryError.prototype);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Event logger (replaceable)
// ─────────────────────────────────────────────────────────────────────────────

/** Replace this with your production logger / Hasura mutation. */
let _logChangelogEvent: (event: ChangelogStoreEvent) => void = (event) => {
  // Default: structured console output
  console.info('[Changelog]', JSON.stringify(event));
};

/**
 * Replaces the event logger used by the changelog store.
 * Useful in tests and for wiring up Sentry, Hasura, etc.
 */
export function setChangelogEventLogger(
  logger: (event: ChangelogStoreEvent) => void
): void {
  _logChangelogEvent = logger;
}

// ─────────────────────────────────────────────────────────────────────────────
// In-memory store (module-singleton)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * contractId → ordered list of immutable entries.
 * @internal — exported only for test introspection.
 */
export const _changelogStore = new Map<string, ChangelogEntry[]>();

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Appends a new immutable entry to the changelog for `contractId`.
 *
 * @throws {DuplicateChangelogEntryError} if an entry with the same `id`
 *   already exists (across all contracts).
 */
export function appendChangelogEntry(
  entry: Omit<ChangelogEntry, 'createdAt'> & { createdAt?: string }
): Readonly<ChangelogEntry> {
  // Check for id uniqueness across all contracts
  for (const entries of _changelogStore.values()) {
    if (entries.some((e) => e.id === entry.id)) {
      throw new DuplicateChangelogEntryError(entry.id);
    }
  }

  const frozen: Readonly<ChangelogEntry> = Object.freeze({
    ...entry,
    createdAt: entry.createdAt ?? new Date().toISOString(),
    metadata: entry.metadata ? Object.freeze({ ...entry.metadata }) : undefined,
  });

  const existing = _changelogStore.get(entry.contractId) ?? [];
  _changelogStore.set(entry.contractId, [...existing, frozen]);

  _logChangelogEvent({
    type: 'ENTRY_APPENDED',
    contractId: entry.contractId,
    entryId: entry.id,
    timestamp: frozen.createdAt,
  });

  return frozen;
}

/**
 * **Always throws `ChangelogImmutabilityError`.**
 *
 * Changelog entries are write-once.  To correct an entry:
 * 1. `removeChangelogEntry(contractId, entryId)`
 * 2. `appendChangelogEntry({ ...correctedData })`
 *
 * This method exists so that callers receive a clear, actionable error rather
 * than a silent no-op or an obscure runtime failure.
 */
export function updateChangelogEntry(_contractId: string, entryId: string): never {
  throw new ChangelogImmutabilityError(entryId);
}

/**
 * Removes an entry by its `id` from the changelog for `contractId`.
 *
 * @returns The removed entry, or `null` if no matching entry was found.
 */
export function removeChangelogEntry(
  contractId: string,
  entryId: string
): Readonly<ChangelogEntry> | null {
  const entries = _changelogStore.get(contractId);
  if (!entries) return null;

  const index = entries.findIndex((e) => e.id === entryId);
  if (index === -1) return null;

  const [removed] = entries.splice(index, 1);
  _changelogStore.set(contractId, [...entries]);

  _logChangelogEvent({
    type: 'ENTRY_REMOVED',
    contractId,
    entryId,
    timestamp: new Date().toISOString(),
  });

  return removed;
}

/**
 * Returns an ordered, read-only snapshot of all changelog entries for
 * `contractId` (newest entries last).
 */
export function getChangelog(contractId: string): Readonly<ChangelogEntry>[] {
  return [...(_changelogStore.get(contractId) ?? [])];
}

/**
 * Returns a single entry by `id`, or `undefined` if not found.
 */
export function getChangelogEntry(
  contractId: string,
  entryId: string
): Readonly<ChangelogEntry> | undefined {
  return _changelogStore.get(contractId)?.find((e) => e.id === entryId);
}

/**
 * Clears all entries for `contractId`.
 *
 * @returns `true` if there were entries to clear, `false` otherwise.
 */
export function clearChangelog(contractId: string): boolean {
  const had = _changelogStore.has(contractId);
  _changelogStore.delete(contractId);

  if (had) {
    _logChangelogEvent({
      type: 'CHANGELOG_CLEARED',
      contractId,
      timestamp: new Date().toISOString(),
    });
  }

  return had;
}

/**
 * Clears changelogs for ALL contracts.  Intended for test teardown / logout.
 */
export function clearAllChangelogs(): void {
  _changelogStore.clear();
}
