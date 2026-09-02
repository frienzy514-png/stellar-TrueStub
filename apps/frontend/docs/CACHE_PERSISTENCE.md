# Apollo Cache Persistence Strategy

> **Relates to:** `apps/frontend/src/lib/cache-persistence.ts`

---

## Overview

TrueStub persists its Apollo `InMemoryCache` to `localStorage` via
[`apollo-cache-persist`](https://github.com/apollographql/apollo-cache-persist)
so that the GraphQL data layer survives page refreshes without re-fetching
everything from Hasura.

---

## What is persisted

| Cached content | Notes |
|---|---|
| All Apollo query results | Escrow lists, user profiles, ticket metadata, Hasura GraphQL responses |
| Storage key | `truestub-apollo-cache` (see `CACHE_PERSISTENCE_KEY`) |
| Storage backend | `window.localStorage` |
| Max size | **5 MB** — writes that would exceed this are silently skipped by the library |
| Persist trigger | `"write"` — the snapshot is updated on every Apollo cache write |

---

## Expiry and versioning

`apollo-cache-persist` v0 has **no built-in TTL or schema-version check**.
The snapshot survives until one of the following:

1. **User logs out** — `LogoutButton` calls `clearPersistedCache()`, which
   removes the key from `localStorage`.
2. **Critical error** — `ErrorBoundaryWithCache` calls `apolloClient.clearStore()`
   followed by `clearPersistedCache()`, then reloads the page.
3. **Manual browser clear** — the user clears site data in DevTools / browser
   settings.

### Schema versioning (recommendation)

If you rename a GraphQL field, change a type, or restructure a cached object,
stale persisted data can cause Apollo type errors or silent data corruption.
The safest migration path is to **bump the storage key**:

```ts
// cache-persistence.ts
export const CACHE_PERSISTENCE_KEY = 'truestub-apollo-cache-v2'; // ← increment
```

Alternatively, call `clearPersistedCache()` once at app startup when you
detect a version mismatch (store your own schema version in a separate
`localStorage` key and compare on boot).

---

## Shared-device / logout risk

On a shared device, persisted cache from User A's session could be readable by
User B if the cache is not cleared on logout.

**Mitigation implemented:**  
`LogoutButton.tsx` calls `clearPersistedCache()` inside the `finally` block of
the logout handler, so the cache is wiped regardless of whether `signOut(auth)`
succeeds or throws.

**If you add new sign-out paths** (e.g. session-expiry middleware, SSO logout
redirects, mobile deep-link logout) you **must** call `clearPersistedCache()`
in those paths too. Failing to do so is a data-leak risk.

---

## Key files

| File | Role |
|---|---|
| `src/lib/cache-persistence.ts` | `setupCachePersistence`, `clearPersistedCache`, `CACHE_PERSISTENCE_KEY` |
| `src/lib/cache-persistence.test.ts` | Unit tests covering persistence setup, cache clearing, and logout integration |
| `src/components/auth/LogoutButton.tsx` | Calls `clearPersistedCache()` on every sign-out |
| `src/components/performance/ErrorBoundaryWithCache.tsx` | Calls `clearPersistedCache()` on critical render errors |
