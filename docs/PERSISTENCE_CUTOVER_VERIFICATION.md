# Persistence cutover: zero-data-loss verification (issue #600)

> **Status: Living (runbook).** To be followed once, for each environment,
> when disputes, refunds and transfers move from in-memory storage to
> Postgres. Record the results in the deploy PR (see *Record* below).

## The risk

Today these stores are in-process `Map`s:

| Data | Store | File |
| --- | --- | --- |
| Disputes | `InMemoryDisputeStore` | `apps/backend/src/services/dispute.service.ts` |
| Refund claims | `InMemoryRefundStore` | `apps/backend/src/services/refund.service.ts` |
| Ownership transfers | `InMemoryOwnershipStore` | `apps/backend/src/services/ownership-transfer.service.ts` |
| Changelog | `InMemoryChangelogStore` | `apps/backend/src/services/changelog.service.ts` |

A deploy restarts the process, and a restart erases every `Map`. If the
persistent build is deployed without first copying out what's in memory,
every open dispute, unfinished refund claim and pending transfer at that
moment is lost. That's exactly the failure the persistence work is meant to
prevent.

The refund store matters most. It's the idempotency guard for on-chain
refunds. If a `refundId` is lost, the same refund can be claimed again and
**submitted on-chain twice**.

## Prerequisites

- [ ] The persistence migrations are merged and pass CI, including rollback
      (see [PERSISTENCE_MIGRATION_CI_COVERAGE.md](PERSISTENCE_MIGRATION_CI_COVERAGE.md), #599).
- [ ] There is a way to read the in-memory state from the **running**
      process. Either:
  - the admin store-status / dump endpoint proposed separately (preferred),
    deployed **one release before** the cutover, so the old build can be
    snapshotted, or
  - a one-off admin-only `GET` endpoint that returns the full contents of
    each store as JSON, shipped in that earlier release.

  There is no such endpoint today, so this has to ship first. You can't
  snapshot memory from outside the process after the fact.
- [ ] An import path: either the new build loads a snapshot file on first
      boot, or a script inserts the snapshot rows into the new tables. Pick
      one and test it on staging.
- [ ] The backend runs as **a single instance** in the target environment.
      With the in-memory stores, each instance has its own state, so you
      need one snapshot per instance. Write down how many instances run.

## Procedure

Do this on **staging first**, then production.

### 1. Freeze writes

Stop new disputes, refund claims and transfers from arriving between the
snapshot and the deploy. Options, from best to worst:

- turn on maintenance mode, or return 503 on `POST /api/disputes`,
  `/api/refunds/*` and `/api/transfers/*`,
- schedule the deploy for a low-traffic window and accept a short gap,
  which the reconciliation in step 5 has to catch.

Write down the freeze start time (UTC).

### 2. Snapshot

For each instance, fetch the dump and save it with the instance ID and a
timestamp:

```bash
curl -fsS -H "Authorization: Bearer $ADMIN_TOKEN" \
  "$BACKEND_URL/<admin-dump-endpoint>" > snapshot-$(date -u +%Y%m%dT%H%M%SZ).json
```

Then record the counts:

```bash
jq '{disputes: (.disputes|length), refunds: (.refunds|length),
     transfers: (.transfers|length), changelog: (.changelog|length)}' snapshot-*.json
```

Keep the snapshot file somewhere access-controlled. It contains user IDs
and amounts, so don't commit it.

### 3. Deploy

Deploy the persistent build and run migrations (`migrate:up --check-order`).
Import the snapshot using the method chosen in the prerequisites.

### 4. Verify counts

Compare each table's row count with the snapshot count. The table names
below are placeholders; use the ones from the migrations.

```sql
SELECT 'disputes'  AS store, count(*) FROM disputes
UNION ALL SELECT 'refunds',   count(*) FROM refund_claims
UNION ALL SELECT 'transfers', count(*) FROM ownership_transfers
UNION ALL SELECT 'changelog', count(*) FROM changelog_entries;
```

Each count must be **≥** its snapshot count. Higher is fine if writes
resumed. Lower means data was lost.

### 5. Verify record by record

Counts can match by coincidence, so also check every record by ID:

1. Extract the IDs from the snapshot (`disputeId`, `refundId`, transfer ID,
   changelog `entryId`).
2. For each store, check that every ID exists in the new table:

   ```sql
   SELECT s.id
   FROM unnest($1::text[]) AS s(id)
   LEFT JOIN refund_claims r ON r.refund_id = s.id
   WHERE r.refund_id IS NULL;      -- must return zero rows
   ```
3. For refunds, also compare `status`, `escrowId` and `txHash` field by
   field. A refund that comes back in a different status breaks the
   idempotency guard.
4. For disputes, compare `status` and resolution fields.

Any missing ID or mismatched field means you **stop**: don't turn writes
back on until it's re-imported or explained.

### 6. Restart test

Restart the backend once more and run step 4 again. The counts must not
change. This shows the data is actually being read from Postgres and not
from a leftover in-memory store.

### 7. Unfreeze

Turn writes back on. Run one test dispute → refund on staging and check it
shows up in the tables.

## Rollback

If verification fails and can't be fixed quickly:

- **Don't** roll back to the in-memory build while the snapshot hasn't been
  re-imported anywhere. Rolling back starts from empty memory and loses the
  snapshot data a second time.
- Keep writes frozen, fix the import, and run steps 3–6 again from the same
  snapshot file.

## Record

Paste this into the deploy PR, once per environment:

```markdown
### Persistence cutover verification — <environment>

- Instances running: <n>
- Freeze window (UTC): <start> → <end>
- Snapshot file: <location, not committed>

| Store | Snapshot count | Post-deploy count | Missing IDs | Field mismatches |
| --- | --- | --- | --- | --- |
| disputes  |  |  | 0 | 0 |
| refunds   |  |  | 0 | 0 |
| transfers |  |  | 0 | 0 |
| changelog |  |  | 0 | 0 |

- Restart test: counts unchanged ✅ / ❌
- Post-unfreeze smoke (dispute → refund): ✅ / ❌
- Verified by: <name>, <date>
```

If an environment had nothing in memory at cutover (for example, a fresh
staging deploy), still fill in the table with zeros and say so. "Nothing to
lose" has to be recorded, not assumed.

## Acceptance

- [ ] The *Record* block is filled in for staging and production in the
      deploy PR, with zero missing IDs and zero field mismatches.
