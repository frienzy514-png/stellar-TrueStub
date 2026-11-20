# Changelog DELETE Audit Trail ("log-level delete + event")

**Issue:** #607
**Date:** 2026-11-20
**Target:** `apps/backend/src/routes/changelog.ts` (`DELETE /api/changelog/:entryId`) and `services/changelog.service.ts` (`removeEntry`).

---

## 1. What "log-level delete + event" means

The changelog is write-once. Entries cannot be updated (PUT/PATCH → 409), but
they can be **removed** so operators can purge incorrect records. The
documented contract is that a removal is **never silent**: deleting the row
must also produce an auditable record that the entry existed and was deleted.

## 2. Current implementation

`ChangelogService.removeEntry(entryId)`:

1. Returns 400 if `entryId` is empty and 404 if the entry does not exist.
2. Deletes the row from the store.
3. Emits an `ENTRY_REMOVED` event to every `onEvent` listener with
   `{ type, entry, occurredAt, requestId }`. The **full removed entry** is
   carried in the event.

So the "event" half exists. Gaps:

- **No listener is registered in production.** `onEvent` is only a hook. With
  no audit forwarder subscribed, the `ENTRY_REMOVED` event goes nowhere and
  the deletion is effectively silent.
- **Listener errors are swallowed** in `emit()`. A failing forwarder does not
  block the delete. That is the right call for availability, but it must at
  least log the failure.
- **Order of operations:** the row is deleted *before* the event is emitted.
  If the process dies between the two, the entry is gone with no trace. Once
  the store is persistent, record the deletion in the same transaction as the
  delete (e.g. a `changelog_deletions` table or a tombstone row).
- **Signature mismatch:** the route calls
  `removeEntry(entryId, { requestId })`, but the service accepts only
  `entryId`. The `requestId` the route passes is ignored. The service falls
  back to `entry.requestId ?? getRequestId()`, so the event may carry the
  **original append's** request ID instead of the deleting request's ID.
  Record both: `requestId` for the delete request and `entry.requestId` for
  the original append.
- **Actor not captured:** the event does not record **who** deleted the entry.
  The route should pass `res.locals.user.uid` through as `deletedBy`.

## 3. Required test (acceptance criterion)

Add to `services/changelog.service.test.ts`:

1. Create a `ChangelogService` and register an `onEvent` listener that pushes
   into an array.
2. `appendEntry(...)`, then `removeEntry(entryId)`.
3. Assert:
   - `getEntry(entryId)` returns `undefined` (row removed).
   - Exactly one `ENTRY_REMOVED` event was emitted after the `ENTRY_APPENDED`
     event.
   - The event's `entry` deep-equals the removed entry, and `occurredAt` is a
     valid ISO timestamp no earlier than the entry's `timestamp`.
4. A failed removal of an unknown ID (404) emits **no** `ENTRY_REMOVED`
   event.

Add a route-level test in `routes/changelog.test.ts`:

5. `DELETE /api/changelog/:entryId` with an authenticated user returns
   `{ removed: true, entry }`. The registered listener receives
   `ENTRY_REMOVED` carrying the **delete request's** `x-request-id` (and
   `deletedBy` once added).

## 4. Follow-up work (separate from the test)

- Register a production audit listener at startup in `index.ts`. At minimum
  it should log at `info` level: `changelog.entry_removed` with `entryId`,
  `resourceId`, `action`, `deletedBy` and `requestId`. It may also forward to
  the audit sink.
- Fix the `removeEntry` signature so it accepts
  `{ requestId, deletedBy }`.
- When the changelog becomes persistent, write the deletion record
  transactionally with the delete.
