# Compliance notes: money-transmission considerations

> **This is not legal advice.** This document exists to flag an open
> question for anyone considering a production/mainnet deployment of
> TrueStub, so it isn't silently overlooked — not to answer it. Get review
> from a lawyer qualified in the relevant jurisdiction(s) before any
> real-money mainnet launch.

## Why this matters

TrueStub holds buyer funds in escrow for ticket resale (see the root
[`README.md`](../README.md) — "Buyer funds are locked on-chain — no seller
gets paid before the ticket is actually transferred"). Platforms that
custody or route funds between third parties can trigger money-transmitter
licensing, or KYC/AML obligations, in many jurisdictions — **even when the
underlying custody/routing mechanism is a smart contract rather than a
company bank account.** Using Stellar and the Trustless Work API instead of
a traditional payment processor does not, by itself, exempt an operator
from these regimes; the analysis generally turns on who has practical
control over the funds and whether that control is exercised on behalf of a
third party, not on the underlying settlement technology.

## What's currently known

- The escrow flow (list → fund → confirm transfer → release, or refund on
  non-completion — see the root `README.md`'s "How It Works" section) means
  TrueStub, or whoever operates a deployment of it, sits between a buyer's
  funds and a seller's payout for the duration of an escrow.
- Today the app runs on Stellar testnet via Trustless Work's hosted API,
  with no real-money mainnet deployment. Regulatory exposure is a mainnet
  launch concern, not a current-state one — this doc exists so it's on the
  record before that decision is made, not because it's blocking anything
  today.
- `apps/backend` and `contracts/` are unwired scaffolds (see
  [`docs/ARCHITECTURE.md`](ARCHITECTURE.md)); once custom backend logic or
  Soroban contracts are wired in, whoever does that wiring should re-check
  this document, since custody/control could shift depending on the design.

## What's currently unknown / needs review before mainnet

- Whether the specific escrow-and-release mechanism here (smart-contract
  held funds, released on-chain per program logic rather than at an
  operator's discretion) reduces or eliminates money-transmitter exposure
  relative to a traditional custodial escrow — this is jurisdiction- and
  fact-specific, and the honest answer here is "unknown, needs a lawyer."
- Which jurisdiction(s) apply: the operator's, the buyer's, the seller's, or
  some combination, and how that changes depending on where an operator
  incorporates and who it markets to.
- Whether any KYC/AML program is needed for buyers/sellers above a
  transaction-size or volume threshold, and if so, at what layer (frontend
  onboarding, Trustless Work's own compliance posture, or a future
  `apps/backend` service).
- Trustless Work's own regulatory posture and representations, since
  TrueStub currently delegates escrow orchestration to their hosted API
  rather than implementing custody logic itself — worth confirming directly
  with them before relying on it as a compliance boundary.
- Consumer-protection and ticket-resale-specific regulation (separate from
  money transmission), which varies by jurisdiction and event type and is
  out of scope for this note but worth flagging alongside it.

## Recommendation

Treat this as an explicit go/no-go gate before any mainnet, real-money
deployment: get qualified legal review of the points above, in the specific
jurisdiction(s) a deployment would target, before launch.
