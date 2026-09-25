# Pivot Notes: SafeTrust → TrueStub

This document records what changed when this repo was personalized from its
upstream, [SafeTrust](https://github.com/safetrustcr/frontend-SafeTrust), and
why — mostly for future-me, and for anyone else who forks this again.

## What changed

- **Name**: SafeTrust → **TrueStub**, across the app, docs, templates, and
  package metadata.
- **Pitch**: The escrow story shifted from hospitality/tourism deposits
  (hotels, vacation rentals) to **secondary-market ticket resale** — buyer
  funds are held in escrow until a verified ticket transfer completes, then
  released to the seller.
- **Copy**: README, page titles, meta descriptions, and a handful of
  user-facing strings (share text, dashboard header) were rewritten to match
  the new pitch.
- **Housekeeping**: `.env.example` no longer carries real-looking Firebase
  values from the original project; broken org-specific links in the issue/PR
  templates now point at the in-repo docs that actually contain that content;
  the placeholder `package.json` name (`my-app`) got a real name.

## What did NOT change (on purpose)

This pass was branding + copy only. The underlying data model, forms, and
business logic are untouched:

- Components and routes still model hotel/room/booking concepts internally
  (`apps/frontend/src/components/hotel`, `apps/frontend/src/components/rooms`,
  `useBookingEscrow`, etc.).
- The escrow/dispute/wallet logic itself is unmodified — the pivot reuses the
  same trustless-escrow engine, it doesn't rebuild it.

## Suggested follow-ups (not done here)

- Rename the domain concepts end-to-end (`Hotel` → `Event`, `Room` →
  `Ticket Listing`, `Booking` → `Resale Listing`, checkout/checkin →
  transfer confirmation) across components, GraphQL types, and the data
  model. This is a real feature-level refactor, not a copy change — worth
  its own pass.
- Commission a new logo/favicon (completed in #48: designed ticket-resale-escrow logo and favicon, replaced legacy lock icons across all public assets and metadata).
- Point `NEXT_PUBLIC_HASURA_GRAPHQL_URL` at a Hasura instance whose schema
  actually models tickets/listings, once the domain rename above happens.

---

# Restructure: single Next.js repo → monorepo (2026-08-24)

This repo went from a single Next.js app at the root to a Yarn-workspaces
monorepo: `apps/frontend`, `apps/backend`, and `contracts/`. The pitch and
behavior above are unchanged — this was a structural move, not another
pivot.

## What changed

- **Layout**: everything that used to live at the repo root (`src/`,
  `public/`, `next.config.ts`, `package.json`, etc.) moved into
  `apps/frontend/`, unmodified apart from workspace-aware tweaks (package
  name → `@truestub/frontend`, `docker:up`/`docker:down` and `prepare`
  scripts centralized at the new root, `packageManager` field moved to
  root-only).
- **New `apps/backend`**: a scaffold — Express + TypeScript, a `GET /health`
  route, nothing else. It documents (in its README) the frontend's existing
  `src/app/api/auth/*` and `src/app/webhooks/escrow-status` proxy routes as
  future migration candidates, but none of that logic was moved.
- **New `contracts/`**: a placeholder Soroban/Rust Cargo workspace with one
  example contract. Not wired into the app — TrueStub's escrow still runs
  entirely through Trustless Work's hosted contracts.
- **Docs split**: frontend-specific docs (Apollo setup, GraphQL codegen
  workflow, secrets setup, dependency-update notes) moved to
  `apps/frontend/docs/`. Repo-wide docs (this file, contributing, git
  guidelines, pipeline) stayed at root `docs/` — `.github/` templates link
  to them with `../docs/...`, which kept working unchanged.
- Redundant `package-lock.json` removed; `yarn.lock` at the new root is now
  the single lockfile (the project already declared Yarn via
  `packageManager`).

## What did NOT change (on purpose)

- No behavior change in the frontend — this was a pure move, not a
  rewrite. Path aliases (`@/*` → `./src/*` in `tsconfig.json`), Jest config,
  and the codegen config all resolve relative to their own file, so moving
  them one directory deeper needed no path fixes.
- `apps/backend` and `contracts/` are not called by anything yet. Standing
  them up as scaffolds now, without migrating real logic into them, was a
  deliberate choice to keep this pass low-risk.

## Suggested follow-ups (not done here)

- Migrate the auth/webhook route logic out of `apps/frontend`'s Next API
  routes and into `apps/backend`, per the roadmap table in
  [`apps/backend/README.md`](../apps/backend/README.md).
- Once there's an actual reason for a custom Soroban contract (something
  Trustless Work's hosted escrow doesn't cover), replace
  `contracts/contracts/hello-world` with it.
- Consider Turborepo (or similar) if/when task orchestration across
  workspaces (cached builds, parallel lint/test) becomes worth the added
  tooling — skipped for now in favor of plain Yarn workspaces.
