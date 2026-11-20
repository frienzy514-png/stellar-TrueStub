# Frontend: Respect `Retry-After` on 429 Responses

**Issue:** #605
**Area:** `apps/frontend/src/lib/retry.ts` and its callers
**Depends on:** #604 — see [RATE_LIMIT_RETRY_AFTER.md](./RATE_LIMIT_RETRY_AFTER.md)

---

## 1. Goal

When the frontend gets a `429` with a `Retry-After` header, it must wait
**at least** that long before retrying. A fixed or exponential delay that is
shorter than the server's window just burns another request and keeps the
client rate-limited.

## 2. Current state (audit)

| Client / path | Retries 429? | Reads `Retry-After`? |
| ------------- | ------------ | -------------------- |
| `lib/retry.ts` → `retryWithBackoff` (used by single- and multi-release `useInitializeEscrow`) | Yes — `isTransientError` treats 429 as transient | **No.** Delay is always `baseDelayMs * 2^attempt` (1 s, 2 s, 4 s …) |
| `core/config/axios/http.ts` (Trustless Work axios instance) | No retry logic | No |
| `config/apollo.ts` `RetryLink` (#168) | Network errors only, never mutations | No |
| `middleware.ts` (Edge auth-route limiter, #192) | n/a — this is a **server** that *sends* `Retry-After` | n/a |

So the one place that retries 429s ignores the header. With the default
1 s base delay, a server asking for 60 s gets three requests in ~3 s.

## 3. Changes

### 3.1 Parse the header — `lib/retry.ts`

Add a helper that extracts the delay from an error:

```ts
/** Returns the server-requested delay in ms, or undefined if absent/invalid. */
export function getRetryAfterMs(error: unknown, now = Date.now()): number | undefined
```

- Look in `error.response.headers["retry-after"]` (axios — lower-cased) and
  `error.response.headers.get?.("Retry-After")` (fetch `Headers`).
- Support both formats allowed by RFC 9110:
  - delta-seconds: `"120"` → `120_000` ms;
  - HTTP-date: `"Wed, 21 Oct 2026 07:28:00 GMT"` → `date - now`, floored at 0.
- Return `undefined` for missing, negative, or unparsable values.

### 3.2 Use it in `retryWithBackoff`

```ts
const backoffMs = baseDelayMs * Math.pow(2, attempt);
const retryAfterMs = getRetryAfterMs(error);
const delayMs = retryAfterMs !== undefined ? Math.max(retryAfterMs, backoffMs) : backoffMs;
```

- Use the **larger** of the two, so we never retry sooner than the server asked.
- Add a `maxRetryAfterMs` option (default e.g. 60 000). If the server asks
  for longer than that, stop retrying and throw the error, rather than
  freezing the UI for minutes. Callers can show a "try again in N seconds"
  message from the parsed value.
- Pass the chosen delay to `onRetry` (e.g. `onRetry(attempt, error, delayMs)`)
  so the UI can show a countdown. Keep the existing parameters so current
  callers don't break.

### 3.3 Make sure the header is reachable

- Our backend's CORS config must expose the header to browser JS:
  `Access-Control-Expose-Headers: Retry-After` (and `RateLimit` if wanted).
  Without it, `error.response.headers["retry-after"]` is `undefined` in the
  browser even though the server sent it. Check `corsMiddleware` in
  `apps/backend`.
- Same-origin calls (Next.js `/api/*` routes) are not affected.

### 3.4 Out of scope

- Apollo `RetryLink`: it does not retry HTTP 429s today, and mutations are
  deliberately never retried. Leave it unless GraphQL rate limiting is added.
- No new retry logic for `http.ts`; callers that need retries should wrap
  calls in `retryWithBackoff`.

## 4. Tests to add

**Location:** `apps/frontend/src/lib/retry.test.ts`

Use fake timers (`vi.useFakeTimers()` / `jest.useFakeTimers()`).

1. **Delta-seconds:** `fn` rejects once with
   `{ response: { status: 429, headers: { "retry-after": "5" } } }`, then
   resolves. Advance time by 4 999 ms → `fn` called once. Advance 1 ms more →
   `fn` called twice and the promise resolves.
2. **HTTP-date:** same, with a date 3 s in the future → no retry before 3 s.
3. **Header shorter than backoff:** `retry-after: "0"` with `baseDelayMs: 1000`
   → waits the 1 000 ms backoff, not 0.
4. **No header:** behaves exactly as today (1 s, 2 s …).
5. **Too long:** `retry-after: "3600"` with default `maxRetryAfterMs` →
   throws immediately without retrying.
6. **Unit tests for `getRetryAfterMs`:** axios-style headers, fetch `Headers`,
   garbage values, negative values.

## 5. Acceptance criteria

- [ ] A simulated 429 with `Retry-After` makes the frontend wait at least that
      long before retrying (verified by test 1 and 2).
- [ ] Without the header, existing backoff behavior is unchanged.
- [ ] Backend CORS exposes `Retry-After` to the browser.
