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
  would let an attacker forge escrow status updates. See the IP allowlisting
  decision below.
- **Hasura admin secret** — `HASURA_GRAPHQL_ADMIN_SECRET` must never be
  exposed client-side (never in a `NEXT_PUBLIC_*` variable, never shipped
  to the browser). The frontend authenticates to Hasura via a Firebase JWT
  instead — see `apps/frontend/README.md`'s Hasura section. If you find
  this secret reachable from the client in any way, that's a critical
  report.
- **Firebase auth flows** — password reset, session handling, and the
  `sync-user`/`validate-reset-token` endpoints (see `apps/backend/README.md`
  for their current implementation status).

## Decision: IP allowlisting for `/webhooks/escrow-status` (#532)

**Status:** optional allowlist added, off by default. HMAC remains the
primary and sufficient control.

- **Does Trustless Work publish stable webhook source IPs?** We could not
  find any documented, stable set of webhook source addresses for Trustless
  Work. Hard-coding an allowlist of observed IPs would therefore be brittle:
  an unannounced upstream infrastructure change would silently drop every
  escrow status update (Trustless Work would retry, then give up).
- **What IP allowlisting would and wouldn't buy.** An allowlist is a network
  control, not authentication. It does reduce the blast radius of a leaked
  `TRUSTLESS_WORK_WEBHOOK_SECRET` — a forged-but-validly-signed request from
  an arbitrary host would be refused — so it is a worthwhile second layer
  where a stable peer set exists.
- **What we did.** `apps/backend` accepts an optional
  `TRUSTLESS_WORK_WEBHOOK_ALLOWED_IPS` (comma-separated IPv4/IPv6 addresses
  or CIDR ranges). When set, `POST /webhooks/escrow-status` returns `403`
  for any peer outside the list *before* signature verification and before
  any write; HMAC is still enforced for allowlisted peers. When unset (the
  default) behavior is unchanged. Malformed entries fail env validation at
  startup rather than silently allowing or blocking traffic. Implementation:
  `apps/backend/src/lib/ipAllowlist.ts`,
  `apps/backend/src/middleware/webhookIpAllowlist.ts`.
- **Deployment guidance.** The check matches the immediate peer (`req.ip`).
  When deliveries arrive through the frontend pass-through
  (`apps/frontend/src/app/webhooks/escrow-status/route.ts`), list the
  frontend server's egress address(es) so only it can reach the backend
  webhook. When the backend sits behind a load balancer, list the balancer
  or configure Express `trust proxy` accordingly. If Trustless Work later
  publishes (or confirms via support) stable source IPs, add them here and
  enable the allowlist at the public edge.
- **Revisit when:** Trustless Work documents webhook source IPs, or the
  webhook secret rotation story changes.

## Supply-chain / malware defenses

Every PR runs `.github/workflows/malware-scan.yml`, which:

- secret-scans the diff ([gitleaks](https://github.com/gitleaks/gitleaks)),
- runs GitHub's [dependency review](https://docs.github.com/en/code-security/supply-chain-security/understanding-your-software-supply-chain/about-dependency-review)
  against the GitHub Advisory Database (fails on newly introduced
  high/critical-severity or known-malicious packages),
- hard-fails on added lines matching known malicious-code idioms
  (`eval`/`new Function` on dynamic input, `child_process`/`exec`/`spawn`,
  curl/wget-pipe-to-shell, reverse-shell socket patterns, known
  exfiltration endpoints such as Discord webhooks, Telegram bot API, or
  pastebin raw fetches, and newly-added npm `preinstall`/`postinstall`/
  `prepare` hooks), and
- soft-flags lower-confidence signals (long base64-like blobs, any
  dependency-manifest or lockfile change, lockfile resolutions pointing
  outside the official registries, changes to `.github/workflows`,
  `.npmrc`/`.yarnrc.yml`, or Dockerfiles) in the job summary for a
  maintainer to read before approving.

`.github/dependabot.yml` keeps dependencies (npm, cargo, and the GitHub
Actions themselves) patched on a weekly cadence, and `.github/CODEOWNERS`
requires maintainer review on every path that a supply-chain attack would
realistically need to touch — manifests, lockfiles, registry config, CI
workflows, Dockerfiles.

None of this replaces human judgment: a contributor can be acting in good
faith and still be carrying a compromised dependency they pulled in
themselves (e.g. a hijacked npm package that shipped a malicious version
under a legitimate name). If you notice anything like that — in this repo
or upstream in a package it depends on — report it the same way as any
other vulnerability.

## Scope

In scope: this repository's code (`apps/frontend`, `apps/backend`,
`contracts/`) and its GitHub configuration (Actions workflows, if any).

Out of scope: vulnerabilities in third-party services this project depends
on (Trustless Work, Firebase, Hasura, wallet extensions themselves) —
please report those directly to their maintainers.
