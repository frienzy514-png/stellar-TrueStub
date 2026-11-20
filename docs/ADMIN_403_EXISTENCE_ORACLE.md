# Admin Routes: Consistent 403 That Doesn't Reveal Whether a Resource Exists

**Issue:** #603
**Area:** `apps/backend/src/middleware/auth.ts` (`requireAdmin`), admin-only routes
**Related:** [ROLE_ACCESS_CONTROL_AUDIT.md](./ROLE_ACCESS_CONTROL_AUDIT.md)

---

## 1. The problem

For an admin-only resource, a non-admin must get the **same** response
whether or not the resource exists. If a non-admin probing
`/admin/thing/real-id` gets `403` but `/admin/thing/fake-id` gets `404`, the
status code tells them which IDs are real. That is a resource-existence
oracle — a small but real information leak (e.g. confirming which listings
are under fraud review).

The rule: **authorization is checked before lookup.** A non-admin must never
reach code that can return `404`, `400`, `409`, etc. for an admin route.

## 2. Current state (audit)

| Item | Finding |
| ---- | ------- |
| `requireAdmin` | Defined in `apps/backend/src/middleware/auth.ts`. Authenticates, reads `role` (or the Hasura `x-hasura-role` claim), returns `403 { error: "Administrator access is required" }` if not `admin`. It never looks at route params, so on its own it cannot leak existence. |
| Where it is used | **Nowhere.** It is imported in `apps/backend/src/index.ts` but not mounted on any router. |
| Listing-fraud review actions | No admin-only backend route exists yet. |
| Moderation queue | Not implemented. |
| Store-status endpoint | Proposed, not implemented. |

So today there is nothing to leak — but also nothing protecting the first
admin route that gets added. This issue is about locking in the correct
pattern before those routes land.

### Ways the leak usually gets introduced

- Mounting `requireAdmin` **inside** the handler, after a
  `findById(...) → 404` check.
- Using `router.param("id", ...)` to load the resource; Express runs param
  callbacks before route-level middleware, so a 404 can fire before
  `requireAdmin`.
- Validating the ID format first (`400` for bad IDs, `403` for good ones).
- Different response **bodies** or noticeably different timing even when the
  status code matches.

## 3. Required pattern

Mount `requireAdmin` at the router level, before any param loader or
validation:

```ts
// apps/backend/src/index.ts
app.use("/api/admin", requireAdmin, adminRouter);
```

Inside `adminRouter`, it is then safe to return `404` for missing resources,
because only admins can reach that code.

Also:

- Keep the 403 body fixed: `{ error: "Administrator access is required" }`
  — never include the resource ID or anything derived from it.
- Don't use `router.param` on admin routers to load resources unless the
  router itself is already behind `requireAdmin`.
- Unauthenticated requests should get the same `401` for every ID, for the
  same reason.

## 4. Test to add

**Location:** `apps/backend/src/middleware/auth.test.ts` now; extend to each
admin router as it is added (e.g. `routes/admin.test.ts`).

Since no admin routes exist yet, start with a test that mounts `requireAdmin`
in front of a dummy router which **does** return 404 for unknown IDs:

```ts
const router = Router();
router.get("/things/:id", (req, res) =>
  req.params.id === "exists" ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" }),
);
app.use("/api/admin", requireAdmin, router);
```

Then, with a valid **non-admin** token:

1. `GET /api/admin/things/exists` → record status and body.
2. `GET /api/admin/things/does-not-exist` → record status and body.
3. Assert both are `403` and the bodies are deep-equal.
4. Repeat with a malformed ID (e.g. `../`, a very long string) — still `403`.
5. With an **admin** token, assert `200` / `404` respectively (proves the
   dummy route really would leak if the guard were missing).
6. With **no** token, assert both IDs return the identical `401`.

When real admin routes are added (fraud review, moderation queue, store
status), each gets the same pair-wise assertion for every method it exposes
(`GET`, `POST`, `PATCH`, `DELETE`).

## 5. Acceptance criteria

- [ ] A test confirms a non-admin gets an identical `403` (status and body)
      for an existing and a nonexistent resource ID.
- [ ] The test fails if `requireAdmin` is moved after the resource lookup.
- [ ] New admin routes are mounted behind `requireAdmin` at the router level.
