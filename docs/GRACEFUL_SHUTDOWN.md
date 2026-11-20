# Graceful Shutdown & In-Flight Refund/Transfer Safety

**Issue:** #610
**Date:** 2026-11-20
**Target:** `apps/backend/src/index.ts`, `services/refund.service.ts`, `services/ownership-transfer.service.ts`.

---

## 1. Current state

**There is no graceful-shutdown handling.** `index.ts` calls
`app.listen(...)`, throws away the returned `http.Server`, and registers no
`SIGTERM` or `SIGINT` handler. When the orchestrator (Docker, Kubernetes,
Render, etc.) sends `SIGTERM`, Node's default behavior is to **exit
immediately**:

- In-flight HTTP requests are dropped with no response.
- A refund in the window between "Stellar submission sent" and
  `store.set(..., status: "submitted")` is interrupted. Nothing is logged.
- The refund, dispute, ownership and changelog stores are all in-memory, so
  every record is lost on exit. That includes the `pending` refund record that
  would otherwise show an ambiguous submission.

This is the "silent, untracked interruption" the issue prohibits.

## 2. Why refunds are the critical case

`RefundService.claimRefund` (with an executor) runs in this order:

1. `insertIfAbsent(refundId, { status: "pending" })`
2. `executor.execute(record)`. This signs and submits the Trustless Work
   dispute resolution to Stellar.
3. `store.set(refundId, { status: "submitted", txHash })` or
   `{ status: "failed" }`

If the process dies during step 2, the transaction **may or may not** have
landed on-chain. On restart the `pending` record is gone, so nobody knows to
check. The on-chain contract rejects a second resolution of the same escrow,
so funds cannot move twice. However, a retry fails with a confusing error, and
the buyer's refund status is unknown.

Ownership transfers (`PENDING` → `ACCEPTED`) have the same shape but no
external side effect, so they are lower risk.

## 3. Required behavior

On `SIGTERM` / `SIGINT`:

1. **Stop accepting new connections.** Call `server.close()`. Optionally have
   `/health` return 503 so the load balancer drains this instance first.
2. **Track in-flight requests.** Use a counter middleware, or rely on
   `server.close()`'s callback, which fires once every open connection ends.
   Call `server.closeIdleConnections()` (Node ≥ 18.2) so keep-alive sockets do
   not hold shutdown open.
3. **Wait up to a timeout**, e.g. `SHUTDOWN_TIMEOUT_MS`, default 25s. Keep it
   below the orchestrator's kill grace period (Kubernetes default: 30s).
4. **If the timeout expires with refunds still `pending`:**
   - For every refund record still `pending`, log at **`error`** level a
     structured `refund.shutdown_ambiguous` line containing `refundId`,
     `escrowId`, `refundTo`, `amount`, `claimedAt` and `requestId`.
   - Send the same data to Sentry (`captureMessage`, level `error`, tag
     `requires_manual_review: true`).
   - These records need **manual on-chain reconciliation**. Check the escrow
     on Stellar and Trustless Work to see whether it was resolved.
5. Stop background work (the dispute-resolver balance monitor interval), flush
   Sentry (`Sentry.close(2000)`), then `process.exit(0)` (clean) or
   `process.exit(1)` (timed out).

To make step 4 possible, `RefundStore` / `RefundService` need a way to list
records with `status === "pending"`, e.g. `listPending()`.

Suggested structure: export a `startServer()` that returns
`{ server, shutdown }`. Tests can then call `shutdown("SIGTERM")` directly
without sending real signals to the test runner.

## 4. Required test (acceptance criterion)

`apps/backend/src/index.shutdown.test.ts`:

**Case A: completes within the timeout**
1. Start the server on an ephemeral port with a `RefundService` whose executor
   is a stub that resolves after a controllable delay (e.g. 200ms).
2. Fire `POST /api/refunds` (do not await it), then wait until the executor
   stub has been entered.
3. Call `shutdown("SIGTERM")`.
4. Assert that the HTTP request **receives its 2xx response**, the record ends
   as `submitted` with a `txHash`, and new connections are refused after
   shutdown begins.

**Case B: timeout expires mid-submission**
1. Same setup, but the executor never resolves (or resolves after the
   timeout). Use a short `SHUTDOWN_TIMEOUT_MS` such as 100ms.
2. Call `shutdown("SIGTERM")`.
3. Assert that an `error`-level `refund.shutdown_ambiguous` log line was
   emitted containing the `refundId` and `escrowId`, that Sentry received the
   matching event, and that the exit code passed to a stubbed `process.exit`
   is non-zero.

Together these show that a SIGTERM produces either a completed, consistent
operation or a clearly logged ambiguous state, and never a silent
interruption.

## 5. Related pre-existing issues (fix alongside)

- **Refund log fields are dropped.** `refund.service.ts` calls
  `logger.info("refund.executed", { ...fields })`. Pino's signature is
  `logger.info(obj, msg)`, so the object is treated as a format argument and
  discarded. Every refund log line currently has **no `refundId` /
  `escrowId`**. Swap the argument order, or the ambiguous-state log required
  above will be useless.
- `refund.service.ts` imports `../lib/requestContext` and
  `ownership-transfer.service.ts` imports `../utils/logger`. Neither module
  exists.
- **Long-term fix:** persisting refunds (tracked separately) removes the
  "record lost on restart" half of the problem. A startup job can then
  reconcile any leftover `pending` rows against Stellar.
