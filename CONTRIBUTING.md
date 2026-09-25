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

```bash
git clone https://github.com/<your_user>/stellar-TrueStub
cd stellar-TrueStub
yarn install
yarn dev              # runs apps/frontend on http://localhost:3000
```

For frontend-specific environment variables (Firebase, Hasura, Trustless
Work), follow [`apps/frontend/README.md`](apps/frontend/README.md).

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
