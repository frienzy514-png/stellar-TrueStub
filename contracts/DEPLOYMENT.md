# Testnet deployment plan for contracts/

Tracking issue: #29. This is a planning document only — no script exists
yet, and there is currently nothing real to deploy.

## Status: blocked

`contracts/DESIGN.md` (#27) recommends staying on Trustless Work's hosted
escrow rather than writing a custom Soroban contract, given the app has no
ticket-ownership model or resale-specific logic for one to encode yet. That
leaves only the `hello-world` placeholder in `contracts/contracts/`, which
is explicitly not meant to ship (see #30). There's nothing worth deploying
to testnet until a real contract lands.

This document captures the plan to execute once that changes.

## Planned deploy script

File: `contracts/scripts/deploy-testnet.sh`, wrapping:

```bash
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/<contract>.wasm \
  --source <funded-account-name> \
  --network testnet
```

It should build the contract first (`cargo build --target
wasm32-unknown-unknown --release`), then deploy, then print the resulting
contract ID.

## Funded testnet account setup

1. Generate a keypair: `soroban keys generate <name> --network testnet`
2. Fund it via Friendbot: `soroban keys fund <name> --network testnet`
   (or `curl "https://friendbot.stellar.org/?addr=<public-key>"`)

## Wiring the contract ID into the app

Once deployed, the contract ID needs to reach the parts of the app that call
it, following the existing pattern for the Trustless Work SDK config
(`apps/frontend/src/lib/trustless-work/config.ts`, which reads
`NEXT_PUBLIC_API_KEY` / `NEXT_PUBLIC_TRUSTLESS_*` env vars):

- Add it as an env var (e.g. `NEXT_PUBLIC_<CONTRACT_NAME>_CONTRACT_ID`) in
  `apps/frontend`'s env config, documented alongside the existing
  `NEXT_PUBLIC_TRUSTLESS_*` vars in
  `apps/frontend/src/lib/trustless-work/README.md`.
- If `apps/backend` ends up calling the contract directly (it currently has
  no such logic — see `apps/backend/src/config/env.ts`), add the equivalent
  var there too.

## Acceptance criteria (from #29)

- A contract in `contracts/contracts/*` can be deployed to testnet with one
  documented command.
- This doc explains how the resulting contract ID gets wired into the rest
  of the app (see above).

## Unblocking this

Revisit once `contracts/DESIGN.md` is updated to recommend a specific
custom contract and that contract exists under `contracts/contracts/`.
