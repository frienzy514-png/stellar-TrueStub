# Environment schema audit: every `env.X` read vs `envSchema` (#526)

**Status:** Living. The table below is generated from the code by
`node scripts/check-env-schema-usage.mjs --report`; re-run it after adding or
moving an environment variable instead of editing the table by hand.

## Why

`apps/backend/src/config/env.ts` is the only place backend configuration is
validated, and its Zod schema is the sole source of the `Env` type
(`export type Env = z.infer<typeof envSchema>`). A read of `env.SOMETHING` that
is not a schema key therefore has no value at runtime: it is always
`undefined`, and TypeScript would reject it — but only when the type checker
actually runs.

`apps/backend/src/lib/hasura.ts` shipped exactly that mistake
(`env.HASURA_ADMIN_SECRET` instead of `env.HASURA_GRAPHQL_ADMIN_SECRET`, #524).
Rather than wait to find the next instance one runtime failure at a time, #526
asks for a deliberate sweep.

## Scope and method

1. Extract every top-level key from `envSchema`.
2. Scan every `.ts` file under `apps/backend/src` (89 files) for
   `env.<IDENTIFIER>` reads, excluding `process.env.X` and `this.env.X`.
3. Cross-check each key against the schema, fix real mismatches, and enforce
   the rule in CI with `scripts/check-env-schema-usage.mjs`
   (`.github/workflows/env-schema-check.yml`).

Result on this branch: **36 schema keys, 28 distinct `env.X` keys read, 0
mismatches.** A deliberate mismatch (`env.NOT_A_SCHEMA_KEY` in any backend
source file) makes the check exit non-zero and prints the file and line, so
the failure is actionable in review.

## Findings and fixes

| Finding | Impact | Resolution |
| --- | --- | --- |
| `lib/hasura.ts` read `env.HASURA_ADMIN_SECRET`, which is not in the schema. | `requireHasuraConfig()` always saw `adminSecret === undefined`, so every backend → Hasura operation (escrow-status webhook, `sync-user` upsert, refund/dispute/changelog writes) threw "must be configured" even with the secret set correctly. | Already corrected to `env.HASURA_GRAPHQL_ADMIN_SECRET`; the legacy `HASURA_ADMIN_SECRET` name is still accepted as a validation-time alias, with the canonical name winning when both are set. Transport-level tests now cover the header, both config error paths, and alias precedence. |
| `index.ts` read `env.DISPUTE_RESOLVER_WALLET_ADDRESS`, which is not in the schema. | Always `undefined`, so the dispute-resolver balance monitor never started — regardless of the address being configured — and users only saw the "not configured" warning. | Key declared in `envSchema`, validated as a Stellar `G...` account id, and read through `env` (#526). |
| `services/dispute-resolver-balance.service.ts` read `DISPUTE_RESOLVER_WALLET_ADDRESS` and `DISPUTE_RESOLVER_LOW_BALANCE_THRESHOLD` from `process.env`. | Bypassed validation: a typo produced a silent "skipped" check and a malformed threshold disabled the low-balance alert with no error. | Both now come from validated `env`; a malformed value fails startup with a named variable instead of being ignored. |
| `validateEnv` read `result.error.errors`. | Zod 4 removed `ZodError.errors`, so *any* invalid configuration threw `TypeError: Cannot read properties of undefined (reading 'map')` instead of listing the offending variables. This is why a wrong Hasura secret produced no useful message. | Reads `result.error.issues`; a regression test asserts every invalid variable is reported in one message (#524). |

Schema keys with no reader are not considered mismatches: `FIREBASE_PROJECT_ID`,
`FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `SENDGRID_API_KEY`,
`NOTIFICATION_FROM_EMAIL`, `FRONTEND_TRUSTLESS_NETWORK`, `BACKEND_REPLICAS` and
`ALLOW_UNSAFE_MULTI_INSTANCE` are consumed by other layers (Firebase SDK,
`docker-compose.yml`, the network startup check) or are reserved for routes
that have not landed. Since they are declared, they are safe to read later.

## Direct `process.env` reads (advisory)

The guard is strict about `env.X` only. `process.env.X` reads bypass validation
entirely, so they cannot have a name mismatch, but they can still be
unvalidated and undocumented. The following remain; each is a candidate for a
separate cleanup rather than a blocker for #526:

| Variable | Where | Why it is not in the schema today |
| --- | --- | --- |
| `CI` | `services/refund.service.ts` | CI platform variable, not TrueStub configuration. |
| `NODE_ENV`, `STELLAR_NETWORK`, `TRUSTLESS_WORK_API_URL` | `services/refund.service.ts` | Validated equivalents exist; these direct reads duplicate them for the mainnet submission guard. |
| `RELEASE_VERSION`, `MIGRATION_AUDIT_LOG_FILE` | `db/migrationAudit.ts` | Migration-audit CLI inputs, read before/around app config. |
| `DATABASE_URL` | `db/migrationAudit.ts` | Same CLI path. |

## Full audit table

Generated with `node scripts/check-env-schema-usage.mjs --report`.

| Variable | Referenced as `env.X` | Where |
| --- | --- | --- |
| `PORT` | 2 | `index.ts` |
| `NODE_ENV` | 15 | `config/firebase-startup-check.ts`, `config/firebase.ts`, `db/migrationAudit.ts`, `index.ts`, `lib/firebase-admin.ts`, `lib/logger.ts`, `lib/sentry.ts`, `middleware/errorHandler.ts`, `middleware/rateLimiter.ts` |
| `FIREBASE_ADMIN_PROJECT_ID` | 5 | `config/firebase-startup-check.ts`, `config/firebase.ts`, `lib/firebase-admin.ts` |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | 3 | `config/firebase-startup-check.ts`, `config/firebase.ts`, `lib/firebase-admin.ts` |
| `FIREBASE_ADMIN_PRIVATE_KEY` | 2 | `config/firebase.ts`, `lib/firebase-admin.ts` |
| `TRUSTLESS_WORK_WEBHOOK_SECRET` | 1 | `routes/webhooks.ts` |
| `TRUSTLESS_WORK_WEBHOOK_ALLOWED_IPS` | 1 | `routes/webhooks.ts` |
| `FIREBASE_PROJECT_ID` | 0 | — |
| `FIREBASE_CLIENT_EMAIL` | 0 | — |
| `FIREBASE_PRIVATE_KEY` | 0 | — |
| `LOG_LEVEL` | 1 | `lib/logger.ts` |
| `CORS_ORIGINS` | 1 | `middleware/security.ts` |
| `RATE_LIMIT_WINDOW_MS` | 2 | `middleware/rateLimiter.ts` |
| `RATE_LIMIT_MAX` | 2 | `middleware/rateLimiter.ts` |
| `FINANCIAL_OPERATION_SLOW_MS` | 1 | `lib/financial-operation-monitor.ts` |
| `EMAIL_PROVIDER` | 1 | `services/notification.service.ts` |
| `SENDGRID_API_KEY` | 0 | — |
| `NOTIFICATION_FROM_EMAIL` | 0 | — |
| `HASURA_GRAPHQL_URL` | 3 | `lib/hasura.ts`, `lib/startup-checks.ts`, `services/deep-health.service.ts` |
| `HASURA_GRAPHQL_ADMIN_SECRET` | 3 | `lib/hasura.ts`, `lib/startup-checks.ts`, `services/deep-health.service.ts` |
| `DATABASE_URL` | 9 | `config/database-startup-check.ts`, `lib/postgres.ts`, `lib/startup-checks.ts`, `services/deep-health.service.ts` |
| `PG_POOL_MAX` | 1 | `lib/postgres.ts` |
| `PG_IDLE_TIMEOUT_MS` | 1 | `lib/postgres.ts` |
| `PG_CONNECTION_TIMEOUT_MS` | 3 | `config/database-startup-check.ts`, `lib/postgres.ts`, `services/deep-health.service.ts` |
| `PG_QUERY_TIMEOUT_MS` | 3 | `config/database-startup-check.ts`, `lib/postgres.ts`, `services/deep-health.service.ts` |
| `TRUSTLESS_WORK_API_URL` | 1 | `lib/trustless-work.ts` |
| `TRUSTLESS_WORK_API_KEY` | 2 | `config/trustless-work-startup-check.ts`, `lib/trustless-work.ts` |
| `TRUSTLESS_WORK_DISPUTE_RESOLVER_SECRET` | 4 | `config/trustless-work-startup-check.ts`, `lib/trustless-work.ts`, `services/refund.resolver-mismatch.test.ts`, `services/refund.secret-redaction.test.ts` |
| `STELLAR_NETWORK` | 1 | `lib/trustless-work.ts` |
| `DISPUTE_RESOLVER_WALLET_ADDRESS` | 3 | `index.ts`, `services/dispute-resolver-balance.service.ts` |
| `DISPUTE_RESOLVER_LOW_BALANCE_THRESHOLD` | 1 | `services/dispute-resolver-balance.service.ts` |
| `FRONTEND_TRUSTLESS_NETWORK` | 0 | — |
| `SENTRY_DSN` | 2 | `lib/sentry.ts` |
| `CRITICAL_ALERT_WEBHOOK_URL` | 6 | `lib/financial-operation-monitor.test.ts`, `lib/financial-operation-monitor.ts`, `lib/sentry.ts` |
| `BACKEND_REPLICAS` | 0 | — |
| `ALLOW_UNSAFE_MULTI_INSTANCE` | 0 | — |

## How to re-run

```bash
node scripts/check-env-schema-usage.mjs            # CI mode: fails on mismatch
node scripts/check-env-schema-usage.mjs --report   # also prints this table
```

Installing a new variable is a three-step change: declare it in `envSchema`,
document it in `apps/backend/.env.example`, and read it through `env`.
