# Backend README claims vs tests (issue #601)

> **Status: Snapshot (2026-11-20).** A point-in-time cross-check of
> `apps/backend/README.md` against the backend test suite. Re-run it and
> replace this file when the README changes. Don't edit it to look current.

## Method

Every specific, testable behavior claim in `apps/backend/README.md` is
listed below with the test that covers it, if there is one. Claims about
process ("when you add a variable, update this table") aren't behavior and
are left out. Some behavior the issue mentions (409 on a reused `refundId`,
502 when Trustless Work rejects a request) is described in the header
comment of `src/routes/refunds.ts`, not the README. It's included here
because that header is the de facto spec for the refund route.

Test status was found by reading the test files. The suite was **not** run
for this snapshot.

Legend: **Covered**: a test asserts the exact claim. **Partial**: a
test exists but at a different layer or for a weaker assertion. **Gap**: no
test.

## Matrix

### Setup and environment

| # | Claim | Test | Status |
| --- | --- | --- | --- |
| 1 | `GET /health` → `{"status":"ok","service":"truestub-backend"}` | `src/routes.smoke.test.ts` "GET /health returns 200 with the service name" | Covered |
| 2 | Env validation fails without the Firebase Admin vars | `src/config/env.test.ts` "should throw when a required Firebase Admin variable is missing" | Covered |
| 3 | Auth-protected routes return 401 without a valid token | `src/routes.smoke.test.ts` "auth-required routes"; CI curl loop in `backend-ci.yml` | Covered |
| 4 | Empty env values are treated as unset | — | Gap |
| 5 | Defaults: `CORS_ORIGINS=http://localhost:3000`, `LOG_LEVEL=info`, `RATE_LIMIT_WINDOW_MS=900000`, `RATE_LIMIT_MAX=100` | `env.test.ts` "should supply default values" checks `PORT` and `NODE_ENV` only | Partial |
| 6 | `TRUSTLESS_WORK_API_URL` / `STELLAR_NETWORK` default to testnet | — | Gap |

### Refunds

| # | Claim | Test | Status |
| --- | --- | --- | --- |
| 7 | Refund execution returns **503** until `TRUSTLESS_WORK_API_KEY` / `TRUSTLESS_WORK_DISPUTE_RESOLVER_SECRET` are set (`REFUND_EXECUTION_UNAVAILABLE`) | — (no test file asserts 503) | Gap |
| 8 | A second `POST /api/refunds/claim` with the same `refundId` returns **409** `REFUND_ALREADY_CLAIMED` and the winning claim | `src/services/refund.service.test.ts` "throws RefundAlreadyClaimed on second call" (service layer, `statusCode: 409`) | Partial: no route-level test checks the 409 body includes `claim` |
| 9 | Same `refundId` reused across escrows → **409** `REFUND_ID_REUSED_ACROSS_ESCROWS` | — | Gap |
| 10 | Trustless Work rejects the refund → **502** `REFUND_EXECUTION_FAILED` | — | Gap |
| 11 | Non-production build trying to submit to mainnet → **503** `REFUND_MAINNET_SUBMISSION_BLOCKED` | — | Gap |
| 12 | Two concurrent identical claims submit only one on-chain refund | `refund.service.test.ts` "only allows one of two concurrent claims… (#423)" | Covered |

### Disputes and transfers

| # | Claim | Test | Status |
| --- | --- | --- | --- |
| 13 | Dispute resolution returns **503** until the Trustless Work credentials are set | — | Gap |
| 14 | Transfer routes (`/api/transfers/*`) 401 without a token | Smoke test and CI curl on `/api/transfers/initiate` | Covered |

### Webhooks

| # | Claim | Test | Status |
| --- | --- | --- | --- |
| 15 | `POST /webhooks/escrow-status` rejects every delivery until `TRUSTLESS_WORK_WEBHOOK_SECRET` is set | `webhooks.test.ts` "fails closed with 500 when the webhook secret is not configured" | Covered (the README should say the code is **500**) |
| 16 | Unknown status → **400** | `webhooks.test.ts` "rejects a signed payload with an unknown status" | Covered |
| 17 | Every documented status has a `STATUS_MAP` entry; the table matches the map | `webhooks.test.ts` "STATUS_MAP coverage" | **Broken**: see below |
| 18 | A dedicated alert fires on a 400 from this route | — (no test asserts `Sentry.captureMessage` for unmapped status) | Gap |
| 19 | `--duplicate` delivery is deduplicated (no second notification) | `webhooks.test.ts` "is idempotent: replaying the identical signed payload…" | Covered |
| 20 | `simulate-webhook.ts` exits `0` on HTTP 200 and `1` otherwise | — | Gap (low priority; dev tool) |

### Changelog

| # | Claim | Test | Status |
| --- | --- | --- | --- |
| 21 | `PUT` / `PATCH /api/changelog/:id` always → **409** `CHANGELOG_UPDATE_FORBIDDEN` | `changelog.service.test.ts` (service layer) | Partial: no route test |
| 22 | `actorId` comes from the verified token, never the body (#379) | — | Gap |
| 23 | Unknown `action` → **400** `CHANGELOG_UNKNOWN_ENTRY_TYPE` | — | Gap |
| 24 | Each entry stores the request's `requestId` (#425) | `refund.service.test.ts` "threads a single correlation ID…" | Partial: covers the refund flow, not `POST /api/changelog` |
| 25 | A failed changelog write never rolls back the action it describes | — | Gap |

### Migrations

| # | Claim | Test | Status |
| --- | --- | --- | --- |
| 26 | Migrations apply in filename order | `migrate:up --check-order` in `backend-ci.yml` | Covered |

## Problems found

1. **The STATUS_MAP coverage test (row 17) should fail as written.** It
   checks uppercase keys (`ACTIVE`, `PENDING`, …) and `COMPLETE` against
   `STATUS_MAP`, which has only lowercase keys and no `complete`. The README
   table also disagrees with the code. Details and fix:
   [STATUS_MAP_DOC_CHECK.md](STATUS_MAP_DOC_CHECK.md) (#602).
2. **Row 15: the README is vague about the status code.** It says the
   webhook "rejects every delivery until set". The code and test return
   **500** (on purpose, so Trustless Work retries). The README should say
   500.

## Tests to add

In priority order. The money paths come first.

1. Route test, `POST /api/refunds/claim` (new `src/routes/refunds.test.ts`):
   - 503 `REFUND_EXECUTION_UNAVAILABLE` with credentials unset (row 7)
   - 502 `REFUND_EXECUTION_FAILED` when the executor rejects (row 10)
   - 409 `REFUND_ALREADY_CLAIMED`, with the response body including `claim`
     (row 8)
   - 409 `REFUND_ID_REUSED_ACROSS_ESCROWS` (row 9)
   - 503 `REFUND_MAINNET_SUBMISSION_BLOCKED` (row 11)
2. Dispute resolution 503 with credentials unset (row 13).
3. Fix the `STATUS_MAP coverage` test (row 17, part of #602).
4. Webhook: an unmapped status calls `Sentry.captureMessage` with level
   `warning` (row 18).
5. Changelog route tests (new `src/routes/changelog.test.ts`): `PUT`/`PATCH`
   409, body `actorId` ignored, unknown `action` 400, append failure doesn't
   fail the caller (rows 21–25).
6. `env.test.ts`: empty string treated as unset; remaining defaults (rows 4–6).

## Acceptance

- [ ] Every row above is **Covered**, or the README claim is reworded or
      removed.
- [ ] `yarn workspace @truestub/backend test` passes in CI.
- [ ] This file is replaced with a re-run snapshot showing no gaps.
