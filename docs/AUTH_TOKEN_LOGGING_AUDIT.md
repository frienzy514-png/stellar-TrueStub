# Audit: Decoded Auth Token (`res.locals.user`) in Log Output

**Issue:** #609
**Date:** 2026-11-20
**Target:** `apps/backend/src/middleware/auth.ts` and every logging call site in `apps/backend/src`.

---

## 1. Summary

`requireAuth` / `requireAdmin` store the **full decoded Firebase ID token** on
`res.locals.user` ([auth.ts:15](../apps/backend/src/middleware/auth.ts#L15)).
That payload includes `uid`, `email`, `email_verified`, `name`, `picture`,
`firebase.sign_in_provider`, and custom claims such as `role` and
`https://hasura.io/jwt/claims`. If it reaches a log sink, it leaks PII.

**Finding: no current call site logs `res.locals` or `res.locals.user`,
either directly or through a spread or wildcard.** The token stays out of the
logs today because nothing serializes it. No redaction rule covers it. A
test should lock that in (see §4).

## 2. Where `res.locals` is read or written

| Location | Access | Logged? |
| --- | --- | --- |
| `middleware/auth.ts:15` | writes `res.locals.user` (full decoded token) | No |
| `middleware/auth.ts:36` | reads `role` claims for `requireAdmin` | No |
| `routes/disputes.ts:174` | reads `res.locals.user.uid` only | No |
| `lib/firebase-admin.ts:60` | writes `res.locals.userId` (uid string only) | No |

A search for `...res`, `...req`, and `res.locals` passed to any `logger.*`,
`req.log.*`, `Sentry.*` or `console.*` call returned no matches outside tests.

## 3. Logging paths reviewed

### `middleware/requestLogger.ts` (pino-http)

- Uses pino-http's **default serializers**. The `req` serializer emits only
  `id, method, url, query, params, headers, remoteAddress, remotePort`. The
  `res` serializer emits `statusCode` and headers. **`res.locals` is not part
  of either serializer**, so the decoded token is never included.
- `customProps` adds only `requestId`.
- `Authorization`, `Cookie` and `x-webhook-secret` headers are redacted. The
  raw ID token in `Authorization` is therefore covered too.

### `lib/logger.ts` (base pino instance)

- In production, `*.token` is redacted. That catches a field literally named
  `token` one level deep. It does **not** catch `user.email`, `user.uid`, or a
  nested `res.locals.user` object. Do not treat it as a safety net for this
  case.
- In development (`pino-pretty`) there is **no redaction at all**.

### `middleware/errorHandler.ts`

- Logs `{ err }` and `{ err, code }` only. Neither includes `res`.

### Sentry (`lib/sentry.ts`)

- Tags and context set in this codebase are limited to `requestId` and route
  names. No user object is attached via `Sentry.setUser`.

## 4. Required test (acceptance criterion)

Add `apps/backend/src/middleware/requestLogger.test.ts` (or extend
`auth.test.ts`) with these steps:

1. Build the app with `createApp()`. Point the logger at an in-memory
   destination (e.g. `pino(opts, stream)` capturing lines into an array), or
   spy on the stream used by `logger`.
2. Mock `firebaseAuth.verifyIdToken` to return a token with **sentinel
   values**, e.g.
   `{ uid: "uid-SENTINEL-609", email: "sentinel-609@example.test", role: "user" }`.
3. Send authenticated requests through at least:
   - a success path (`GET /api/disputes?...` → 200)
   - a 4xx path (an `AppError`, logged at `warn` by `errorHandler`)
   - a 5xx path (a route that throws, logged at `error`)
4. Assert that **no captured log line** contains `sentinel-609@example.test`,
   and that no line contains the token object verbatim
   (`JSON.stringify(decodedToken)`).
5. Assert that the `Authorization` header value appears only as `[REDACTED]`.

The 4xx and 5xx paths matter most: error paths are where a future
`logger.error({ req, res }, ...)` or `{ ...res.locals }` is most likely to
appear.

## 5. Guidance for contributors

- **Never** pass `res`, `res.locals`, or `res.locals.user` to a logger, to
  Sentry `extra`/`context`, or into a changelog `metadata` object. To log who
  acted, log `uid` only.
- Do not add a custom pino-http `res` serializer that walks `res.locals`.
- When you add a new logged field that may hold a user object, add an explicit
  redact path (e.g. `"*.email"`) instead of relying on `*.token`.

## 6. Related pre-existing issues (out of scope, noted for follow-up)

- `lib/logger.ts`, `lib/sentry.ts` and `lib/trustless-work.ts` import
  `getRequestId` from `./requestLogger`, which does not exist under `lib/`.
  `middleware/requestLogger.ts` exports `getCorrelationId`, not
  `getRequestId`. These imports must be fixed before the test in §4 can run.
- `correlationContext` is exported but never mounted in `index.ts`.
