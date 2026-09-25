/**
 * Tests for escrow-changelog.ts — issue #655
 *
 * Verifies:
 * 1. appendChangelogEntry adds a write-once entry.
 * 2. updateChangelogEntry always throws ChangelogImmutabilityError.
 * 3. Attempting to use the same entry id twice throws DuplicateChangelogEntryError.
 * 4. removeChangelogEntry removes the entry and returns it.
 * 5. getChangelog returns an ordered snapshot.
 * 6. getChangelogEntry retrieves single entries correctly.
 * 7. clearChangelog clears all entries for a contract.
 * 8. Events are emitted for every mutation.
 * 9. Entries are frozen (Object.isFrozen).
 * 10. Remove-and-recreate is the correct correction API.
 */

import {
  ChangelogImmutabilityError,
  DuplicateChangelogEntryError,
  appendChangelogEntry,
  updateChangelogEntry,
  removeChangelogEntry,
  getChangelog,
  getChangelogEntry,
  clearChangelog,
  clearAllChangelogs,
  setChangelogEventLogger,
  _changelogStore,
} from './escrow-changelog';
import type { ChangelogStoreEvent } from './escrow-changelog';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const CONTRACT_A = 'contract-changelog-aaa';
const CONTRACT_B = 'contract-changelog-bbb';

function makeEntry(
  id: string,
  contractId = CONTRACT_A,
  overrides: Partial<Parameters<typeof appendChangelogEntry>[0]> = {}
) {
  return appendChangelogEntry({
    id,
    contractId,
    kind: 'ESCROW_CREATED',
    description: `Test entry ${id}`,
    actor: 'GACTOR...',
    ...overrides,
  });
}

