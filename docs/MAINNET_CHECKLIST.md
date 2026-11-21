# Mainnet Pre-Deploy Checklist

> Complete every item on this list before cutting any real-money mainnet
> deployment of TrueStub. Items are grouped by concern area. Check them off
> in order and get a second pair of eyes on the high-risk sections before
> you deploy.
>
> **See also:** [`docs/COMPLIANCE_NOTES.md`](COMPLIANCE_NOTES.md) — there is a
> separate legal/regulatory gate that must clear before mainnet regardless of
> the technical items below.

---

## 1. Stellar Network

| # | Item | Testnet value | Mainnet value |
|---|------|---------------|---------------|
| 1.1 | `STELLAR_NETWORK` env var | `testnet` | `mainnet` |
| 1.2 | Trustless Work API base URL (`TRUSTLESS_WORK_API_URL`) | `https://dev.api.trustlesswork.com` | `https://api.trustlesswork.com` |
| 1.3 | Stellar network passphrase (used internally when signing XDR) | `Test SDF Network ; September 2015` | `Public Global Stellar Network ; September 2015` |
| 1.4 | Dispute-resolver wallet (`TRUSTLESS_WORK_DISPUTE_RESOLVER_SECRET`) | Any funded testnet `S…` key | A dedicated, hardware-backed mainnet `S…` key — **never the same key used on testnet** |
| 1.5 | Dispute-resolver wallet funded | Testnet faucet | Minimum XLM balance to keep account alive + buffer for Soroban transaction fees |
| 1.6 | Dispute-resolver public key (`NEXT_PUBLIC_DISPUTE_RESOLVER_ADDRESS` in frontend) | Testnet address | Matches the mainnet `TRUSTLESS_WORK_DISPUTE_RESOLVER_SECRET` |

- [ ] 1.1 `STELLAR_NETWORK=mainnet` set in all backend deploy environments (production + any staging that touches real funds)
- [ ] 1.2 `TRUSTLESS_WORK_API_URL=https://api.trustlesswork.com` set (not the `dev.` subdomain)
- [ ] 1.3 Confirm the backend's XDR-signing logic resolves `Networks.PUBLIC`, not `Networks.TESTNET` (driven automatically by `STELLAR_NETWORK=mainnet` in `src/lib/trustless-work.ts`)
- [ ] 1.4 Dispute-resolver key is a fresh mainnet key, generated securely, stored in a secrets manager — never committed, never shared with the testnet key
- [ ] 1.5 Dispute-resolver account has sufficient XLM for base reserve + fee headroom; set a low-balance alert
- [ ] 1.6 Frontend `NEXT_PUBLIC_DISPUTE_RESOLVER_ADDRESS` updated to the mainnet public key

---

## 2. Trustless Work API credentials

| # | Item | Testnet value | Mainnet value |
|---|------|---------------|---------------|
| 2.1 | `TRUSTLESS_WORK_API_KEY` | Testnet/dev API key | Production API key from Trustless Work dashboard |
| 2.2 | `TRUSTLESS_WORK_WEBHOOK_SECRET` | Any test secret | A high-entropy secret (≥ 32 bytes, CSPRNG) agreed with Trustless Work for the production webhook endpoint |

- [ ] 2.1 `TRUSTLESS_WORK_API_KEY` rotated to the production key; testnet key removed from all mainnet configs
- [ ] 2.2 `TRUSTLESS_WORK_WEBHOOK_SECRET` is a fresh, high-entropy value (e.g. `openssl rand -hex 32`) — **not recycled from testnet**
- [ ] 2.3 Confirmed with Trustless Work that the production API key is associated with the correct application/team account
- [ ] 2.4 Trustless Work's dashboard shows the correct mainnet webhook delivery URL pointing at the production backend

---

## 3. Backend environment variables

- [ ] 3.1 All required env vars from [`apps/backend/.env.example`](../apps/backend/.env.example) are set in the production secrets store — no blanks, no placeholder values
- [ ] 3.2 `NODE_ENV=production` is set
- [ ] 3.3 `PORT` matches the value the load balancer / reverse proxy forwards to
- [ ] 3.4 `CORS_ORIGINS` is restricted to the production frontend origin (not `http://localhost:3000`)
- [ ] 3.5 `LOG_LEVEL` is set to `info` or `warn` (not `debug` or `trace`) to avoid leaking sensitive request fields
- [ ] 3.6 `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` reviewed and tuned for expected production traffic
- [ ] 3.7 `CRITICAL_ALERT_WEBHOOK_URL` points to the production on-call channel (Slack / PagerDuty / etc.) — not a dev channel

---

## 4. Firebase / auth

| # | Item | Testnet / local | Mainnet |
|---|------|-----------------|---------|
| 4.1 | Firebase project | Dev/staging Firebase project | Dedicated production Firebase project |
| 4.2 | Service-account key (`FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY`) | Dev service account | Production service account with least-privilege IAM roles |

