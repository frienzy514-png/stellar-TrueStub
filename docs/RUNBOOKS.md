# Operational Runbooks

Short, on-call-oriented procedures for diagnosing and recovering from
production incidents. Each runbook is self-contained: an on-call person with
no prior context on this codebase should be able to follow it.

- [Stuck or failed refunds](#stuck-or-failed-refunds)
- [Double refund detected](#double-refund-detected)

_Last checked against the code: 2026-10-18 (`apps/backend/src/routes/refunds.ts`,
`apps/backend/src/services/refund.service.ts`,
`apps/backend/src/lib/trustless-work.ts`). If those files change, re-check
this runbook._

---

## Stuck or failed refunds

### How a refund works

A buyer's client calls `POST /api/refunds/claim` on the backend (Firebase
auth required) with a `refundId` (idempotency key), the Trustless Work
escrow contract id `escrowId` (`C…`), `refundTo` (buyer's Stellar address),
and `amount` (the full disputed balance). The backend then:

1. Records the claim with `status: "pending"`.
2. Calls Trustless Work `POST /escrow/{single-release|multi-release}/resolve-dispute`
   (or `resolve-milestone-dispute`), which returns an unsigned transaction.
3. Signs it with the platform dispute-resolver key
   (`TRUSTLESS_WORK_DISPUTE_RESOLVER_SECRET`).
4. Submits it through Trustless Work `POST /helper/send-transaction`.
5. On success, sets `status: "submitted"` and stores `txHash`. On any
   failure, sets `status: "failed"` with a `failureReason`, and the request
   returns an error.

The four claim statuses are `claimed`, `pending`, `submitted` and `failed`.
Production only uses the last three. `claimed` appears only when the
service runs without an on-chain executor.

> **Important: claim records are not in the database.** They are held in an
> in-memory map inside the backend process (`InMemoryRefundStore`). This has
> three consequences for on-call:
>
> - A backend restart or redeploy erases every claim record. After a
>   restart, `GET /api/refunds/claim/:refundId` returns `404`, even for
>   refunds that settled. **The chain is the source of truth**, not the API.
> - With more than one backend replica, each replica has its own map. A
>   `404` can just mean that your request reached a different replica.
> - There is no Hasura table for refund claims. Don't look for one.

### What "stuck" looks like

| Symptom | What it means |
| --- | --- |
| `502 REFUND_EXECUTION_FAILED` | Trustless Work or Stellar rejected one of steps 2–4. Claim is now `failed`. |
| `503 REFUND_EXECUTION_UNAVAILABLE` | `TRUSTLESS_WORK_API_KEY` or `TRUSTLESS_WORK_DISPUTE_RESOLVER_SECRET` is not set on the backend. Nothing was sent. |
| `503 REFUND_MAINNET_SUBMISSION_BLOCKED` | Documented in the route header (non-production environment configured for mainnet), but as of this review the claim path never raises it. If you do see it, nothing was sent. Fix the config; don't retry. |
| `409 REFUND_ALREADY_CLAIMED` with `claim.status: "failed"` | Someone retried a failed refund with the same `refundId`. See [step 4](#4-recover). |
| `409 REFUND_ALREADY_CLAIMED` with `claim.status: "pending"` | A first attempt is still in flight, or hung. See [step 3](#3-check-the-chain). |
| Claim stays `pending` | The outbound call to Trustless Work hasn't returned. The backend sets no timeout on it. |
| `400 REFUND_INVALID_PAYLOAD` | Bad request body (address format, amount ≤ 0, missing `milestoneIndex` for multi-release). Caller error, not an incident. |

### 1. Collect the identifiers

You need these before you start. Get them from the user report or from the
logs:

- `refundId` and `escrowId` (contract id, `C…`)
- the request's correlation id (`requestId`). It is returned in the
  `x-request-id` response header, appears on every log line, and is a tag on
  the Sentry event.
- which network the backend is on: `STELLAR_NETWORK` (`testnet` default, or
  `mainnet`)

**Logs:** search the backend logs for the `refundId`. These are the events,
in order:

| Log event | Level | Meaning |
| --- | --- | --- |
| `refund.claim.accepted` | info | Claim recorded as `pending`; on-chain call starting. |
| `refund.executed` | info | Succeeded. Carries `txHash`. |
| `refund.execution_failed` | error | Failed. `reason` carries the upstream message (see step 2). |
| `refund.already_claimed` | warn | A repeat request for the same `refundId` was rejected. |

**Sentry:** filter by the tag `refundId:<id>` or `requestId:<id>`. The route
also attaches a `refund_failure` context with the error `code`.

**API (only useful if the backend hasn't restarted since):**

```bash
curl -H "Authorization: Bearer <firebase-id-token>" \
  "$BACKEND_URL/api/refunds/claim/<refundId>"
```

Returns `{ claim: { status, txHash?, failureReason?, … } }` or `404`.

### 2. Read the failure reason

The `502` message and the `reason` log field come from
`apps/backend/src/lib/trustless-work.ts`. The wording tells you which step
failed:

| `reason` starts with | Failed at | Did anything reach the chain? |
| --- | --- | --- |
| `Trustless Work /escrow/<type>/resolve-dispute failed: …` (or `resolve-milestone-dispute`) | Step 2: Trustless Work refused to build the transaction | **No.** Common causes: escrow not in dispute, already resolved, signer isn't the escrow's dispute resolver, amount ≠ disputed balance. The text after `failed:` is Trustless Work's message. |
| `… returned no unsignedTransaction` | Step 2: unexpected Trustless Work response | **No.** |
| `Trustless Work /helper/send-transaction failed: …` | Step 4: submission rejected by Trustless Work | **Probably not, but check.** The transaction was signed. |
| `Stellar transaction <hash> was not accepted: …` | Step 4: Stellar didn't report `SUCCESS` | **Check the hash.** It is in the message. |
| `TRUSTLESS_WORK_API_KEY and … must be configured` | Config (this is the `503`) | **No.** |
| Anything else (e.g. `fetch failed`, a timeout) | Network error between backend and Trustless Work | **Unknown.** Treat as possibly submitted until step 3 proves otherwise. |

Every message ends with `[requestId=…]`. Quote it when you contact Trustless
Work.

A `502` is **not** a transient blip to retry blindly. Always do step 3 first.

### 3. Check the chain

The chain decides whether money moved. Use Stellar Expert:

- Testnet: `https://stellar.expert/explorer/testnet/contract/<escrowId>`
- Mainnet: `https://stellar.expert/explorer/public/contract/<escrowId>`
- A specific transaction: replace `contract/<escrowId>` with `tx/<txHash>`.

Look at the escrow's most recent invocations:

- **A successful dispute-resolution invocation after the claim time** →
  the refund settled. Do **not** retry. Go to step 5.
- **No such invocation, or only failed ones** → no money moved. Go to
  step 4.

You can also ask Trustless Work for the escrow's live state. This is the
same call the backend's reconciliation code makes:

```bash
curl -H "x-api-key: $TRUSTLESS_WORK_API_KEY" \
  "$TRUSTLESS_WORK_API_URL/escrow/<escrowId>"
```

A status that shows the dispute as resolved means the refund (or a
release) already happened. Still in dispute means it didn't.

If the claim is `pending` and step 3 shows nothing on-chain, wait a few
minutes and check again before going further. The request may still be in
flight. Retrying while it is in flight is exactly the race the idempotency
key exists to prevent.

### 4. Recover

Before retrying, confirm **all** of the following:

- [ ] Step 3 shows no successful resolution for this escrow.
- [ ] The escrow is still **in dispute**. If it was resolved or released
      some other way, a refund is no longer possible. Escalate (step 6).
- [ ] `amount` equals the escrow's full disputed balance.
- [ ] The backend's dispute-resolver public key is the escrow's
      `disputeResolver`. A mismatch means a rotation happened (see
      [`dispute-resolver-key-rotation.md`](dispute-resolver-key-rotation.md)).
- [ ] The dispute-resolver wallet has enough XLM for fees.
- [ ] For `Trustless Work … failed:` reasons, the underlying cause in the
      message is fixed. Retrying a deterministic rejection fails the same way.

**How to retry.** The route header says a `failed` claim can be retried with
the same `refundId`. **In the current code it can't.** A second request with
the same `refundId` returns `409 REFUND_ALREADY_CLAIMED` (with the failed
claim in the body) and makes no on-chain call. Retry with a **new**
`refundId`, keeping the same `escrowId`, `refundTo` and `amount`:

```bash
curl -X POST "$BACKEND_URL/api/refunds/claim" \
  -H "Authorization: Bearer <firebase-id-token of the buyer>" \
  -H "Content-Type: application/json" \
  -d '{"refundId":"<original-refundId>-retry-1","escrowId":"C...","refundTo":"G...","amount":"<disputed balance>"}'
```

This is safe from double payment only because step 3 confirmed that nothing
settled. The contract also refuses to resolve an already-resolved escrow.
Record both `refundId`s in the incident notes.

- `201` with `claim.status: "submitted"` and a `txHash` → confirm the hash
  on Stellar Expert, then go to step 5.
- Another `502` with the same reason → stop retrying and escalate (step 6).

The route header also mentions a retry budget
(`REFUND_NEEDS_MANUAL_INTERVENTION` after `MAX_REFUND_ATTEMPTS`). That code
is not enforced in the current claim path either, so nothing will stop
repeated manual retries. That makes the stop rule above your
responsibility.

### 5. Close out

- Tell the buyer the refund settled and give them the `txHash`.
- If the API still shows `failed` (or `404` after a restart) for a refund
  that settled on-chain, that's expected. There is no persisted record to
  fix. Note it in the incident.

### 6. Escalate

Escalate when the escrow is no longer in dispute, when Trustless Work keeps
rejecting a correct request, or when you can't tell from the chain whether
funds moved. Send Trustless Work support and the disputing parties:

- `refundId` (and any retry ids), `escrowId`, network
- the `requestId` correlation id(s)
- the exact `reason` / `502` message
- any `txHash`, and what Stellar Expert shows for it
- what you already tried

Recommend a next step: manual settlement, re-opening the dispute, or
waiting on Trustless Work.

### Quick reference

| Symptom | First action |
| --- | --- |
| `502`, reason `… resolve-dispute failed: …` | Read the Trustless Work message, then check that the escrow is still in dispute (step 3). |
| `502`, reason `Stellar transaction <hash> was not accepted` | Look up `<hash>` on Stellar Expert before anything else. |
| `502`, network error | Treat as maybe-submitted. Step 3 before any retry. |
| `503` | Configuration problem on the backend. Fix the env, then retry. |
| `409` with `status: "failed"` | Retry with a **new** `refundId` after step 3 and the step 4 checklist. |
| Stuck `pending` | Check the chain, wait, check again. Don't retry while the request may still be in flight. |
| `404` from the status endpoint | Backend restarted or the request reached a different replica. Use the chain. |

---

## Double refund detected

Idempotency for refund claims is held in memory by `InMemoryRefundStore`
(`apps/backend/src/services/refund.service.ts`). A replica restart, a
redeploy, or two replicas racing past the check can let the same escrow be
refunded twice. Treat any suspected double refund as an incident.

### 1. Detect

- **Chain check (authoritative):** list the on-chain `resolve-dispute`
  transactions for each affected `escrowId` on Stellar Expert. Two
  successful refund transactions for one escrow, or two transfers to the
  buyer's `refundTo` address for the same disputed amount, confirm the event.
- **Backend signal:** two `POST /api/refunds/claim` requests for the same
  escrow with different `refundId` values in the request logs, both returning
  `2xx` or `502` with a `txHash`.
- **Balance check:** the escrow balance is lower than the disputed amount
  and the buyer's account received more than once.

### 2. Notify

- Page the on-call engineer and the platform owner immediately.
- Notify the disputing parties (buyer and seller) through the usual support
  channel once the duplicate is confirmed, with the transaction hashes.
- Record the incident in the team's incident log with the affected
  `escrowId`s, `refundId`s and `txHash`es.

### 3. Stop further damage

- Pause new refund claims for the affected escrows. Do not retry any
  `pending` or `failed` claim until the chain has been checked (see
  [Stuck or failed refunds](#stuck-or-failed-refunds), step 3).
- If the problem comes from a replica race, scale to a single replica until
  a persistent or shared idempotency store is in place.

### 4. Remediate

Choose one per affected escrow, with the parties' agreement:

- **Claw-back request:** ask the buyer to return the duplicate amount to the
  escrow or platform wallet, and record the agreed transaction hash.
- **Write-off:** if the buyer cannot or will not return the funds, the
  platform absorbs the loss. Record the amount and get sign-off from the
  platform owner.
- **Insurance:** if platform insurance covers the loss, follow the claim
  process and keep the evidence (transaction hashes, logs).

### 5. Correct the escrow state

- Confirm on-chain that the escrow balance and status match the agreed
  outcome. The chain is the source of truth, not the API.
- Do **not** edit in-memory claim records by hand. Any correction is an
  on-chain or ledger-backed record, and a backend restart clears the
  in-memory map anyway.
- Document the final settled amount and the closing transaction hash in the
  incident log.

### 6. Follow up

- Add a regression test for the race or restart path that caused the
  duplicate before closing the incident.
- Track the move to a persistent refund idempotency store as the root fix.
