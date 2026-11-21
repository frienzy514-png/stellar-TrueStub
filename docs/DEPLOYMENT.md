# Deployment Guide

This repo is a Yarn workspaces monorepo with two independently deployable
Node workspaces:

```
stellar-TrueStub/
├── apps/frontend/   → Next.js app, deployed to Vercel
├── apps/backend/    → Express API, no deploy target configured in this repo
└── contracts/       → Stellar/Soroban contracts, placeholder — not deployed
```

`docs/PIPELINE.md` documents the CI/CD secrets and quality-check pipeline;
this doc covers where each workspace actually runs.

## `apps/frontend` → Vercel

The frontend is a standard Vercel deployment, but because the repo root is
a Yarn workspace (not the Next.js app itself), the Vercel project must be
pointed at the right subdirectory:

1. In the Vercel project's **Settings → General → Root Directory**, set it
   to `apps/frontend`.
2. Leave **"Include files outside the Root Directory in the Build Step"**
   enabled. Vercel needs the repo-root `package.json`, `yarn.lock`, and
   `.yarnrc.yml` to resolve the workspace via `yarn install`, since
   `apps/frontend` has no lockfile of its own.
3. Vercel auto-detects the Next.js framework preset once the Root Directory
   is set; the default install/build commands (`yarn install`, `yarn build`)
   work as-is because `apps/frontend/package.json`'s `build` script already
   runs from that directory.
4. Set the environment variables from
   [`apps/frontend/README.md`](../apps/frontend/README.md#environment-variables)
   (Firebase client config, Hasura endpoint, TrustlessWork API) in the
   Vercel project's **Settings → Environment Variables**, scoped per
   environment (Production / Preview / Development) as needed.
5. CI/CD secrets for the GitHub Actions side of this (triggering Vercel
   deployments from workflows, not the Vercel-native Git integration) are
   documented in
   [`apps/frontend/docs/SETUP.md`](../apps/frontend/docs/SETUP.md#2-vercel-deployment-tokens).

The core frontend flows (sign-in, Hasura data, Trustless Work escrow
create/fund/release) work without the backend. These features need
`apps/backend` deployed and `BACKEND_URL` / `NEXT_PUBLIC_BACKEND_URL` set:

- user sync and password-reset validation (Next API routes proxy to it)
- escrow-status webhooks (`/webhooks/escrow-status` forwards to it)
- refunds and disputes
- dispute metrics and listing alerts

## `apps/backend` → separate Node host or container platform

`apps/backend` is a working Express service (see
[`apps/backend/README.md`](../apps/backend/README.md)), but this repository
does not configure a deploy target for it. It ships with a `Dockerfile`, and
`docker-compose.yml` runs it locally. It is **not** a Vercel deployment — Vercel's
serverless model doesn't fit a long-running Express process the way this
service is built, and it needs its own host entirely, independent of the
frontend's Vercel project.

When it's ready to deploy, any Node-friendly host or container platform
works (e.g. Render, Railway, Fly.io, or a container on your platform of
choice) since the workspace is a plain `tsc`-built Express app:

1. Build: `yarn workspace @truestub/backend build` (outputs to
   `apps/backend/dist`).
2. Start: `yarn workspace @truestub/backend start`, or `node dist/index.js`
   run from `apps/backend` with `dist` present.
3. Set the environment variables from
   [`apps/backend/.env.example`](../apps/backend/.env.example). The full list,
   with which ones are required, is in the table at the top of
   [`apps/backend/README.md`](../apps/backend/README.md). Firebase Admin and
   the Hasura admin secret are required. Trustless Work credentials are
   required for refunds.
4. Run the database migrations against the target database
   (`yarn workspace @truestub/backend migrate:up`), then confirm the schema
   with `apps/backend/scripts/check-migration-state.sql` (see
   [`DATABASE.md`](DATABASE.md#cross-environment-migration-state)).
5. Once deployed, point `apps/frontend`'s `BACKEND_URL` and
   `NEXT_PUBLIC_BACKEND_URL` env vars at the new service, and set the
   `BACKEND_HEALTH_URL` repository variable so
   `.github/workflows/backend-uptime.yml` can monitor it.

### Replica count

Run **exactly one** backend instance until the persistence work lands.
`DisputeService`, `ChangelogService` and the refund/transfer idempotency
caches still keep their state in per-process memory, so a second replica
would see a different set of disputes and audit entries, and two requests
for the same dispute could be accepted by different replicas (issues #540,
#541).

This is enforced, not just documented:

- `docker-compose.yml` sets `deploy.replicas` from `BACKEND_REPLICAS`, which
  defaults to `1`.
- The backend validates `BACKEND_REPLICAS` at startup
  (`apps/backend/src/config/env.ts`). Any value above `1` makes it exit with
  an error unless `ALLOW_UNSAFE_MULTI_INSTANCE=true` is also set.

On any other platform (Render, Railway, Fly.io, Kubernetes, …), keep the
platform's instance/replica count at 1, turn off autoscaling, and set
`BACKEND_REPLICAS` to the same value as the platform's instance count so the
startup guard sees it.

To scale out anyway, set **both** variables and accept that in-memory state
will diverge between replicas:

```bash
BACKEND_REPLICAS=2 ALLOW_UNSAFE_MULTI_INSTANCE=true docker compose up
```

(With compose you also need to remove the fixed `4000:4000` host port
mapping, because two containers can't bind the same host port.) Remove this
section and the guard once dispute, changelog and idempotency state are
backed by Postgres.

Because most Node hosts build from a subdirectory the same way Vercel does,
whichever platform you pick will need the same "root directory /
monorepo-aware install" configuration described for the frontend above —
check that platform's docs for the equivalent setting.

## `contracts/`

Placeholder today — not part of either app's deploy process. See the root
README for its status.
