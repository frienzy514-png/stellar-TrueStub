# Contributing to TrueStub

Thanks for your interest in contributing! This is a quick entry point — the
full contribution and Git workflow guides live in [`docs/`](docs/) and are
linked below.

## Repo layout

This is a monorepo. Figure out which workspace your change belongs in
before you start:

| Workspace | What it is | Status |
| --- | --- | --- |
| [`apps/frontend`](apps/frontend/) | The Next.js app — everything most contributions will touch | Active, fully implemented |
| [`apps/backend`](apps/backend/) | A minimal Express+TS scaffold | Scaffold — see its README's roadmap |
| [`contracts/`](contracts/) | A placeholder Soroban/Rust Cargo workspace | Placeholder — see its README |

See the [root README](README.md) for the full pitch and architecture, and
[`docs/PIVOT_NOTES.md`](docs/PIVOT_NOTES.md) for the history behind this structure.

## Getting set up

### Prerequisites

- Node.js 20 or later (the root and workspace package manifests enforce this).
- Corepack enabled, which selects the Yarn 4.9.4 version pinned in the root
   `package.json`.

Check the selected Yarn version with `yarn --version`; it should report
`4.9.4`.

```bash
git clone https://github.com/<your_user>/stellar-TrueStub
cd stellar-TrueStub
corepack enable
yarn install
cp apps/frontend/.env.example apps/frontend/.env.local
```

Before starting the app, fill in the Firebase client settings and a reachable
Hasura GraphQL endpoint in `apps/frontend/.env.local`. These are needed for
authentication and data-backed pages; Firebase and Hasura credentials are
provided by the project maintainer. Trustless Work credentials are only needed
for escrow operations. See [`apps/frontend/README.md`](apps/frontend/README.md)
for where each value comes from and which values are optional.

```bash
yarn dev              # runs apps/frontend on http://localhost:3000
```

The frontend can start without the sibling backend. Features that call it,
including operator analytics, require `NEXT_PUBLIC_BACKEND_URL` to point at a
running backend. To run that service locally, copy
`apps/backend/.env.example` to `apps/backend/.env`, then set `DATABASE_URL`,
`HASURA_GRAPHQL_URL`, `HASURA_ADMIN_SECRET`, and the Firebase Admin service
account values. Sentry is optional. Start it in a second terminal with
`yarn workspace @truestub/backend dev`. Apply SQL migrations with
`yarn workspace @truestub/backend migrate:up` only when a local Postgres
database is configured; Hasura metadata must separately track the tables as
described in [`docs/DATABASE.md`](docs/DATABASE.md).

## Finding something to work on

Check the [open issues](https://github.com/frienzy514-png/stellar-TrueStub/issues) —
issues labeled [`good first issue`](https://github.com/frienzy514-png/stellar-TrueStub/labels/good%20first%20issue)
are a good place to start.

## Workflow

1. **Fork and branch** — see [`docs/GIT_GUIDELINE.md`](docs/GIT_GUIDELINE.md)
   for branch naming (`feat/...`, `fix/...`) and commit message format
   (`type(scope): description`).
2. **Make atomic commits** — one logical change per commit.
3. **Run the relevant workspace's checks before pushing**:

   ```bash
   yarn workspace @truestub/frontend lint
   yarn workspace @truestub/frontend typecheck
   yarn workspace @truestub/frontend test
   ```

   (or the `@truestub/backend` / `cargo test` equivalents if that's what you
   touched).
4. **Open a pull request** against `main` using the PR template — fill it
   out completely; incomplete PRs may be asked to redo it.

The full walkthrough (forking, branch naming, PR expectations) is in
[`docs/CONTRIBUTORS_GUIDELINE.md`](docs/CONTRIBUTORS_GUIDELINE.md).

## Tracking mocked / unwired flows

If you add a `// TODO: Replace with actual API call` marker (or any other
GraphQL-wiring placeholder), **pair it with a filed tracking issue** and add
a row to [`docs/GRAPHQL_WIRING_STATUS.md`](docs/GRAPHQL_WIRING_STATUS.md).
That doc is the single source of truth for which flows are real vs. mocked,
so keeping it in sync avoids a fresh repo-wide grep every time someone wants
to know how much of the app is still stubbed.

## Reporting bugs

Open an issue using the bug report template. Include reproduction steps,
expected vs. actual behavior, and your environment (Node version, browser,
etc.).

## Reporting a security vulnerability

**Do not open a public issue for security vulnerabilities.** See
[`SECURITY.md`](SECURITY.md) for how to report them privately.

## Code of conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md).
By participating, you are expected to uphold it. Please report unacceptable
behaviour via the process described in [SECURITY.md](SECURITY.md).

---

Thank you for contributing! 🚀
