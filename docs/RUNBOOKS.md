# Operational Runbooks

Short, on-call-oriented procedures for diagnosing and recovering from
production incidents. Each runbook is self-contained: an on-call person with
no prior context on this codebase should be able to follow it.

- [Stuck or failed refunds](#stuck-or-failed-refunds)

---

## Stuck or failed refunds

### Background

Refunds are initiated by `apps/backend/src/services/dispute.service.ts` and
processed through Trustless Work / the escrow contract. A refund request can
fail in two distinct ways:

1. **The API call fails** — the refund route returns a non-2xx response
   (commonly `502 Bad Gateway`) because Trustless Work or the contract
   rejected the refund.
2. **The API call succeeds but the claim is left in an unexpected state** —
   `claim.status` is anything other than `submitted` after the refund was
   supposed to be recorded.

Both cases leave the refund "stuck": the money has not moved, but the system
may believe a refund is in flight. This runbook covers how to diagnose and
recover.

### 1. Look up the failed refund's state

Start by identifying the claim and its current status.

**Via the database (Hasura):**

```graphql
query StuckRefund($claimId: uuid!) {
  claim_by_pk(id: $claimId) {
    id
    status
    updated_at
    dispute {
      id
      status
      escrow_address
    }
  }
}
```

- `claim.status` should be `submitted` once a refund has been accepted.
- Any other value (`pending`, `rejected`, `failed`, `null`, etc.) means the
  refund did not complete and needs manual recovery.

**Via the on-chain transaction:**

1. Find the escrow address from the dispute record (`dispute.escrow_address`).
2. Look up the escrow on the relevant block explorer (Stellar Expert for
   Stellar/Soroban escrows).
3. Inspect the most recent transactions for the escrow. A refund that was
   rejected will either be absent or show a failed/reverted invocation.
4. Note the transaction hash — you will need it if you escalate.

### 2. What a `502` response typically indicates

A `502 Bad Gateway` returned from the refund path almost always means the
upstream call to Trustless Work / the contract did **not** succeed. Common
causes:

- The contract rejected the refund (e.g. the dispute is not in a refundable
  state, the escrow is already resolved, or the signer is not authorized).
- Trustless Work returned an error or was unreachable.
- The escrow address or dispute state passed to the contract was stale.

A `502` is **not** a transient network blip to blindly retry — first confirm
the on-chain state (step 1) so you do not double-refund.

### 3. Manual recovery steps

Work through these in order. Stop as soon as the refund is confirmed on-chain
and `claim.status` is `submitted`.

1. **Confirm nothing moved on-chain.** Re-check the escrow transactions
   (step 1). If a refund already settled, do **not** retry — reconcile the
   `claim.status` to `submitted` instead and close the incident.
2. **Re-check the dispute state.** Ensure the dispute is still in a
   refundable state and the escrow address matches the one on-chain. If the
   dispute was resolved or cancelled, the refund is no longer valid — escalate
   to the disputing parties (step 3).
3. **Manually retry the refund.** Once you have confirmed the refund did not
   settle and the dispute is still refundable, re-trigger the refund through
   the normal refund path (the same route that calls
   `dispute.service.ts`). Watch the response:
   - `2xx` and `claim.status == submitted` → recovered. Close the incident.
   - Another `502` → capture the response body and the on-chain transaction
     hash, then escalate.
4. **Escalate to the disputing parties.** If the refund cannot be completed
   programmatically (contract rejection, dispute no longer refundable, or
   repeated `502`s), notify the disputing parties with:
   - the claim ID and dispute ID,
   - the escrow address and any transaction hash,
   - the observed `claim.status` and the error returned,
   - the recommended next step (manual settlement or dispute re-opening).
5. **Record the outcome.** Update the claim/dispute with the resolution and
   note the incident in the on-call log so the next responder has context.

### Quick reference

| Symptom | Likely cause | First action |
| --- | --- | --- |
| `502` from refund route | Trustless Work / contract rejected the refund | Check on-chain state (step 1) before retrying |
| `claim.status != submitted` | Refund did not complete | Confirm on-chain, then manual retry (step 3) |
| Repeated `502`s | Contract rejection or stale dispute state | Escalate to disputing parties (step 4) |
