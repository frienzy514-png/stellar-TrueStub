# Backend

Node/TypeScript backend for the ticket-resale platform.

## Running with docker-compose

The root `docker-compose.yml` builds this app (`apps/backend/Dockerfile`) as the
`backend` service alongside Postgres and Hasura:

```bash
cp .env.example .env   # at the repo root
yarn docker:up
curl http://localhost:4000/health   # → {"status":"ok","service":"truestub-backend"}
curl http://localhost:4000/health/deep # dependency-aware health for monitoring
```

`GET /health` is a lightweight liveness endpoint and does not contact external
services. `GET /health/deep` checks both Postgres (`SELECT 1`) and Hasura using
the configured admin secret. It returns `healthy` when both dependencies pass,
`degraded` with HTTP 200 when the process is alive but one dependency is
unavailable or misconfigured, and `down` with HTTP 503 when neither dependency
is available. Error details never include credentials.

Every variable validated by `src/config/env.ts` is passed through by the
compose file. Empty values are treated as unset.

| Variable | Required | Notes |
| --- | --- | --- |
| `HASURA_GRAPHQL_ADMIN_SECRET` | yes | Shared with the `hasura` service. |
| `FIREBASE_ADMIN_PROJECT_ID` / `_CLIENT_EMAIL` / `_PRIVATE_KEY` | yes | Env validation fails without them; auth-protected routes (`/api/refunds`, `/api/transfers`, `/api/disputes`, `/api/saved-searches`, …) 401 every request without a real service-account key. |
| `DATABASE_URL`, `HASURA_GRAPHQL_URL` | set by compose | Point at the in-network `postgres` / `hasura` services. |
| `TRUSTLESS_WORK_API_KEY`, `TRUSTLESS_WORK_DISPUTE_RESOLVER_SECRET` | no | Refund execution and dispute resolution return 503 until set. |
| `TRUSTLESS_WORK_WEBHOOK_SECRET` | no | `POST /webhooks/escrow-status` rejects every delivery until set. |
| `TRUSTLESS_WORK_API_URL`, `STELLAR_NETWORK` | no | Default to testnet. |
| `SENTRY_DSN`, `CRITICAL_ALERT_WEBHOOK_URL` | no | Error tracking / refund-transfer failure alerts. |
| `CORS_ORIGINS`, `LOG_LEVEL`, `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX` | no | Defaults: `http://localhost:3000`, `info`, `900000`, `100`. |
| `EMAIL_PROVIDER`, `SENDGRID_API_KEY`, `NOTIFICATION_FROM_EMAIL` | no | Notification delivery. |

When a new required variable is added to `src/config/env.ts`, add it to the
`backend` service in `docker-compose.yml`, the root `.env.example`, and this
table.

## Talking to Hasura

There is one path from backend code to Hasura, in two layers:

| Layer | File | Role |
|---|---|---|
| Service | `src/services/hasura.service.ts` (`HasuraService`) | Domain operations (escrow status writes, notifications, refund retry counters, ...). **Start here.** |
| Transport | `src/lib/hasura.ts` (`hasuraClient`, `hasuraRequest`) | Raw HTTP client: admin-secret header, request-ID forwarding, error mapping. No domain queries. |

New code that needs Hasura should add or reuse a `HasuraService` method. Only
services (and tests mocking the transport) should import `lib/hasura.ts`
directly. A few older routes (`analytics.ts`, `users.ts`, `sync-user.ts`) still
call `hasuraRequest` directly; move those queries into `HasuraService` when
touching them.

## Simulating webhook deliveries locally

`scripts/simulate-webhook.ts` builds a correctly HMAC-SHA256-signed
Trustless Work escrow-status payload and POSTs it to a running backend
instance. It lets you exercise the full webhook path — signature
verification, dedup, Hasura write, notifications — without waiting for a
real Trustless Work testnet event.

**Pre-requisites**: a backend instance running (e.g. `yarn dev`) with
`TRUSTLESS_WORK_WEBHOOK_SECRET` set.

```bash
# Default run — fires one "completed" event to http://localhost:4000
yarn simulate:webhook

# Override status / contract ID
yarn simulate:webhook --status funded --contractId CAABC123...

# Exercise the duplicate-delivery dedup guard (sends the same payload twice)
yarn simulate:webhook --status disputed --duplicate
```

Available flags (all optional):