- [ ] 4.1 Backend uses the production Firebase project's Admin SDK credentials, not a dev/staging project
- [ ] 4.2 Production service-account private key is stored in a secrets manager and not in any `.env` file committed to the repo
- [ ] 4.3 Firebase security rules (`firestore.rules`, `storage.rules`) reviewed and deployed to the production project
- [ ] 4.4 Firebase Auth sign-in providers are enabled/restricted as appropriate for production (no anonymous sign-in unless intentional)
- [ ] 4.5 Frontend Firebase config vars (`NEXT_PUBLIC_FIREBASE_*`) point to the production project, not a dev project

---

## 5. Hasura / database

| # | Item | Testnet / local | Mainnet |
|---|------|-----------------|---------|
| 5.1 | `HASURA_GRAPHQL_URL` | Staging or localhost | Production Hasura Cloud / self-hosted endpoint |
| 5.2 | `HASURA_GRAPHQL_ADMIN_SECRET` (legacy alias: `HASURA_ADMIN_SECRET`) | Dev secret | A high-entropy production secret |
| 5.3 | `DATABASE_URL` | Local Postgres | Production Postgres (RDS, Supabase, Neon, etc.) |

- [ ] 5.1 `HASURA_GRAPHQL_URL` points to the production Hasura instance
- [ ] 5.2 `HASURA_GRAPHQL_ADMIN_SECRET` is rotated from any dev/staging value and stored in secrets manager
- [ ] 5.3 `DATABASE_URL` connects to the production database — verify it's not the `localhost:5432` docker-compose default
- [ ] 5.4 All database migrations (`apps/backend/src/db/migrations/`) have been applied to the production schema (`yarn migrate:up` run against `DATABASE_URL`)
- [ ] 5.5 Production database has automated backups configured and a tested restore procedure
- [ ] 5.6 Hasura metadata / permissions deployed to production (`hasura metadata apply`) and reviewed — no overly permissive public access rules

---

## 6. Sentry / observability

- [ ] 6.1 `SENTRY_DSN` is set to the production Sentry project DSN (not a dev project, not blank)
- [ ] 6.2 Sentry environment is configured to `production` (set via `SENTRY_ENVIRONMENT=production` or the Sentry SDK init call)
- [ ] 6.3 Sentry alert rules for `webhook.delivery_failure` and `refund.failure` are configured and routed to the on-call channel
- [ ] 6.4 Backend structured logs (`pino`) are forwarded to a log aggregator (Datadog, CloudWatch, etc.) — not just console output

---

## 7. Secrets hygiene

- [ ] 7.1 Run `git log --all -- '*.env'` and `git log --all -S 'PRIVATE_KEY'` to confirm no secrets were ever committed to the repo
- [ ] 7.2 `gitleaks` or equivalent secret-scanning tool has a clean pass on the repo (see [`docs/SECRET_SCANNING.md`](SECRET_SCANNING.md))
- [ ] 7.3 Every secret used in production is unique to production — no secret is shared between testnet and mainnet
- [ ] 7.4 Secrets rotation schedule documented and owners assigned (webhook secret, API keys, DB password, Firebase service account key)
- [ ] 7.5 `.env` files are in `.gitignore`; confirm this is the case for `apps/backend/.gitignore` and root `.gitignore`

---

## 8. Network / infra

- [ ] 8.1 The backend is only accessible over HTTPS — no HTTP in production (TLS termination at the load balancer / reverse proxy)
- [ ] 8.2 The webhook endpoint `POST /webhooks/escrow-status` is reachable from Trustless Work's IP range (confirm their docs) and not inadvertently firewalled
- [ ] 8.3 Health check endpoint `GET /health` returns `200` and is monitored (`.github/workflows/backend-uptime.yml` `BACKEND_HEALTH_URL` repo variable set)
- [ ] 8.4 `CORS_ORIGINS` does not include `*` or localhost origins in production
- [ ] 8.5 All Dockerfile / container image layers come from pinned base images; no `latest` tags in production

---

## 9. Legal / compliance gate

> See [`docs/COMPLIANCE_NOTES.md`](COMPLIANCE_NOTES.md) for the full discussion.

- [ ] 9.1 Qualified legal review of money-transmission / KYC/AML exposure completed for the target jurisdiction(s)
- [ ] 9.2 Trustless Work's own compliance posture confirmed directly with them (i.e. they represent they satisfy any applicable obligations on their side)
- [ ] 9.3 Ticket-resale-specific regulation reviewed for each jurisdiction the platform markets to
- [ ] 9.4 Terms of service and privacy policy live at the production URL and reviewed by counsel
- [ ] 9.5 If KYC/AML is required: identity-verification integration is in place and tested before any real funds are accepted

---

## 10. Final go/no-go sign-off

All sections above must be fully checked before this sign-off is given.

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Engineering lead | | | |
| Security reviewer | | | |
| Legal counsel | | | |
| Product owner | | | |

---

_This checklist should be re-run in full for every major mainnet deployment,
and re-reviewed whenever a new secret or network-sensitive env var is
introduced to the codebase._
