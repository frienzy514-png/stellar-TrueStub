# GraphQL Wiring Status

This document tracks the frontend flows that are still **mocked** — i.e. they
contain a `// TODO: Replace with actual API call` / GraphQL-wiring marker and
have not yet been connected to the real backend. It exists so that anyone can
get an accurate, current picture of which flows are real vs. mocked without
running a fresh repo-wide grep.

> **Keeping this current:** when you add a new
> `// TODO: Replace with actual API call` (or equivalent GraphQL-wiring)
> marker, add a row below and file a tracking issue for it. See the note in
> [`CONTRIBUTING.md`](../CONTRIBUTING.md).

## Status legend

| Status | Meaning |
| --- | --- |
| 🔴 Mocked | Still returns hard-coded / placeholder data; not wired to the API. |
| 🟡 Partial | Some calls are real, but at least one flow is still mocked. |
| 🟢 Real | Fully wired to the backend; no wiring TODOs remain. |

## Current wiring gaps

| Flow / file | Status | Tracking issue |
| --- | --- | --- |
| `apps/frontend/src/components/auth/NewPassword.tsx` | 🔴 Mocked | [#319](https://github.com/frienzy514-png/stellar-TrueStub/issues/319) |
| `apps/frontend/src/components/profile/UserProfileCard.tsx` | 🔴 Mocked | [#319](https://github.com/frienzy514-png/stellar-TrueStub/issues/319) |
| `apps/frontend/src/components/settings/NotificationPreferences.tsx` | 🔴 Mocked | [#319](https://github.com/frienzy514-png/stellar-TrueStub/issues/319) |
| `apps/frontend/src/stores/favorites.store.ts` | 🔴 Mocked | [#319](https://github.com/frienzy514-png/stellar-TrueStub/issues/319) |
| `apps/frontend/src/app/dashboard/earnings` | 🔴 Mocked | [#319](https://github.com/frienzy514-png/stellar-TrueStub/issues/319) |
| `apps/frontend/src/app/dashboard/escrow/[id]/receipt` | 🔴 Mocked | [#319](https://github.com/frienzy514-png/stellar-TrueStub/issues/319) |
| `apps/frontend/src/app/dashboard/listings/[id]/offers` | 🔴 Mocked | [#319](https://github.com/frienzy514-png/stellar-TrueStub/issues/319) |
| `apps/frontend/src/components/escrow/TicketEscrowIntegration.tsx` | 🔴 Mocked | [#319](https://github.com/frienzy514-png/stellar-TrueStub/issues/319) |
| `apps/frontend/src/components/escrow/TicketEscrowWrapper.tsx` | 🔴 Mocked | [#319](https://github.com/frienzy514-png/stellar-TrueStub/issues/319) |

## Notes

- The two `TicketEscrow*` copies are tracked separately because both still
  contain their own wiring markers; consolidating them is out of scope here.
- This list reflects the wiring gaps known at the time of writing. If you
  find a marker that is missing from this table, add it (and file an issue)
  rather than leaving it untracked.
