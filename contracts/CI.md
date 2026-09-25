# Planned CI for contracts/

Tracking issue: #28. This is a scoping document only — no workflow file
exists yet (the repo has no `.github/workflows/` at all; see #36, #37).

## Why a separate job

`contracts/` is a Rust/Cargo workspace, unlike the rest of the repo (Yarn/
Node). It needs its own toolchain setup and can't share a Node-based CI job.

## Planned workflow

File: `.github/workflows/contracts.yml`

- **Trigger:** `push` and `pull_request`, path-filtered to `contracts/**` (and
  to the workflow file itself).
- **Steps:**
  1. `actions/checkout`
  2. Install the Rust toolchain (stable) plus the `wasm32-unknown-unknown`
     target — e.g. via `dtolnay/rust-toolchain`.
  3. Cache `~/.cargo/registry`, `~/.cargo/git`, and `contracts/target`, keyed
     on `contracts/Cargo.lock`.
  4. `cd contracts && cargo test`
  5. `cd contracts && cargo build --target wasm32-unknown-unknown --release`
- **Must run against the committed `Cargo.lock`** (no `cargo update` step).
  `contracts/README.md` documents that the lockfile pins `ed25519-dalek` to
  a working version to route around an upstream `soroban-env-host`
  dependency conflict; CI needs to verify that pin keeps working, not
  re-resolve around it.

## Acceptance criteria (from #28)

- PRs touching `contracts/**` get a passing/failing check.
- The workflow catches the kind of dependency-resolution break documented in
  `contracts/README.md`.

## Status

Not yet implemented. This applies regardless of the #27 outcome — the
`hello-world` placeholder (or whatever real contract replaces it, see #30)
still needs `cargo test` / `cargo build` coverage either way.
