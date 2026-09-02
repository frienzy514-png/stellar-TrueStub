/**
 * Tests for ChangelogService write-once immutability — issue #155
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ChangelogService,
  InMemoryChangelogStore,
  CHANGELOG_ERROR_CODES,
  type ChangelogEvent,
} from "./changelog.service";
import { AppError } from "../middleware/errorHandler";

function makeService() {
  const store = new InMemoryChangelogStore();
  return { service: new ChangelogService(store), store };
}

const baseEntry = {
  entryId: "entry-001",
  action: "ownership_transferred",
  actorId: "user-alice",
  resourceId: "escrow-xyz",
  metadata: { fromOwner: "alice", toOwner: "bob" },
};

describe("ChangelogService — write-once immutability (#155)", () => {
  describe("appendEntry", () => {
    it("creates a new entry with a server-generated timestamp", async () => {
      const { service } = makeService();
      const before = Date.now();
      const entry = await service.appendEntry(baseEntry);
      const after = Date.now();

      assert.equal(entry.entryId, baseEntry.entryId);
      assert.equal(entry.action, baseEntry.action);
      assert.ok(entry.timestamp, "timestamp must be set");
      const ts = new Date(entry.timestamp).getTime();
      assert.ok(ts >= before && ts <= after, "timestamp should be in the current range");
    });

    it("throws CHANGELOG_DUPLICATE_ENTRY on a second append with the same entryId", async () => {
      const { service } = makeService();
      await service.appendEntry(baseEntry);

      await assert.rejects(
        () => service.appendEntry(baseEntry),
        (err: unknown) => {
          assert.ok(err instanceof AppError);
          assert.equal((err as AppError).statusCode, 409);
          assert.equal((err as AppError).code, CHANGELOG_ERROR_CODES.DUPLICATE_ENTRY);
          return true;
        }
      );
    });

    it("throws 400 when required fields are missing", async () => {
      const { service } = makeService();

      await assert.rejects(
        () => service.appendEntry({ ...baseEntry, action: "" }),
        (err: unknown) => {
          assert.ok(err instanceof AppError);
          assert.equal((err as AppError).statusCode, 400);
          return true;
        }
      );
    });

    it("deep-copies metadata so the stored entry is not affected by later mutations", async () => {
      const { service } = makeService();
      const meta = { key: "value" };
      await service.appendEntry({ ...baseEntry, metadata: meta });

      // Mutate original object after append
      meta.key = "mutated";

      const stored = await service.getEntry(baseEntry.entryId);
      assert.equal(stored!.metadata!.key, "value", "stored metadata should be immutable");
    });

    it("emits ENTRY_APPENDED event", async () => {
      const { service } = makeService();
      const events: ChangelogEvent[] = [];
      service.onEvent((e) => events.push(e));

      await service.appendEntry(baseEntry);

      assert.equal(events.length, 1);
      assert.equal(events[0].type, "ENTRY_APPENDED");
      assert.equal(events[0].entry.entryId, baseEntry.entryId);
    });
  });

  describe("updateEntry — always forbidden", () => {
    it("throws CHANGELOG_UPDATE_FORBIDDEN regardless of what fields are passed", async () => {
      const { service } = makeService();
      await service.appendEntry(baseEntry);

      await assert.rejects(
        () => service.updateEntry(baseEntry.entryId, { action: "tampered" }),
        (err: unknown) => {
          assert.ok(err instanceof AppError);
          assert.equal((err as AppError).statusCode, 409);
          assert.equal((err as AppError).code, CHANGELOG_ERROR_CODES.UPDATE_FORBIDDEN);
          return true;
        }
      );
    });

    it("throws CHANGELOG_UPDATE_FORBIDDEN even for non-existent entries", async () => {
      const { service } = makeService();

      await assert.rejects(
        () => service.updateEntry("ghost-id", { action: "anything" }),
        (err: unknown) => {
          assert.ok(err instanceof AppError);
          assert.equal((err as AppError).code, CHANGELOG_ERROR_CODES.UPDATE_FORBIDDEN);
          return true;
        }
      );
    });
  });

  describe("removeEntry", () => {
    it("removes an existing entry and returns it", async () => {
      const { service, store } = makeService();
      await service.appendEntry(baseEntry);

      const removed = await service.removeEntry(baseEntry.entryId);

      assert.equal(removed.entryId, baseEntry.entryId);
      assert.equal(store.size, 0);
    });

    it("throws CHANGELOG_ENTRY_NOT_FOUND for unknown entryId", async () => {
      const { service } = makeService();

      await assert.rejects(
        () => service.removeEntry("does-not-exist"),
        (err: unknown) => {
          assert.ok(err instanceof AppError);
          assert.equal((err as AppError).statusCode, 404);
          assert.equal((err as AppError).code, CHANGELOG_ERROR_CODES.NOT_FOUND);
          return true;
        }
      );
    });

    it("emits ENTRY_REMOVED event on removal", async () => {
      const { service } = makeService();
      const events: ChangelogEvent[] = [];
      service.onEvent((e) => events.push(e));

      await service.appendEntry(baseEntry);
      await service.removeEntry(baseEntry.entryId);

      const removeEvent = events.find((e) => e.type === "ENTRY_REMOVED");
      assert.ok(removeEvent, "ENTRY_REMOVED event should be emitted");
      assert.equal(removeEvent!.entry.entryId, baseEntry.entryId);
    });

    it("documents: remove + recreate is the documented correction workflow", async () => {
      const { service } = makeService();

      // Step 1: append with a wrong action
      await service.appendEntry({ ...baseEntry, action: "wrong_action" });

      // Step 2: remove the incorrect entry
      await service.removeEntry(baseEntry.entryId);

      // Step 3: append the corrected entry
      const corrected = await service.appendEntry({ ...baseEntry, action: "correct_action" });

      assert.equal(corrected.action, "correct_action");
    });
  });

  describe("listEntries", () => {
    it("lists all entries for a resource in chronological order", async () => {
      const { service } = makeService();

      await service.appendEntry({ ...baseEntry, entryId: "e-1", action: "step_1" });
      await service.appendEntry({ ...baseEntry, entryId: "e-2", action: "step_2" });

      const entries = await service.listEntries(baseEntry.resourceId);

      assert.equal(entries.length, 2);
      assert.equal(entries[0].action, "step_1");
      assert.equal(entries[1].action, "step_2");
    });

    it("returns empty array when no entries exist for a resource", async () => {
      const { service } = makeService();
      const entries = await service.listEntries("no-such-resource");
      assert.deepEqual(entries, []);
    });
  });
});
