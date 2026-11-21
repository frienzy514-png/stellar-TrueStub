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

Because most Node hosts build from a subdirectory the same way Vercel does,
whichever platform you pick will need the same "root directory /
monorepo-aware install" configuration described for the frontend above —
check that platform's docs for the equivalent setting.

## `contracts/`

Placeholder today — not part of either app's deploy process. See the root
README for its status.

## Pre-restart checklist

Dispute records are held in memory in the backend process and are lost on
restart (see [Lost dispute state after a restart](RUNBOOKS.md#lost-dispute-state-after-a-restart)).
Until dispute persistence ships, complete this checklist before any backend
deploy, restart, or scale event:

- [ ] Check the number of open disputes on the running backend. There is
      no dedicated count endpoint yet, so read the open-dispute count from
      the dispute list for the environment, or from the dispute store logs.
      Record the number in the deploy ticket.
- [ ] If the count is **0**, the restart may proceed.
- [ ] If the count is **greater than 0**, do not restart. Get explicit
      sign-off from the platform owner before continuing, and record who
      approved it and why.
- [ ] If the restart goes ahead with open disputes, follow
      [Lost dispute state after a restart](RUNBOOKS.md#lost-dispute-state-after-a-restart)
      once the backend is back up.
- [ ] Prefer a deploy window with no open disputes. Schedule restarts
      accordingly.

> **Gap:** an API endpoint that exposes the open-dispute count is needed to
> make this check automatic. Until it exists, this step is manual.

