# 🎟️ TrueStub — Frontend

This is the `@truestub/frontend` workspace: the Next.js app that implements
TrueStub, a decentralized P2P escrow platform for secondary-market ticket
sales. It's one piece of the `stellar-TrueStub` monorepo — see the
[root README](../../README.md) for the overall pitch and repo map.

---

## 📋 **Getting Started**

### **Prerequisites**

- Node.js v18 or later 🖥️
- Yarn 4 (this repo pins it via the root `package.json`'s `packageManager` field — Corepack will pick it up automatically) 📦
- A Stellar blockchain wallet — **Freighter** is recommended 🔐
- Trustless Work API access ([docs here](https://docs.trustlesswork.com/trustless-work)) 📖
- A Firebase project with **Email/Password** authentication enabled ([Firebase Console](https://console.firebase.google.com)) 🔥

> 🧩 **This workspace runs standalone.** It does **not** require the sibling `apps/backend` scaffold or the `contracts/` workspace to be running locally — those are unwired placeholders (see the [root README](../../README.md)). This app connects directly to a live Hasura GraphQL endpoint and to Firebase, both remote services reachable over the network. See [Architecture](#architecture) below for the full explanation.

---

### **Installation**

**1️⃣ Fork and clone the monorepo**

```bash
git clone https://github.com/<your_user>/stellar-TrueStub
cd stellar-TrueStub
```

**2️⃣ Install dependencies (from the repo root — this is a Yarn workspace)**

```bash
yarn install
```

**3️⃣ Set up environment variables**

```bash
cd apps/frontend
cp .env.example .env.local
```

Then open `apps/frontend/.env.local` and fill in each value — follow the **Environment Variables** section below step by step. Do not commit `.env.local`; it is already covered by `.gitignore`.

**4️⃣ Start the development server**

From the repo root:

```bash
yarn dev
```

or, scoped explicitly to this workspace:

```bash
yarn workspace @truestub/frontend dev
```

```
   ▲ Next.js 15.5.15
   - Local:        http://localhost:3000
   - Network:      http://192.168.x.x:3000
   - Environments: .env

 ✓ Starting...
 ✓ Ready in 4s
```

This app runs on **port 3000 by default**.

---

### **Environment Variables**

Every environment variable lives in `apps/frontend/.env.local` (never committed to git). Use `apps/frontend/.env.example` as the template — copy it first, then fill in each block below one at a time.

#### 🔥 1. Firebase Client SDK

These six values come from **Firebase Console → Project Settings → Your apps → Web app → SDK setup and configuration → Config**, and are required for Login, Register, and session auth to work:

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=<your apiKey>
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=<your-project-id>.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=<your-project-id>
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=<your-project-id>.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=<your messagingSenderId>
NEXT_PUBLIC_FIREBASE_APP_ID=<your appId>
```

> ℹ️ These are public, browser-safe values — Firebase ships them to the client by design, and the `NEXT_PUBLIC_` prefix is what makes Next.js expose them to the bundle. The real security boundary is **Firebase Security Rules**, not secrecy of these values. They are **not** the Firebase Admin SDK private key, which belongs only in a server-side backend (see `apps/backend`) and must never appear here.
>
> 🔒 The repo now includes version-controlled security rules files: `apps/frontend/firestore.rules` and `apps/frontend/storage.rules`. See [`docs/FIREBASE_SECURITY_RULES.md`](docs/FIREBASE_SECURITY_RULES.md) for the full rules documentation and deploy instructions.

Make sure **Email/Password** sign-in is enabled in **Authentication → Sign-in method** for Register and Login to work. 📚 [Firebase Auth docs](https://firebase.google.com/docs/auth)

To let users enable optional TOTP-based two-factor authentication
(`/dashboard/profile/security`), turn on **Multi-factor authentication →
TOTP** in **Authentication → Sign-in method** as well — the enroll/verify
flow in `TwoFactorSettings.tsx` and the step-up prompt in `Login.tsx` both
fail with a Firebase error until that's enabled on the project.

---

#### 🌐 2. TrustlessWork API (Optional, don't need it yet)

```bash
NEXT_PUBLIC_API_URL=https://api.trustlesswork.com
NEXT_PUBLIC_API_KEY=<your_trustlesswork_api_key>
NEXT_PUBLIC_TRUSTLESS_API_URL=https://api.trustlesswork.com
NEXT_PUBLIC_TRUSTLESS_API_URL_DEV=https://dev.api.trustlesswork.com
NEXT_PUBLIC_TRUSTLESS_NETWORK=testnet
```

- Obtain `NEXT_PUBLIC_API_KEY` from your [TrustlessWork dashboard](https://docs.trustlesswork.com/trustless-work)
- Always use `testnet` for `NEXT_PUBLIC_TRUSTLESS_NETWORK` in local development — never point local dev at `mainnet`

---

#### 🗄️ 3. Hasura GraphQL

```bash
NEXT_PUBLIC_HASURA_GRAPHQL_URL=<your Hasura GraphQL endpoint>/v1/graphql
```

This points to a **Hasura GraphQL endpoint**, reachable over the network. You do **not** need to run a local backend to develop on this workspace; just point this variable at a working Hasura URL and the frontend talks to it directly.

> 🔒 **`HASURA_GRAPHQL_ADMIN_SECRET` must never be set in this workspace.** The frontend authenticates against Hasura via a **Firebase JWT**, not the admin secret. The admin secret grants unrestricted read/write access to the entire database and belongs **only** in a backend's server-side environment (see `apps/backend`) — never in a `NEXT_PUBLIC_*` variable, never in `.env.local` here, and never committed anywhere. See `src/config/apollo.ts` for how the JWT-based auth header is attached to GraphQL requests.
>
> If you ever see `NEXT_PUBLIC_HASURA_ADMIN_SECRET` or similar in a `.env` file in this workspace, treat it as a security incident — remove it and rotate the secret immediately.

---

### **Complete `.env.local` example**

```bash
# Firebase Client SDK (public, browser-safe — see section 1 above)
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project-id.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789012
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789012:web:abcdef123456

# TrustlessWork API  (Optional, don't need it yet)
NEXT_PUBLIC_API_URL=https://api.trustlesswork.com
NEXT_PUBLIC_API_KEY=your_trustlesswork_api_key
NEXT_PUBLIC_TRUSTLESS_API_URL=https://api.trustlesswork.com
NEXT_PUBLIC_TRUSTLESS_API_URL_DEV=https://dev.api.trustlesswork.com
NEXT_PUBLIC_TRUSTLESS_NETWORK=testnet

# Hasura GraphQL (a reachable endpoint; NO admin secret here, ever)
NEXT_PUBLIC_HASURA_GRAPHQL_URL=https://your-hasura-instance.example.com/v1/graphql
```

---

### 🧩 Architecture

This workspace (`apps/frontend`) runs **standalone**: `yarn dev` here connects to a remote/shared Hasura GraphQL endpoint and Firebase — no local backend, no Docker required for UI work.

The monorepo also has `apps/backend` and `contracts/`, but both are currently unwired scaffolds — this app doesn't call either yet. When `apps/backend` grows real routes (see its README for the roadmap), point `NEXT_PUBLIC_HASURA_GRAPHQL_URL` at whichever Hasura instance you want this frontend talking to — shared, or your own local one at `http://localhost:8080/v1/graphql` via the root `docker-compose.yml` (`yarn docker:up` from the repo root).

---

## 🛠️ **Tech Stack**

- **Frontend**: TypeScript, Next.js 15, Tailwind CSS
- **Auth**: Firebase Authentication (Email/Password)
- **GraphQL**: Apollo Client 4, Hasura GraphQL Engine
- **Blockchain**: Stellar, TrustlessWork API
- **Wallet**: Freighter, Albedo, LOBSTR

---

## 🧪 **Testing Infrastructure**

This project uses Jest, React Testing Library, and Cypress for comprehensive testing.

### **Running Tests**

```bash
yarn test              # unit and integration tests
yarn test:e2e          # E2E tests (Cypress)
yarn test:ci           # CI mode with coverage
```

Run these from `apps/frontend/`, or scoped from the repo root via `yarn workspace @truestub/frontend <script>`.

### **Test Structure**

- Unit and integration tests live in `__tests__` directories or as `.test.ts(x)` files next to the code they test
- E2E tests live in `cypress/e2e/`
- API requests are mocked via Mock Service Worker (MSW) — handlers in `mocks/handlers.ts`

---

## 📚 More docs

Frontend-specific docs live in `apps/frontend/docs/`: Apollo Client setup, the GraphQL codegen workflow, secrets/CI setup, dependency-update notes, and [Firebase Security Rules](docs/FIREBASE_SECURITY_RULES.md). Repo-wide docs (contributing, git guidelines, pipeline, project history) live in the root [`docs/`](../../docs/).