| Flag | Default | Description |
|------|---------|-------------|
| `--status` | `completed` | Escrow status (`funded`, `completed`, `released`, `disputed`, …) |
| `--contractId` | random hex | Stellar contract / escrow ID |
| `--engagementId` | _(empty)_ | Falls back to contractId in the handler |
| `--amount` | `150.00` | Escrow amount string |
| `--currency` | `USDC` | Asset currency code |
| `--recipientEmail` | `buyer@example.com` | For the notification side-effect path |
| `--recipientName` | `Alice Buyer` | Recipient display name |
| `--role` | `buyer` | Notification perspective (`buyer` \| `seller`) |
| `--url` | `http://localhost:{PORT}/webhooks/escrow-status` | Override the full endpoint URL |
| `--secret` | `TRUSTLESS_WORK_WEBHOOK_SECRET` / `dev-secret` | HMAC signing key |
| `--duplicate` | false | Send the same payload twice to test the dedup guard |

Exit `0` on HTTP 200, `1` on any other response or network error.

## Database migrations

Migrations live in `src/db/migrations/` and are applied in filename order.

### SafeTrust-era `hotels` rows (migration `002_rename_hotels_to_events.sql`)

Databases carried over from SafeTrust may contain a `public.hotels` table. The
migration renames it in place to `events` so existing rows survive. A rename
alone does **not** guarantee that the carried-over rows are meaningful in the
ticket-resale domain — hospitality-shaped rows renamed into an events table are
not automatically valid ticket-resale events.

#### Confirming whether legacy data exists

Run the following against each environment before/after applying the migration.
A fresh database (no SafeTrust history) returns zero rows and needs no further
action.

```sql
-- Pre-migration: does a legacy hotels table with real rows exist?
SELECT count(*) AS legacy_hotels_rows
FROM public.hotels;

-- Post-migration: how many rows came from the rename?
SELECT count(*) AS renamed_event_rows
FROM public.events;
```

If `legacy_hotels_rows` is `0` (or the `hotels` table does not exist), the
environment is fresh: there is nothing to verify or backfill.

#### Verification pass for environments with legacy rows

When legacy rows are present, verify that the renamed rows carry sensible
values for the ticket-resale domain rather than leftover hospitality data.
The checks below flag rows that look like hospitality records masquerading as
events. Any row returned by these queries must be reviewed (and either
backfilled or removed) before the environment is considered migrated.

```sql
-- 1. Rows missing the fields the ticket-resale domain requires.
SELECT id
FROM public.events
WHERE name IS NULL
   OR starts_at IS NULL
   OR venue IS NULL;

-- 2. Hospitality-shaped leftovers: rows whose name/description still read
--    like hotel inventory rather than a ticketed event.
SELECT id, name
FROM public.events
WHERE name ILIKE '%hotel%'
   OR name ILIKE '%room%'
   OR name ILIKE '%night stay%'
   OR name ILIKE '%check-in%';

-- 3. Rows with no ticket-resale signal at all (no price and no capacity).
SELECT id, name
FROM public.events
WHERE price IS NULL
  AND capacity IS NULL;
```

#### Backfill / remediation

- Rows that fail check 1 should be backfilled with the correct ticket-resale
  values, or deleted if they cannot be mapped to a real event.
- Rows that fail checks 2 or 3 are almost certainly SafeTrust hospitality data.
  They should be removed from `events` (or archived) rather than left in place,
  since they would otherwise surface as invalid events.
- Record the outcome of this pass (counts before/after) in the migration PR so
  the verification is documented for the environment it was run against.

If no environment reports legacy rows, document that finding here and no
backfill is required.

## Trustless Work escrow statuses

`POST /webhooks/escrow-status` receives escrow status updates from Trustless
Work. The handler in `src/routes/webhooks.ts` maps each incoming status through
`STATUS_MAP` to the internal status used by this backend.

### Canonical status list

The keys of `STATUS_MAP` must cover **every** status value Trustless Work can
send, as documented in Trustless Work's API reference. The canonical list is:

| Trustless Work status | Mapped internal status |
| --- | --- |
| `created` | `pending` |
| `funded` | `funded` |
| `in_progress` | `in_progress` |
| `completed` | `completed` |
| `released` | `released` |
| `disputed` | `disputed` |
| `resolved` | `resolved` |
| `cancelled` | `cancelled` |
| `refunded` | `refunded` |

### Completeness contract

- Every documented Trustless Work status **must** have an entry in
  `STATUS_MAP`. A status that is documented but missing from the map is a bug:
  a legitimate webhook delivery for that status would be rejected.
- A status that is **not** in `STATUS_MAP` is treated as unknown and the
  request is rejected with a `400` response. This is intentional — the backend
  refuses to guess an internal status for a value it does not recognise.
