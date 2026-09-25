# Does TrueStub need a custom Soroban contract?

Tracking issue: #27.

## Recommendation

**Stay on Trustless Work's hosted escrow contracts.** Don't write a custom
Soroban contract yet — there's no ticket-resale-specific domain logic in the
app today for a custom contract to encode. Building one now would mean
designing against a domain model that doesn't exist.

## What Trustless Work's hosted escrow covers

Via the `@trustless-work/escrow` SDK (`apps/frontend/src/lib/trustless-work/`):

- Single-release and multi-release milestone escrows, funded in a chosen
  trustline (e.g. USDC).
- Fixed roles per escrow: `approver`, `serviceProvider`, `platformAddress`,
  `releaseSigner`, `disputeResolver`, `receiver`.
- Milestone lifecycle: approve → release funds (whole escrow, or per
  milestone for multi-release).
- A single dispute flow per escrow/milestone: `startDispute` /
  `resolveDispute`, plus `withdrawRemainingFunds`.
- Read access via an indexer: query escrows by signer, role, or contract ID;
  fetch balances.

This is a generic payment-escrow primitive: it moves funds between two
parties through a milestone gate, with one designated arbiter for disputes.
It has no concept of what's being exchanged.

## What's actually implemented in TrueStub today

This matters because it's what a custom contract would need to serve, and
right now there's very little of it:

- **No on-chain (or database) ticket ownership model.** `grep` for
  soroban/nft/mint contract code outside the escrow SDK turns up nothing.
  The only ticket shape in the repo is `TicketListing` in
  `apps/frontend/src/lib/mockData/listings.ts` — a plain in-memory mock, not
  a persisted entity.
- **`apps/backend` is a bare skeleton.** `apps/backend/src` has only
  `config/env.ts`, `index.ts`, and a `/health` route. No tickets, disputes,
  resale, or auth modules exist server-side yet.
- **"Ticket transfer" is escrow-milestone UI, not a transfer.**
  `TicketTransferApproval.tsx` and `TicketTransferCompletion.tsx` wrap
  Trustless Work's `ApproveMilestone` / `ChangeMilestoneStatus` calls. The
  actual state-update calls (`updateBookingStatus`, `sendGuestNotification`,
  `initiateDispute`) are commented out — nothing checks ticket
  ownership/validity against Stellar or a database.
- **Dispute resolution is delegated entirely to the hosted contract's single
  `disputeResolver` role**, hardcoded to a fixed public key in
  `apps/frontend/src/services/escrow.service.ts`. No multi-party
  arbitration logic exists to outgrow that.

## Ticket-resale-specific gaps a custom contract *could* eventually close

None of these are needed today, but are the concrete reasons a future
version of this doc might reverse the recommendation:

- **Verifiable ticket-transfer proof.** Hosted escrow releases funds on
  milestone approval; it has no way to verify the *ticket itself* changed
  hands (there's no on-chain ticket to check). A custom contract could tie
  fund release to an on-chain transfer of a ticket token/NFT.
- **Resale-specific invariants.** Anti-scalping price caps, single-resale
  enforcement, or event-issuer royalties aren't expressible in a generic
  milestone escrow and aren't implemented anywhere else either.
- **Multi-party arbitration.** Today's model is one `disputeResolver` per
  escrow. A three-sided dispute (buyer, seller, original event issuer) would
  need contract logic the hosted escrow doesn't offer.

## Effect on related tracking issues

- **#30** (delete `hello-world` placeholder) stays blocked — no custom
  contract is being scoped, so there's nothing to make it a sibling of yet.
- **#29** (testnet deployment doc/script) stays blocked for the same
  reason — see `contracts/DEPLOYMENT.md` for the plan to execute once a real
  contract exists.
- **#28** (contracts CI) is independent of this recommendation — a Cargo
  workspace exists and should be tested in CI regardless. See
  `contracts/CI.md`.

## Revisit when

Revisit this recommendation once tickets have a concrete ownership
representation (on-chain or off-chain) and/or a resale flow with rules that
a generic milestone escrow can't express. At that point, per #27's
acceptance criteria, open a follow-up issue scoping the specific contract
rather than resurrecting `hello-world`.
