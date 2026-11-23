# `/api/analytics` access model

_Status: Living. Decision recorded 2026-11-21 (issue #630)._

## Decision

`GET /api/analytics` is **intentionally platform-wide and admin-only**.

- It aggregates every escrow on the platform. `fetchEscrows` in
  `apps/backend/src/routes/analytics.ts` has no `user_id`, owner, or tenant
  filter, and that is by design: the endpoint powers the operator
  dashboard (`AnalyticsDashboard` / `use-analytics-data.ts`), which shows total
  volume, total value locked, completion and dispute rates for the whole
  platform.
- Because the data is platform-wide, the access control is **admin gating**,
  not row scoping. The router is mounted in `apps/backend/src/index.ts` as
  `app.use("/api/analytics", requireAdmin, analyticsRouter)`. `requireAdmin`
  verifies the Firebase ID token and requires the server-issued `admin` role
  claim; anyone else gets `401` / `403`.
- TrueStub has no operator/tenant concept today: there is one platform
  operator, and sellers and buyers are end users. So there is no "operator's
  own data" to scope this view to.

## Why this was confirmed now

Before this change the analytics router existed but was not mounted, while the
frontend already called `/api/analytics` and expected admin-only responses
(`401`/`403` messages in `use-analytics-data.ts`). Mounting it without a
recorded decision would have made "whatever the auth middleware happens to be"
the access model by default. Recording it means a future reviewer can tell a
deliberate platform-wide query from a missing filter.

## Rules that follow from this

1. Never mount `analyticsRouter` without `requireAdmin` (or an equivalent
   admin-only check).
2. Never reuse `fetchEscrows` for a user-facing endpoint. It reads through the
   Hasura admin client and bypasses Hasura row permissions.
3. Per-user statistics (for example a seller's own earnings) belong in a
   **separate** endpoint or Hasura query that filters by the authenticated
   user, enforced server-side or by Hasura permissions. Do not add an optional
   `userId` parameter to this endpoint.
4. If TrueStub ever adds multiple operators/tenants, this decision must be
   revisited: add a tenant-scoped endpoint and keep this one restricted to
   platform super-admins.