- Because a `400` here almost always means the map is out of date rather than
  the caller sending a malformed request, a dedicated alert fires for `400`
  responses on this route (separate from generic error monitoring). If that
  alert triggers, the fix is to add the new status to `STATUS_MAP` and to the
  table above.
- When Trustless Work introduces a new status, update `STATUS_MAP`, the table
  above, and the test that asserts the map covers the documented statuses.

## Changelog (audit log) API

`src/routes/changelog.ts` (issue #155) is the backend's **audit log**: a
write-once record of the significant things that happen to money and
ownership in TrueStub — disputes being raised and resolved, refunds,
ticket transfers, and account deletions.

### Why a ticket-escrow app needs it

TrueStub holds buyers' money in escrow and moves ticket ownership between
users. When something goes wrong — a buyer says they never got a refund, a
seller disputes a resolution, support needs to explain why a dispute was
escalated — we need a trustworthy answer to "what happened, when, and who
did it". Normal logs rotate and can't be relied on for that, and database
rows get updated in place, losing their history.

The changelog is that answer. Its rules exist to keep it trustworthy:

- **Write-once.** An entry can't be edited. `PUT` and `PATCH` always return
  `409 CHANGELOG_UPDATE_FORBIDDEN`. If an entry is wrong, `DELETE` it and
  `POST` a corrected one, so the correction is itself visible.
- **Actor comes from the token.** `actorId` is taken from the verified
  Firebase token, never from the request body, so entries can't be forged on
  someone else's behalf (#379).
- **Fixed entry types.** `action` must be one of the types in
  `src/services/changelog-taxonomy.ts` (documented in
  [docs/CHANGELOG_TAXONOMY.md](../../docs/CHANGELOG_TAXONOMY.md)); anything
  else is rejected with `400 CHANGELOG_UNKNOWN_ENTRY_TYPE` (#416).
- **Correlated.** Each entry stores the request's `requestId`, so one refund
  can be traced across logs, Sentry and the changelog (#425).

### What writes to it

| Entry type | Written by | `resourceId` |
| --- | --- | --- |
| `dispute.raised`, `dispute.escalated`, `dispute.resolved`, `dispute.withdrawn` | `DisputeService` on every dispute state transition (`src/services/dispute.service.ts`) | disputeId |
| `dispute.sla_breach` | `GET /api/disputes/sla/breaches` when an escalated dispute is past its SLA (`src/routes/disputes.ts`) | disputeId |
| `account.deleted` | `DELETE /api/users/me` after anonymising an account — records only the uid and reason, no PII (`src/routes/users.ts`) | userId |
| `refund.submitted`, `refund.completed`, `transfer.completed` | Reserved in the taxonomy for the refund and transfer flows; those flows don't write them yet | refundId / transferId |

Backend code writes through `changelogService.appendEntry()` directly.
`POST /api/changelog` is for authenticated clients and operator tooling that
need to record an event the backend doesn't produce itself. Audit writes are
best-effort: a failed changelog write never rolls back the action it
describes.

### Who reads it

- **Support and operators** investigating a dispute, refund or deletion use
  `GET /api/changelog/resource/:resourceId` (paginated with `limit` /
  `offset`) to see the full history of one resource, and
  `GET /api/changelog/:entryId` for one entry.
- **The refund end-to-end check** in `src/routes/refunds.ts` asserts that the
  changelog recorded every step of the refund → dispute chain.
- **Audit-log forwarders** can subscribe to `ENTRY_APPENDED` / `ENTRY_REMOVED`
  events with `changelogService.onEvent(...)` to ship entries to long-term
  storage. None is registered yet.

### Endpoints

All routes require `Authorization: Bearer <Firebase ID token>`.

| Method | Path | Result |
| --- | --- | --- |
| `POST` | `/api/changelog` | `201` with the new entry |
| `GET` | `/api/changelog/:entryId` | `200` with the entry, or `404` |
| `GET` | `/api/changelog/resource/:resourceId` | `200` with a page of entries |
| `DELETE` | `/api/changelog/:entryId` | `200`, emits `ENTRY_REMOVED` |
| `PUT` / `PATCH` | `/api/changelog/:entryId` | always `409 CHANGELOG_UPDATE_FORBIDDEN` |

### Known limitations

- Entries are held **in memory** (`ChangelogService` uses a `Map`), so they
  are lost on restart and not shared between instances. Durable storage and
  the archival plan are described at the top of
  `src/services/changelog.service.ts` (#432).
- `DisputeService` creates its own `ChangelogService` instance, so dispute
  transition entries are not yet visible through `/api/changelog`. Wiring it
  to the shared `changelogService` will fix that.
