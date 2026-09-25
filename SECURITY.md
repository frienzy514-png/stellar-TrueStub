# Security Policy

TrueStub is a decentralized P2P escrow platform for secondary-market ticket
sales, built on Stellar via the Trustless Work API. It touches wallet
connections, escrow funds, and authentication — please report security
issues responsibly rather than opening a public issue.

## Supported versions

TrueStub doesn't have versioned releases yet; only the `main` branch is
supported. Security fixes land there.

## What's actually deployed vs. scaffolding

Report vulnerabilities against what's real, and keep in mind what isn't:

- **`apps/frontend`** — the live application. This is almost certainly
  where a real vulnerability would live: authentication, wallet connection,
  escrow creation/confirmation, GraphQL access control.
- **`apps/backend`** — currently a scaffold (health check only). Not
  deployed anywhere with real data yet.
- **`contracts/`** — a placeholder Soroban workspace, not deployed on any
  network. TrueStub's actual escrow logic runs entirely through Trustless
  Work's hosted contracts, not custom contracts in this repo.

## Reporting a vulnerability

Email **frienzy514@gmail.com** with:

- A description of the vulnerability and its potential impact.
- Steps to reproduce (or a proof of concept).
- Any relevant logs, requests, or screenshots.

Please don't publicly disclose the issue (in a GitHub issue, PR, forum
post, etc.) until it's been addressed. This is a small, solo-maintained
project, so response times are best-effort, not guaranteed SLAs — expect an
initial acknowledgment within a few days.

## Particularly sensitive areas

If you're looking for where to focus, these are the areas where a mistake
would matter most:

- **Wallet handling** — TrueStub is non-custodial (Freighter, Albedo,
  LOBSTR via `@creit.tech/stellar-wallets-kit`). Private keys should never
  pass through or be logged by the app. Report immediately if you find a
  path where they do.
- **Escrow webhook verification** — `apps/backend/src/routes/webhooks.ts`
  (reached directly, or via the frontend's pass-through
  `src/app/webhooks/escrow-status/route.ts`) verifies Trustless Work webhook
  payloads via HMAC over the raw request body
  (`TRUSTLESS_WORK_WEBHOOK_SECRET`, `crypto.timingSafeEqual`). A bypass here
  would let an attacker forge escrow status updates.
- **Hasura admin secret** — `HASURA_GRAPHQL_ADMIN_SECRET` must never be
  exposed client-side (never in a `NEXT_PUBLIC_*` variable, never shipped
  to the browser). The frontend authenticates to Hasura via a Firebase JWT
  instead — see `apps/frontend/README.md`'s Hasura section. If you find
  this secret reachable from the client in any way, that's a critical
  report.
- **Firebase auth flows** — password reset, session handling, and the
  `sync-user`/`validate-reset-token` endpoints (see `apps/backend/README.md`
  for their current implementation status).

## Scope

In scope: this repository's code (`apps/frontend`, `apps/backend`,
`contracts/`) and its GitHub configuration (Actions workflows, if any).

Out of scope: vulnerabilities in third-party services this project depends
on (Trustless Work, Firebase, Hasura, wallet extensions themselves) —
please report those directly to their maintainers.
