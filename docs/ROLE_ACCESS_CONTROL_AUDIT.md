# Role-Based Access Control Audit: Client-Only vs. Server-Enforced

**Date:** 2026-08-27
**Target:** `apps/frontend/src/utils/role-utils.ts` and every UI surface that reads its role.

---

## 1. Executive Summary

`role-utils.ts` is a **client-only** role heuristic. It must never be treated as
an access control mechanism by itself — it exists purely to decide what the UI
*shows*, not what the backend *allows*. This audit:

1. Enumerates every place the app currently gates behavior by role.
2. States, for each one, whether a matching server-side check exists today.
3. Documents the split-responsibility model contributors must follow going
   forward: **the UI hides an action; Hasura permissions (or an equivalent
   server-side check) are what actually block it.**

**Headline finding:** every role-gated surface in the app today reads from
mock data (`fetchMockEscrows`, `generateMockEscrows` in
`apps/frontend/src/lib/mockData.ts`), not from a live Hasura query. There is
also no Hasura metadata (permissions, roles, table config) checked into this
repository — it isn't tracked anywhere the codebase can point to (see the
comment in `apps/backend/src/routes/sync-user.ts`, which explicitly notes the
same gap for the `users` table schema). This means the role-gated actions
below have **no server enforcement to audit yet**, because there is no live
backend query behind them. That is the real risk this document flags: the
moment any of these views are wired to a real Hasura query (tracked
separately as GraphQL-wiring follow-up work), the matching Hasura role
permission must land in the same change, not after.

---

## 2. How `role-utils.ts` determines role

```
getUserRole() → reads localStorage["address-wallet"] → substring match
  on the wallet address ("admin" → admin, "hotel"/"event" → event, else guest)
```

This is trivially spoofable: any script running in the page (or a user via
devtools) can set `localStorage["address-wallet"]` to a string containing
`"admin"` and immediately see admin-only UI. That is expected and acceptable
**for UI purposes only** — nothing about it should be relied on to protect
data or mutations.

---

## 3. Role-gated surfaces and their current enforcement

| Surface | File | Gates on | Data source | Server-side check today |
|---|---|---|---|---|
| Role-based escrow dashboard | `components/dashboard/RoleEscrowDashboard.tsx` | `userRole` prop (`guest`/`event`/`admin`) controls which stat cards, quick actions, and table columns render | `fetchMockEscrows()` (mock, no network call) | None — no query exists to protect |
| Escrow dashboard page wrapper | `app/dashboard/escrow-dashboard/RoleEscrowDashboardPage.tsx` | Resolves role via `getUserRole()` and passes it down | Mock | None |
| Quick actions panel | `RoleEscrowDashboard.tsx` (`QuickActions`) | Shows manager-only actions (e.g. approve/dispute) when `userRole !== "guest"` | Mock | None |
| Escrow table | `RoleEscrowDashboard.tsx` (`EscrowTable`) | Shows admin-only columns/actions | Mock | None |

No route in the app currently performs a real GraphQL mutation gated by
`getUserRole()`'s output — every "manager" or "admin" action in the dashboard
above only changes local React state derived from mock data.

---

## 4. Required split-responsibility model (for future wiring)

When any of the above surfaces are connected to real Hasura queries/mutations
(tracked in separate GraphQL-wiring issues), the following must hold:

- **Client (`role-utils.ts` and its callers):** decide what to render. Fine
  to trust for UX — hiding a button, disabling a form, changing copy.
- **Server (Hasura permissions):** decide what to allow. The `X-Hasura-Role`
  and `X-Hasura-User-Id` session variables — populated from the verified
  Firebase ID token, the same token already attached by
  `apps/frontend/src/config/apollo.ts` — must be checked in each table's
  `select`/`insert`/`update`/`delete` permission, or in the referenced
  Hasura Action's server-side handler. A client-side role check must never
  be the last line of defense for a mutation or a row's visibility.
- Every PR that wires a manager/admin-only action to a real query or
  mutation must also add (or point to) the corresponding Hasura permission
  in the same change, and note it in this document's table above.

**Action item for maintainers:** Hasura metadata (roles, permissions) should
be checked into this repository (e.g. a `hasura/metadata` directory) so PRs
that add role-gated queries can be reviewed against the actual permission
rules, not just the client code. Today reviewers have no way to verify
server-side enforcement from this repo alone.