beforeEach(() => {
  clearAllChangelogs();
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. appendChangelogEntry
// ─────────────────────────────────────────────────────────────────────────────

describe('appendChangelogEntry()', () => {
  it('creates an entry with all required fields', () => {
    const entry = makeEntry('entry-001');

    expect(entry.id).toBe('entry-001');
    expect(entry.contractId).toBe(CONTRACT_A);
    expect(entry.kind).toBe('ESCROW_CREATED');
    expect(typeof entry.createdAt).toBe('string');
  });

  it('sets createdAt automatically if not supplied', () => {
    const before = new Date().toISOString();
    const entry = makeEntry('entry-002');
    const after = new Date().toISOString();

    expect(entry.createdAt >= before).toBe(true);
    expect(entry.createdAt <= after).toBe(true);
  });

  it('preserves caller-supplied createdAt', () => {
    const ts = '2025-01-01T00:00:00.000Z';
    const entry = makeEntry('entry-003', CONTRACT_A, { createdAt: ts });
    expect(entry.createdAt).toBe(ts);
  });

  it('stores metadata as frozen object', () => {
    const entry = makeEntry('entry-004', CONTRACT_A, {
      metadata: { key: 'value' },
    });
    expect(Object.isFrozen(entry.metadata)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. updateChangelogEntry always throws
// ─────────────────────────────────────────────────────────────────────────────

describe('updateChangelogEntry()', () => {
  it('always throws ChangelogImmutabilityError — entries are write-once', () => {
    makeEntry('entry-005');

    expect(() => updateChangelogEntry(CONTRACT_A, 'entry-005')).toThrow(
      ChangelogImmutabilityError
    );
  });

  it('throws even for non-existent entries (by design)', () => {
    expect(() => updateChangelogEntry(CONTRACT_A, 'ghost-entry')).toThrow(
      ChangelogImmutabilityError
    );
  });

  it('ChangelogImmutabilityError has correct entryId and code', () => {
    try {
      updateChangelogEntry(CONTRACT_A, 'entry-bad');
      fail('Expected ChangelogImmutabilityError');
    } catch (err) {
      expect(err).toBeInstanceOf(ChangelogImmutabilityError);
      const typed = err as ChangelogImmutabilityError;
      expect(typed.entryId).toBe('entry-bad');
      expect(typed.code).toBe('CHANGELOG_IMMUTABILITY_VIOLATION');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Duplicate id rejected
// ─────────────────────────────────────────────────────────────────────────────

describe('duplicate entry id', () => {
  it('throws DuplicateChangelogEntryError for same id on same contract', () => {
    makeEntry('entry-dup');
    expect(() => makeEntry('entry-dup')).toThrow(DuplicateChangelogEntryError);
  });

  it('throws DuplicateChangelogEntryError for same id on different contract', () => {
    makeEntry('entry-global', CONTRACT_A);
    expect(() => makeEntry('entry-global', CONTRACT_B)).toThrow(
      DuplicateChangelogEntryError
    );
  });

  it('DuplicateChangelogEntryError has correct entryId', () => {
    makeEntry('entry-dup2');
    try {
      makeEntry('entry-dup2');
      fail('Expected DuplicateChangelogEntryError');
    } catch (err) {
      expect(err).toBeInstanceOf(DuplicateChangelogEntryError);
      const typed = err as DuplicateChangelogEntryError;
      expect(typed.entryId).toBe('entry-dup2');
      expect(typed.code).toBe('DUPLICATE_CHANGELOG_ENTRY');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. removeChangelogEntry
// ─────────────────────────────────────────────────────────────────────────────

describe('removeChangelogEntry()', () => {
  it('removes the entry and returns it', () => {
    makeEntry('entry-006');
    const removed = removeChangelogEntry(CONTRACT_A, 'entry-006');

    expect(removed).not.toBeNull();
    expect(removed?.id).toBe('entry-006');
    expect(getChangelogEntry(CONTRACT_A, 'entry-006')).toBeUndefined();
  });

  it('returns null for non-existent entry', () => {
    expect(removeChangelogEntry(CONTRACT_A, 'ghost')).toBeNull();
  });

  it('returns null for non-existent contract', () => {
    expect(removeChangelogEntry('ghost-contract', 'entry-007')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. getChangelog
// ─────────────────────────────────────────────────────────────────────────────

describe('getChangelog()', () => {
  it('returns empty array for unknown contract', () => {
    expect(getChangelog('unknown')).toHaveLength(0);
  });

  it('returns entries in insertion order', () => {
    makeEntry('entry-a1');
    makeEntry('entry-a2');
    makeEntry('entry-a3');

    const entries = getChangelog(CONTRACT_A);
    expect(entries.map((e) => e.id)).toEqual(['entry-a1', 'entry-a2', 'entry-a3']);
  });

  it('returns a snapshot (not a live reference)', () => {
    makeEntry('entry-b1');
    const snapshot1 = getChangelog(CONTRACT_A);
    makeEntry('entry-b2');
    const snapshot2 = getChangelog(CONTRACT_A);

    expect(snapshot1).toHaveLength(1);
    expect(snapshot2).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. getChangelogEntry
// ─────────────────────────────────────────────────────────────────────────────

describe('getChangelogEntry()', () => {
  it('returns the correct entry by id', () => {
    makeEntry('entry-c1');
    makeEntry('entry-c2');

    const found = getChangelogEntry(CONTRACT_A, 'entry-c1');
    expect(found?.id).toBe('entry-c1');
  });

  it('returns undefined for missing id', () => {
    makeEntry('entry-c3');
    expect(getChangelogEntry(CONTRACT_A, 'entry-ghost')).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. clearChangelog
// ─────────────────────────────────────────────────────────────────────────────

describe('clearChangelog()', () => {
  it('returns true and clears all entries for the contract', () => {
    makeEntry('entry-d1');
    makeEntry('entry-d2');

    const cleared = clearChangelog(CONTRACT_A);
    expect(cleared).toBe(true);
    expect(getChangelog(CONTRACT_A)).toHaveLength(0);
  });

  it('returns false for an unknown contract', () => {
    expect(clearChangelog('ghost-contract')).toBe(false);
  });

  it('does not affect other contracts', () => {
    makeEntry('entry-e1', CONTRACT_A);
    makeEntry('entry-e2', CONTRACT_B);

    clearChangelog(CONTRACT_A);
    expect(getChangelog(CONTRACT_A)).toHaveLength(0);
    expect(getChangelog(CONTRACT_B)).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Event emission
// ─────────────────────────────────────────────────────────────────────────────

describe('changelog store events', () => {
  it('emits ENTRY_APPENDED when an entry is added', () => {
    const events: ChangelogStoreEvent[] = [];
    setChangelogEventLogger((e) => events.push(e));

    makeEntry('entry-log1');

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('ENTRY_APPENDED');
    expect(events[0].contractId).toBe(CONTRACT_A);
    expect(events[0].entryId).toBe('entry-log1');

    // Restore default logger
    setChangelogEventLogger(() => {});
  });

  it('emits ENTRY_REMOVED when an entry is removed', () => {
    makeEntry('entry-log2');
    const events: ChangelogStoreEvent[] = [];
    setChangelogEventLogger((e) => events.push(e));

    removeChangelogEntry(CONTRACT_A, 'entry-log2');

    expect(events[0].type).toBe('ENTRY_REMOVED');
    expect(events[0].entryId).toBe('entry-log2');

    setChangelogEventLogger(() => {});
  });

  it('emits CHANGELOG_CLEARED when contract is cleared', () => {
    makeEntry('entry-log3');
    const events: ChangelogStoreEvent[] = [];
    setChangelogEventLogger((e) => events.push(e));

    clearChangelog(CONTRACT_A);

    expect(events[0].type).toBe('CHANGELOG_CLEARED');

    setChangelogEventLogger(() => {});
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. Entries are frozen
// ─────────────────────────────────────────────────────────────────────────────

describe('entry immutability (Object.freeze)', () => {
  it('returned entry is frozen', () => {
    const entry = makeEntry('entry-frozen');
    expect(Object.isFrozen(entry)).toBe(true);
  });

  it('stored entry cannot be mutated directly (Object.freeze enforced in strict mode)', () => {
    const entry = makeEntry('entry-readonly');
    // Object.freeze causes a TypeError in strict mode (which jsdom/jest uses).
    // This is the expected behaviour — it proves the freeze is real.
    expect(() => {
      (entry as Record<string, unknown>)['description'] = 'mutated';
    }).toThrow(TypeError);
    // Value is unchanged
    expect(entry.description).toBe('Test entry entry-readonly');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. Remove-and-recreate pattern (documented API)
// ─────────────────────────────────────────────────────────────────────────────

describe('remove-and-recreate pattern', () => {
  it('allows correcting an entry by removing then re-appending', () => {
    // Append with wrong description
    makeEntry('entry-rr', CONTRACT_A, { description: 'Wrong description' });

    // Cannot update — must remove and recreate
    expect(() => updateChangelogEntry(CONTRACT_A, 'entry-rr')).toThrow(
      ChangelogImmutabilityError
    );

    removeChangelogEntry(CONTRACT_A, 'entry-rr');

    // Now re-create with correct data
    const corrected = appendChangelogEntry({
      id: 'entry-rr-v2',
      contractId: CONTRACT_A,
      kind: 'ESCROW_CREATED',
      description: 'Correct description',
      actor: 'GACTOR...',
    });

    expect(corrected.description).toBe('Correct description');
    expect(getChangelogEntry(CONTRACT_A, 'entry-rr')).toBeUndefined();
    expect(getChangelogEntry(CONTRACT_A, 'entry-rr-v2')).toBeDefined();
  });
});
