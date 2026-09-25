# TrueStub — Contracts (placeholder)

This is a placeholder Soroban/Rust Cargo workspace, not a Yarn workspace —
it isn't wired into `apps/frontend` or `apps/backend`, and nothing in the
app calls it. It's here to give future custom-contract work a home.

## Why this exists (and why there's nothing "real" here yet)

TrueStub's escrow today runs entirely through **Trustless Work's hosted
escrow contracts**, called from `apps/frontend` via the
[`@trustless-work/escrow`](https://docs.trustlesswork.com/trustless-work)
SDK — see `apps/frontend/src/lib/trustless-work/`. There's no need to
deploy or maintain a custom Soroban contract for that to work. This
workspace exists for whenever that changes: a contract specific to
TrueStub's ticket-resale flow that Trustless Work's generic escrow
contracts don't cover.

## Planning docs

- [`DESIGN.md`](./DESIGN.md) — does TrueStub need a custom Soroban contract?
  Current recommendation: no, stay on Trustless Work's hosted escrow (#27).
- [`CI.md`](./CI.md) — planned GitHub Actions job for this workspace (#28).
- [`DEPLOYMENT.md`](./DEPLOYMENT.md) — planned testnet deployment flow, once
  a real contract exists (#29). Currently blocked on `DESIGN.md`'s outcome.

## Structure

```
contracts/
├── Cargo.toml                  # workspace root
├── contracts/
│   └── hello-world/            # example contract, safe to delete once a real one lands
│       ├── Cargo.toml
│       └── src/lib.rs
└── .gitignore                  # /target
```

Add new contracts as siblings of `hello-world` under `contracts/contracts/`,
and list each in the workspace root `Cargo.toml`'s `members`.

## Building and testing

Requires the Rust toolchain plus the `wasm32-unknown-unknown` target (and,
for deploying, the [Soroban CLI](https://developers.stellar.org/docs/tools/developer-tools#soroban-cli)):

```bash
rustup target add wasm32-unknown-unknown

cd contracts
cargo test                                     # run unit tests
cargo build --target wasm32-unknown-unknown --release   # build the .wasm
```

The built contract lands at
`target/wasm32-unknown-unknown/release/hello_world.wasm`.

`Cargo.lock` is committed on purpose (standard for contract crates, unlike
most Rust libraries) — `soroban-env-host` 22.1.3's own dependency range
allows `ed25519-dalek` to resolve to an incompatible 3.x that breaks its
`testutils` build (a `rand_core` major-version mismatch upstream, not
specific to this project). The lockfile pins it back to the working 2.x
line via `cargo update -p ed25519-dalek@3.0.0 --precise 2.2.0`; re-run that
if you ever delete the lockfile and hit the same build error.
