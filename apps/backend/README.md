# TrueStub — Backend (scaffold)

This is the `@truestub/backend` workspace. **It's a scaffold, not a running
part of the product yet** — a health check and a project skeleton, nothing
more. The frontend (`apps/frontend`) does not call this service today; it
talks directly to Firebase and to a remote Hasura GraphQL endpoint (see the
[frontend README](../frontend/README.md#architecture)).

## Why this exists

`apps/frontend` has a handful of Next.js API routes that need a real
server-side home eventually, because they touch secrets that must never
ship to the browser. Today most of them are thin proxies to external URLs;
this workspace is where their actual implementation lands.

## Current scope

- `GET /health` → `{ "status": "ok", "service": "truestub-backend" }`
- `POST /api/auth/sync-user` → verifies the Firebase ID token in the
  `Authorization: Bearer <token>` header via the Firebase Admin SDK, then
  upserts a row into Hasura's `users` table (keyed on `email`) using the
  Hasura admin secret. `apps/frontend`'s `src/app/api/auth/sync-user/route.ts`
  proxies to this route.
  - The upsert's `on_conflict` constraint name (`users_email_key`) is a
    guess — this repo has no Hasura metadata or SQL migrations to confirm
    real constraint names against. `email`, `first_name`, and `last_name`
    are the only `users` columns proven to exist anywhere in the codebase
    (see `apps/frontend/src/graphql/mutations/test-user.ts`). If Hasura
    rejects the constraint at runtime, the route returns a 502 rather than
    silently failing — fix the constraint name in
    `src/routes/sync-user.ts` once someone with real schema access confirms
    it.
- Express + TypeScript, `tsx` for the dev watcher, plain `tsc` build.
- `src/config/env.ts` — the one place environment variables get read.

## Running it

```bash
cp .env.example .env       # fill in the Firebase + Hasura values below
yarn install                # from the repo root
yarn workspace @truestub/backend dev
curl http://localhost:4000/health
```

`sync-user` requires all of `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`,
`FIREBASE_PRIVATE_KEY`, `HASURA_GRAPHQL_URL`, and
`HASURA_GRAPHQL_ADMIN_SECRET` to be set — the server now fails to start
without them (see `src/config/env.ts`). Get the Firebase values from
Firebase console → Project settings → Service accounts → Generate new
private key. The Hasura admin secret must **only** ever live here, never in
`apps/frontend` — see the security note in
[`apps/frontend/README.md`](../frontend/README.md#-3-hasura-graphql).

## Observability

- **Error tracking**: `src/lib/sentry.ts` initializes Sentry when the
  `SENTRY_DSN` env var is set (see `.env.example`); it's a no-op otherwise,
  so local dev and CI don't need a Sentry project. Once set, unhandled
  exceptions in any route are reported to Sentry in addition to the
  structured logs from `src/lib/logger.ts`.
- **Uptime monitoring**: `.github/workflows/backend-uptime.yml` pings
  `/health` on a schedule and fails the run (triggering GitHub's workflow
  failure notification) if it doesn't respond `200` with
  `{ "status": "ok" }`. It's skipped until this service is deployed
  somewhere and a `BACKEND_HEALTH_URL` repository variable
  (Settings → Secrets and variables → Actions → Variables) is set to that
  deployment's `/health` URL.

## Roadmap: routes to migrate here

These currently live in `apps/frontend` as proxies to external URLs. Moving
their logic here (rather than a separate service) is the natural next step
— each row is what the frontend already expects to exist "on the other
end" of the URL it's calling:

| Frontend route (proxy today) | Points at | What lands here eventually |
| --- | --- | --- |
| `src/app/api/auth/validate-reset-token/route.ts` | `BACKEND_URL` | Validate a password-reset token |
| `src/app/api/auth/sync-user/route.ts` | `BACKEND_URL` | ✅ Done — see "Current scope" above |
| `src/app/api/auth/reset-password/route.ts` | `BACKEND_URL` | Complete a password reset |
| `src/app/api/auth/forgot-password/route.ts` | `NEXT_PUBLIC_WEBHOOK_URL` | Kick off the forgot-password flow |
| `src/app/webhooks/escrow-status/route.ts` | `TRUSTLESS_WORK_WEBHOOK_SECRET`-verified webhook | Verify the Trustless Work HMAC signature and call `updateEscrowStatus` (currently a stub in `src/lib/server/hasura.ts`, throws "not implemented") |

The rest of that logic hasn't moved here yet. When it does, update the
frontend's `BACKEND_URL` / `NEXT_PUBLIC_WEBHOOK_URL` env vars to point at
this service, and delete the corresponding proxy route (or leave it as a
thin pass-through, whichever the routing story ends up needing).

## Not in scope here

Stellar/Soroban contract logic — that's `contracts/` at the repo root, also
a placeholder today. This service is meant to call out to Trustless Work's
hosted escrow API/contracts, not implement contract logic itself.
