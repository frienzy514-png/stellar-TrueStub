# Deployment Guide

This repo is a Yarn workspaces monorepo with two independently deployable
Node workspaces:

```
stellar-TrueStub/
├── apps/frontend/   → Next.js app, deployed to Vercel
├── apps/backend/    → Express API, scaffold — not deployed anywhere yet
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

This workspace runs standalone in production the same way it does locally
— see the note in the frontend README — so `apps/backend` does not need to
be deployed for the frontend to work today.

## `apps/backend` → separate Node host or container platform

`apps/backend` is currently a scaffold (see
[`apps/backend/README.md`](../apps/backend/README.md)) and has no deploy
target configured yet. It is **not** a Vercel deployment — Vercel's
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
   [`apps/backend/.env.example`](../apps/backend/.env.example) —
   `PORT`, `NODE_ENV`, and, once the corresponding routes are live, the
   Hasura/Firebase/Sentry variables described in the backend README's
   [Running it](../apps/backend/README.md#running-it) and
   [Observability](../apps/backend/README.md#observability) sections.
4. Once deployed, point `apps/frontend`'s `BACKEND_URL` /
   `NEXT_PUBLIC_WEBHOOK_URL` env vars at the new service (see the backend
   README's "Roadmap: routes to migrate here" table), and set the
   `BACKEND_HEALTH_URL` repository variable so
   `.github/workflows/backend-uptime.yml` can monitor it.

Because most Node hosts build from a subdirectory the same way Vercel does,
whichever platform you pick will need the same "root directory /
monorepo-aware install" configuration described for the frontend above —
check that platform's docs for the equivalent setting.

## `contracts/`

Placeholder today — not part of either app's deploy process. See the root
README for its status.
