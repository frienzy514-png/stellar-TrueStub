# 🎟️ TrueStub 🎟️

**TrueStub** is a decentralized P2P escrow platform for secondary-market ticket sales. Powered by the Stellar blockchain via the TrustlessWork API, it replaces "just send the money and hope" ticket resale with trustless smart contracts that hold the buyer's funds on-chain, release them to the seller automatically once transfer of a verified ticket is confirmed, and route any disagreement through transparent on-chain arbitration — giving both buyers and sellers a secure, verifiable alternative to screenshotting a QR code and wiring money to a stranger. 🌐✨

---

## 🚀 **Why Choose TrueStub?**

🔐 **Trustless Technology**: Buyer funds are locked on-chain — no seller gets paid before the ticket is actually transferred.
💾 **Blockchain-Powered Transparency**: Every escrow, transfer confirmation, and release is immutable, auditable, and verifiable.
💱 **Crypto-Payment Support**: Manage cryptocurrency payments for ticket purchases safely and efficiently.
✅ **Automated Refunds**: If a transfer never completes, funds return to the buyer automatically — no chasing a scalper for a refund.

---

## ⚙️ **How It Works**

1. **List a Ticket**: The seller creates a secure escrow account for the ticket they're reselling. 🎫
2. **Fund Escrow**: The buyer funds the escrow with the agreed price. 💵
3. **Transfer Agreement**: Transfer terms (event, seat, deadline) are agreed upon and stored on the blockchain. 📃
4. **Completion or Cancellation**: Funds release to the seller once transfer is confirmed, or return to the buyer if it isn't. 🎯

---

## 🗂️ **This is a monorepo**

```
stellar-TrueStub/
├── apps/
│   ├── frontend/   # the app — Next.js UI, fully implemented, the piece described above
│   └── backend/    # scaffold — health check + structure only, not called by the frontend yet
├── contracts/       # placeholder — Soroban/Rust Cargo workspace, not wired in yet
├── docs/             # repo-wide docs: contributing, git guidelines, CI/CD pipeline, project history
└── docker-compose.yml  # local Postgres + Hasura, for whoever needs a local backend stack
```

Today, only `apps/frontend` does real work. It talks directly to Firebase
(auth) and a remote Hasura GraphQL endpoint (data), and to the hosted
Trustless Work API for escrow — no local backend or contract deploy
required to run it. `apps/backend` and `contracts/` are intentionally
unwired scaffolds, there so future backend logic (see
[`apps/backend/README.md`](apps/backend/README.md)'s roadmap) and future
custom Soroban contracts (see [`contracts/README.md`](contracts/README.md))
have a home without disturbing the frontend's working setup.

Package management is Yarn workspaces (`workspaces: ["apps/*"]` in this
file) — `contracts/` is a separate Cargo workspace, not a Yarn member.

---

## 📋 **Quick start**

```bash
git clone https://github.com/<your_user>/stellar-TrueStub
cd stellar-TrueStub
yarn install          # installs apps/frontend + apps/backend
yarn dev               # runs the frontend on http://localhost:3000
```

For the frontend's full setup (environment variables, Firebase, Hasura,
Trustless Work, testing), see **[`apps/frontend/README.md`](apps/frontend/README.md)**.
For the backend scaffold, see **[`apps/backend/README.md`](apps/backend/README.md)**.
For the contracts placeholder, see **[`contracts/README.md`](contracts/README.md)**.

Optional local Postgres + Hasura stack (`docker-compose.yml`, root-level):

```bash
yarn docker:up
yarn docker:down
```

---

## 🤝 **Contributing & security**

New contributor? Start with **[`CONTRIBUTING.md`](CONTRIBUTING.md)**.
Found a security issue? See **[`SECURITY.md`](SECURITY.md)** — please don't
open a public issue for vulnerabilities.

## 📚 **More docs**

Repo-wide docs live in [`docs/`](docs/): [system architecture diagram](docs/ARCHITECTURE.md), [contributing guidelines](docs/CONTRIBUTORS_GUIDELINE.md), [git guidelines](docs/GIT_GUIDELINE.md), [CI/CD pipeline setup](docs/PIPELINE.md), [compliance notes](docs/COMPLIANCE_NOTES.md), and [project history](docs/PIVOT_NOTES.md). Workspace-specific docs live alongside each workspace (e.g. [`apps/frontend/docs/`](apps/frontend/docs/)).

---

## 🙏 **Credits**

TrueStub started as a personalized fork of [SafeTrust](https://github.com/safetrustcr/frontend-SafeTrust), a decentralized P2P escrow platform for the hospitality and tourism sector. All credit for the original architecture, escrow integration, and wallet tooling goes to the SafeTrust team — this fork repoints that same trustless-escrow foundation at a different problem: secondary-market ticket resale.

---

🌟 **Join TrueStub today and never wire money to a stranger for a ticket again!** 🌟
