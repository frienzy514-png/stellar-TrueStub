/**
 * Jest tests for ChangelogService write-once immutability — issue #155
 *
 * Mirror of changelog.service.test.ts but using Jest's API so the backend's
 * jest config (testMatch: ["**\/*.jest.test.ts"]) picks them up.
 */

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

      expect(entry.entryId).toBe(baseEntry.entryId);
      expect(entry.action).toBe(baseEntry.action);
      expect(entry.timestamp).toBeTruthy();

      const ts = new Date(entry.timestamp).getTime();
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after);
    });

    it("throws CHANGELOG_DUPLICATE_ENTRY on a second append with the same entryId", async () => {
      const { service } = makeService();
      await service.appendEntry(baseEntry);

      await expect(service.appendEntry(baseEntry)).rejects.toMatchObject({
        statusCode: 409,
        code: CHANGELOG_ERROR_CODES.DUPLICATE_ENTRY,
      });
    });

    it("throws 400 when required fields are missing", async () => {
      const { service } = makeService();

      await expect(
        service.appendEntry({ ...baseEntry, action: "" })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("deep-copies metadata so the stored entry is not affected by later mutations", async () => {
      const { service } = makeService();
      const meta = { key: "value" };
      await service.appendEntry({ ...baseEntry, metadata: meta });

      // Mutate original after append
      meta.key = "mutated";

      const stored = await service.getEntry(baseEntry.entryId);
      expect(stored!.metadata!.key).toBe("value");
    });

    it("emits ENTRY_APPENDED event", async () => {
      const { service } = makeService();
      const events: ChangelogEvent[] = [];
      service.onEvent((e) => events.push(e));

      await service.appendEntry(baseEntry);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("ENTRY_APPENDED");
      expect(events[0].entry.entryId).toBe(baseEntry.entryId);
    });
  });

  describe("updateEntry — always forbidden", () => {
    it("throws CHANGELOG_UPDATE_FORBIDDEN regardless of what fields are passed", async () => {
      const { service } = makeService();
      await service.appendEntry(baseEntry);

      await expect(
        service.updateEntry(baseEntry.entryId, { action: "tampered" })
      ).rejects.toMatchObject({
        statusCode: 409,
        code: CHANGELOG_ERROR_CODES.UPDATE_FORBIDDEN,
      });
    });

    it("throws CHANGELOG_UPDATE_FORBIDDEN even for non-existent entries", async () => {
      const { service } = makeService();

      await expect(
        service.updateEntry("ghost-id", { action: "anything" })
      ).rejects.toMatchObject({ code: CHANGELOG_ERROR_CODES.UPDATE_FORBIDDEN });
    });
  });

  describe("removeEntry", () => {
    it("removes an existing entry and returns it", async () => {
      const { service, store } = makeService();
      await service.appendEntry(baseEntry);

      const removed = await service.removeEntry(baseEntry.entryId);

      expect(removed.entryId).toBe(baseEntry.entryId);
      expect(store.size).toBe(0);
    });

    it("throws CHANGELOG_ENTRY_NOT_FOUND for unknown entryId", async () => {
      const { service } = makeService();

      await expect(service.removeEntry("does-not-exist")).rejects.toMatchObject({
        statusCode: 404,
        code: CHANGELOG_ERROR_CODES.NOT_FOUND,
      });
    });

    it("emits ENTRY_REMOVED event on removal", async () => {
      const { service } = makeService();
      const events: ChangelogEvent[] = [];
      service.onEvent((e) => events.push(e));

      await service.appendEntry(baseEntry);
      await service.removeEntry(baseEntry.entryId);

      const removeEvent = events.find((e) => e.type === "ENTRY_REMOVED");
      expect(removeEvent).not.toBeUndefined();
      expect(removeEvent!.entry.entryId).toBe(baseEntry.entryId);
    });

    it("documents: remove + recreate is the documented correction workflow", async () => {
      const { service } = makeService();

      await service.appendEntry({ ...baseEntry, action: "wrong_action" });
      await service.removeEntry(baseEntry.entryId);
      const corrected = await service.appendEntry({ ...baseEntry, action: "correct_action" });

      expect(corrected.action).toBe("correct_action");
    });
  });

  describe("listEntries", () => {
    it("lists all entries for a resource in chronological order", async () => {
      const { service } = makeService();

      await service.appendEntry({ ...baseEntry, entryId: "e-1", action: "step_1" });
      await service.appendEntry({ ...baseEntry, entryId: "e-2", action: "step_2" });

      const entries = await service.listEntries(baseEntry.resourceId);

      expect(entries).toHaveLength(2);
      expect(entries[0].action).toBe("step_1");
      expect(entries[1].action).toBe("step_2");
    });

    it("returns empty array when no entries exist for a resource", async () => {
      const { service } = makeService();
      expect(await service.listEntries("no-such-resource")).toEqual([]);
    });
  });
});
