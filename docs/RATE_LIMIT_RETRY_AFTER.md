# Rate-Limit Responses Must Include `Retry-After`

**Issue:** #604
**Area:** `apps/backend/src/middleware/rateLimiter.ts`, `apps/backend/src/index.ts`
**Related:** #605 (frontend respects `Retry-After`) — see
[FRONTEND_RETRY_AFTER_HANDLING.md](./FRONTEND_RETRY_AFTER_HANDLING.md)

---

## 1. Goal

Every `429 Too Many Requests` the backend returns should carry a standard
`Retry-After` header (seconds until the client may retry). Without it,
well-behaved clients — including our own frontend — fall back to guessing a
delay, often retry too early, and hit the limit again.

## 2. Current state (audit)

| Item | Finding |
| ---- | ------- |
| Limiters defined | Only `authRateLimiter`. **There is no `writeRateLimiter`** in the codebase, even though the issue text mentions one. |
| Where applied | `app.use("/api/auth", authRateLimiter)` in `apps/backend/src/index.ts`. No other route group is rate-limited on the backend. |
| Library | `express-rate-limit` `^7.5.0` |
| Header config | `standardHeaders: "draft-7"`, `legacyHeaders: false` |
| 429 body | Custom `handler` → `{ error: { code: "RATE_LIMIT_EXCEEDED", message } }` |
| Test env | `skip()` returns `true` when `NODE_ENV === "test"` — the limiter is **disabled in tests**. |

### Is `Retry-After` sent today?

Probably yes, but it is not verified. In `express-rate-limit` v7, when either
`standardHeaders` or `legacyHeaders` is enabled, the middleware sets
`Retry-After` on a blocked request *before* calling the `handler`, so the
custom JSON handler should not remove it. `draft-7` also adds the combined
`RateLimit` and `RateLimit-Policy` headers.

That behavior lives in the library, not in our code, so a future library
upgrade, a switch to `standardHeaders: false`, or a handler that calls
`res.set()`/`res.removeHeader()` could silently drop it. Hence the test.

## 3. Changes

1. **Make it explicit in the handler.** Set the header ourselves so it does
   not depend on library defaults:

   ```ts
   handler(req, res, _next, options) {
     const resetTime = req.rateLimit?.resetTime;
     const seconds = resetTime
       ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
       : Math.ceil(options.windowMs / 1000);
     res.set("Retry-After", String(seconds));
     res.status(429).json({ error: { code: "RATE_LIMIT_EXCEEDED", message: "Too many requests. Please try again later." } });
   }
   ```

   `Retry-After` must be a whole number of seconds (≥ 1), not milliseconds
   and not a decimal.

2. **Make the limiter testable.** Because `skip()` disables it under
   `NODE_ENV=test`, export a factory (e.g. `createAuthRateLimiter(opts)`) that
   tests can call with a tiny `max` and `skip: () => false`, and build
   `authRateLimiter` from it. Keep the production export unchanged.

3. **Any future limiter** (e.g. a write limiter for `/api/listings`,
   `/api/refunds`, `/api/transfers`, `/api/disputes`) should be built from the
   same factory/handler so it gets `Retry-After` for free.

## 4. Test to add

**Location:** `apps/backend/src/middleware/rateLimiter.test.ts`

1. Mount a limiter from the factory with `max: 1`, `windowMs: 60_000`,
   `skip: () => false` on a throwaway Express app with a dummy route.
2. Send two requests from the same IP.
3. Assert on the second response:
   - `status === 429`;
   - `headers["retry-after"]` is present;
   - it parses as an integer, `>= 1` and `<= 60`;
   - `body.error.code === "RATE_LIMIT_EXCEEDED"`.
4. Assert the first (allowed) response does **not** carry `Retry-After`.

## 5. Acceptance criteria

- [ ] A 429 from the backend includes a `Retry-After` header in whole seconds.
- [ ] A test fails if the header disappears or the 429 shape changes.
- [ ] The limiter can be exercised in tests despite the `NODE_ENV=test` skip.
