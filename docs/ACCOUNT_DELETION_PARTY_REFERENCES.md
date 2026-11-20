# Account Deletion: Dispute / Refund / Transfer Party References

**Issue:** #608
**Date:** 2026-11-20
**Target:** `apps/backend/src/routes/users.ts` (`DELETE /api/users/me`) and the dispute, refund and ownership-transfer services.
**Status:** Blocked on dispute/refund/transfer persistence. This document defines the required behavior and test so the work can land alongside persistence.

---

## 1. Current state

`DELETE /api/users/me` anonymizes **only the `users` row** in Hasura. It nulls
`email`, names, phone, image, summary, location and country code, sets
`deleted_at`, and then deletes the Firebase Auth account.

It does **not** touch dispute, refund or transfer records. Today those records
live in in-memory stores (`InMemoryDisputeStore`, `InMemoryRefundStore`,
`InMemoryOwnershipStore`). They do not survive a restart, so the gap is not
yet a persistent PII leak. **It becomes one the moment those stores are backed
by a database.**

## 2. Party-identifying fields

| Record | Field(s) referencing a user | Free-text that may contain PII |
| --- | --- | --- |
| `Dispute` | `raisedBy` | `reason`, `resolution` |
| `ClaimedRefund` | `claimedBy`, `refundTo` (Stellar address) | `failureReason` (system text, low risk) |
| `OwnershipTransfer` | `fromOwner`, `toOwner` | — |
| Changelog entry (written by the above) | `actorId` | `metadata` |

The safe outcome depends on what these fields hold:

- **A stable internal ID** (Hasura `users.id` UUID or Firebase `uid`) is
  acceptable. Once the `users` row is anonymized, that ID no longer resolves
  to PII. This is the preferred design.
- **A directly identifying value** (email, display name) must be rewritten
  during deletion.

## 3. Required design (when persistence lands)

1. **Store party references as stable IDs only.** `raisedBy`, `claimedBy`,
   `fromOwner`, `toOwner` and `actorId` must hold the user's internal ID,
   never an email or name. Enforce this at the route/schema layer (e.g. a UUID
   or uid format check).
2. **Extend the anonymization flow** in `users.ts` to run in the same Hasura
   transaction as the `users` update:
   - Redact `disputes.reason` and `disputes.resolution` written by the deleted
     user to a fixed placeholder (e.g. `"[redacted: account deleted]"`). Free
     text is the most likely place for incidental PII (phone numbers, real
     names, addresses).
   - Leave ID references intact so the audit trail and financial
     reconciliation still work.
3. **`refundTo` (Stellar address)** is a pseudonymous on-chain identifier that
   already exists publicly on the ledger, so it must be kept for refund
   reconciliation. Record this decision in `docs/COMPLIANCE_NOTES.md`.
4. **Changelog `metadata`** must not contain PII in the first place. The
   changelog is write-once, so it cannot be redacted later without a
   delete-and-reappend.

## 4. Required test (acceptance criterion)

`apps/backend/src/routes/users.test.ts` (against the persistent stores or a
test Hasura):

1. Seed user **U** with sentinel PII: email `u-608@example.test`, name
   `Sentinel608`.
2. Create, with U as a party:
   - a dispute (`raisedBy = U.id`, `reason` containing `u-608@example.test`)
   - a refund (`claimedBy = U.id`)
   - an ownership transfer (`fromOwner = U.id`)
3. Call `DELETE /api/users/me` as U.
4. Read each record back through **every public read path**
   (`GET /api/disputes/...`, `GET /api/refunds/...`,
   `GET /api/transfers/...`, `GET /api/changelog/resource/...`) and directly
   from the store.
5. Assert that no response body or stored row contains `u-608@example.test`
   or `Sentinel608`, that the party fields still equal `U.id`, and that
   resolving `U.id` against `users` returns only nulled PII with `deleted_at`
   set.

## 5. Until persistence lands

No code change is needed now. The in-memory records disappear on restart and
are only readable during the process lifetime. Contributors implementing
persistence for #608's sibling issues must include §3 and §4 in the same PR.
