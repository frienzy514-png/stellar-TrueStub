# Database Schema

TrueStub uses PostgreSQL for application data and Hasura as its GraphQL API.
The schema has two ownership layers: SQL migrations in `apps/backend` define
tables maintained by this repository, while core escrow and identity tables
are provisioned and tracked in the shared Hasura database. There is no checked
in Hasura metadata or base-schema migration for those shared tables, so the
fields below describe the contract currently used by application code rather
than a complete database DDL.

## Repository-owned migrations

Migrations are in `apps/backend/src/db/migrations/` and are applied in version
order by the backend's `migrate:up` script. Apply them to a configured local
Postgres instance with:

```bash
yarn workspace @truestub/backend migrate:up
```

### `migrate:up` vs `migrate:up:audited`

Both scripts apply the same pending migrations with the same
`node-pg-migrate` command. They differ only in what gets recorded:

| Script | What it runs | What it records |
| --- | --- | --- |
| `migrate:up` | `node-pg-migrate up` | Only `node-pg-migrate`'s own `pgmigrations` bookkeeping: migration name and `run_on`. |
| `migrate:up:audited` | `migrationAudit.ts --before`, then `node-pg-migrate up`, then `migrationAudit.ts --after` | Everything `migrate:up` records, plus one deploy record that lists exactly the migrations **this run** applied, tagged with the release version (`RELEASE_VERSION` or `package.json`), the environment, and a timestamp. The record goes to the `migration_audit_log` table, the `deploy-migrations.log` file (`MIGRATION_AUDIT_LOG_FILE` overrides the path), and the structured logger. |

Use **`migrate:up:audited` for every deploy to a shared environment**
(staging, previews with their own database, production), so you can answer
"which release applied this schema change, and when". Use plain `migrate:up`
for local databases and CI, where there's no deploy to attribute. CI uses
`migrate:up`, so the audit table isn't created there.

`--before` writes a baseline of `pgmigrations` to
`.migration-audit-before.json` (git-ignored), and `--after` diffs against it
and then deletes it. Without a baseline, `--after` records every applied
migration. `src/db/migrationAudit.test.ts` checks that the two scripts stay
different in this way.

Both are also exposed at the repo root (`yarn migrate:up`,
`yarn migrate:up:audited`).

> **Migration file count**: There are **8 migration files** covering version
> numbers 001–007. Two files share the `007` prefix
> (`007_add_idempotency_unique_constraints.sql` and
> `007_create_notification_dead_letters.sql`). `node-pg-migrate` applies them
> in filename-alphabetical order, so `007_add_idempotency…` runs before
> `007_create_notification…`. Both must be applied for a consistent schema.

| Table or view | Purpose and relationships | Defined by |
| --- | --- | --- |
| `reviews` | Buyer/seller reviews associated with an `escrow_id`; one review per escrow and reviewer. Ratings are constrained to 1–5. | `001_create_ratings_reviews.sql` |
| `user_reputation_summary` (view) | Per-reviewee counts, average rating, star distribution, and positive-rating percentage, derived from `reviews`. | `001_create_ratings_reviews.sql` |
| `events` | Ticketed event records with name, description, address, optional area and coordinates, owner ID, and creation timestamp. Migration `002` renames legacy `hotels` when present; migration `003` creates the current table if needed. | `002_rename_hotels_to_events.sql`, `003_rename_hotels_to_events.sql` |
| `events_migration_verification` | Counts and classifies data encountered during the legacy `hotels` to `events` rename. | `002_rename_hotels_to_events.sql` |
| `events_migration_audit` | Flags legacy event rows that appear hospitality-shaped for manual review. | `003_rename_hotels_to_events.sql` |
| `ticket_listings` | Seller-owned ticket listings, with price, quantity, availability, and timestamps. `owner_id` is the listing owner identifier. | `004_create_ticket_listings.sql` |
| `listing_offers` | Offers associated with `ticket_listings` by `listing_id`; deleting a listing cascades to its offers. | `004_create_ticket_listings.sql` |
| `migration_verification_reports` | Records row counts and review details for the legacy domain migration. | `004_create_ticket_listings.sql` |
| `notifications` | User-targeted in-app notifications with type, title, message, read state, and creation timestamp. | `005_create_notifications.sql` |
| `watchlist_price_tracking` | A user's saved listing price and last-notified price; unique per user and listing. | `005_create_notifications.sql` |
| `refund_idempotency` | Idempotency keys for refund requests; unique on both `idempotency_key` and `refund_id` so concurrent duplicates fail at the database. | `007_add_idempotency_unique_constraints.sql` |
| `transfer_idempotency` | Same as `refund_idempotency`, for ownership-transfer requests. | `007_add_idempotency_unique_constraints.sql` |
| `notification_dead_letters` | Notifications that could not be delivered, with the payload, last error, and attempt count. | `007_create_notification_dead_letters.sql` |
| `row_change_audit` | Append-only, database-level record of every `UPDATE`, `DELETE`, and `TRUNCATE` on `disputes`, `ownership_transfers`, `transfers`, and `refunds`, including changes made directly in the database. See [Row-level change auditing](#row-level-change-auditing). | `012_row_change_audit.sql` |
| `migration_audit_log` | One row per audited deploy (`migrate:up:audited`): release version, environment, timestamp, the migrations that run applied, and an optional note. Created at runtime by `migrationAudit.ts`'s `ensureAuditTable()` function, not by a SQL migration file. | Runtime (`apps/backend/src/db/migrationAudit.ts`) |

Migration `006_normalize_events_primary_key.sql` renames the legacy primary-key
constraint to `events_pkey` where required; it does not create a table.

### Rolling back

Every migration has a `-- Down Migration` section, and backend CI rolls all of
them back in reverse order and re-applies them on every PR that touches
`apps/backend`. To roll back the most recent migration locally:

```bash
yarn workspace @truestub/backend migrate:down
```

Two down steps are deliberately conservative because `events` may contain
rows carried over from SafeTrust:

- `003` drops `events` only when it is empty. Otherwise it leaves the table
  in place.
- `002` then renames a remaining `events` table back to `hotels` (and
  `events_pkey` back to `hotels_pkey`), which mirrors its up step.

`006`'s down step is a no-op on purpose.

### Cross-environment migration state

`002` and `003` are two different variants of the same hotels → events
rename, so environments that applied different variants could end up with
the `events` primary key named either `hotels_pkey` or `events_pkey`. `006`
normalizes this. The migration files existing in the repository does not
mean every environment has run them, so check each environment directly:

```bash
psql "$DATABASE_URL" -f apps/backend/scripts/check-migration-state.sql
```

The script is read-only. It lists the rows in `pgmigrations`, confirms that
`006_normalize_events_primary_key` has been applied, checks the `events`
primary-key name, and finishes with a `CONSISTENT` / `INCONSISTENT: …`
verdict. If the verdict is `INCONSISTENT` because `006` hasn't run, run
`migrate:up` against that environment and check again.

Record each run below. The table was added on 2026-10-18 and no environment
has been checked yet, so every row starts as pending.

| Environment | Checked on | Highest migration in `pgmigrations` | `events` PK name | Verdict |
| --- | --- | --- | --- | --- |
| Staging | _pending_ | _pending_ | _pending_ | _pending_ |
| Deployed previews (each one that has its own database) | _pending_ | _pending_ | _pending_ | _pending_ |
| Shared local/dev databases used for testing | _pending_ | _pending_ | _pending_ | _pending_ |
| Production (if any) | _pending_ | _pending_ | _pending_ | _pending_ |

CI's Postgres service starts empty on every run, so it applies `006` every
time and doesn't need a row.

## Row-level change auditing

The write-once changelog only records events the application chooses to write.
It doesn't capture a manual fix in `psql`, a one-off script, or an edit in the
Hasura console. Migration `012_row_change_audit.sql` adds Postgres triggers
that record every change to the money-critical tables at the database level,
whatever made the change (issue #546).

- **Covered tables:** `disputes`, `ownership_transfers`, `transfers`, `refunds`.
  The trigger is attached only to the ones that exist when `012` runs. Disputes
  and transfers are still in memory, and `refunds` is Hasura-managed.
- **When a persistence migration creates one of these tables, it must attach
  the audit** in the same migration:

  ```sql
  SELECT attach_row_change_audit('disputes');
  ```

  This is idempotent. `detach_row_change_audit('<table>')` removes it, and
  belongs in that migration's down section.
- **What is captured:** table, operation, primary-key value (looked up from
  the catalog, so `dispute_id` and `transfer_id` both work), the full old row,
  the full new row, the changed columns, the database role, the session user,
  `application_name`, the client address, the transaction id, and a timestamp.
  `UPDATE`s that don't actually change a column are skipped. `TRUNCATE` is
  recorded by a statement-level trigger.
- **Telling manual edits from application writes:** the application can label
  its writes by running `SET LOCAL truestub.change_source = 'application';`
  inside the transaction. Any change without that label is recorded with
  `change_source = 'direct'`. Find manual interventions with:

  ```sql
  SELECT * FROM row_change_audit
   WHERE change_source = 'direct'
   ORDER BY changed_at DESC;
  ```

- **Tamper resistance:** `row_change_audit` is append-only. `UPDATE`, `DELETE`,
  and `TRUNCATE` on it raise `ROW_CHANGE_AUDIT_IMMUTABLE`. The trigger function
  runs as the role making the change, so that role needs `INSERT` on
  `row_change_audit`. If it doesn't have it, the edit fails. Nothing gets
  changed without an audit row.

## Hasura-managed application tables

The following tables are queried by the app and backend but are not created by
the SQL migrations in this repository. Their authoritative DDL and Hasura
permissions must be maintained in the Hasura project/environment.

| Table | Observed fields and purpose | Primary access path |
| --- | --- | --- |
| `escrow_transactions` | `id`, `contract_id`, `buyer_id`, `seller_id`, `amount`, `status`, `created_at`, and `updated_at` are used by backend reconciliation and analytics. The frontend also queries `currency`, `listing_name`, and `released_at` for earnings. | Hasura GraphQL; status changes are written by the HMAC-verified backend webhook. |
| `escrow_transaction_users` | Participant `user_id`, `role`, `funding_status`, `wallet_address`, `funded_at`, and transaction hash fields associate users with escrow funding. | Hasura GraphQL. |
| `users` | User profile and identity data used by profile, login, and account-management flows. | Hasura GraphQL and authenticated backend routes. |
| `refunds` | Refund records and `retry_count` used by the backend's bounded retry flow. | Backend Hasura client. |

`events`, `ticket_listings`, `listing_offers`, `notifications`, and
`watchlist_price_tracking` are repository-owned migrations, even though the
frontend accesses them through Hasura. After applying schema changes, reload
Hasura metadata and verify the tables and relationships are tracked with the
intended permissions. For example, the migrations document owner-scoped writes
for events and listings; Hasura permissions, not client-side filtering, must
enforce those rules.

## Service ownership

- The frontend reads and writes through Hasura GraphQL using the signed-in
  Firebase user's JWT. Never put a Hasura admin secret in frontend variables.
- `apps/backend` uses `HASURA_ADMIN_SECRET` only on the server for privileged
  operations, such as escrow status webhooks and operator analytics. User-facing
  backend routes must verify Firebase ID tokens and enforce authorization before
  using that client.
- `/api/analytics` reads every escrow on the platform through the admin
  client, by design. It is admin-only. See
  [`ANALYTICS_ACCESS_MODEL.md`](ANALYTICS_ACCESS_MODEL.md).
- Dispute state, changelog entries, and several refund/transfer coordination
  records currently use in-memory services. They are not durable PostgreSQL
  tables and are not included in historical database analytics.
- Firebase Authentication owns sign-in identities; Firestore and Storage are
  currently unused by the client and default-deny all access. See
  [`apps/frontend/docs/FIREBASE_SECURITY_RULES.md`](../apps/frontend/docs/FIREBASE_SECURITY_RULES.md).

## Backup and disaster recovery

An untested backup is not a backup. This section documents the restore
procedure that was actually performed and verified, not just the assumption
that the hosting provider takes snapshots.

### Taking a snapshot

1. Identify the Postgres instance backing the environment (managed provider
   console or `DATABASE_URL` host) and confirm automated snapshots are enabled
   with a retention window long enough to cover the recovery-point objective.
2. Trigger an on-demand snapshot before any risky migration or data operation:
   - Managed providers: use the console/CLI "create snapshot" action.
   - Self-managed Postgres: `pg_dump --format=custom --no-owner --no-acl \
     "$DATABASE_URL" > truestub-$(date +%Y%m%d%H%M%S).dump`
3. Record the snapshot identifier, timestamp, and the migration version the
   source database was at (`SELECT name, run_on FROM pgmigrations ORDER BY run_on DESC LIMIT 1;`,
   the table `node-pg-migrate` records applied migrations in).

### Restoring into a fresh environment

1. Provision an empty Postgres instance that is **not** the production
   instance and has no application traffic.
2. Restore the snapshot:
   - Managed providers: restore the snapshot into a new instance/database.
   - `pg_dump` archives: `pg_restore --clean --if-exists --no-owner --no-acl \
     --dbname "$RESTORE_DATABASE_URL" truestub-<timestamp>.dump`
3. Point a scratch backend environment at the restored database
   (`DATABASE_URL`/`HASURA_*` variables) and run migrations to confirm the
   restored schema is at or can be brought to the expected version:

   ```bash
   yarn workspace @truestub/backend migrate:up
   ```

   Migrations must apply cleanly (or report "already applied") with no manual
   intervention. A migration that fails against restored data means the
   snapshot is not a usable recovery point.

### Verifying integrity

Run these against both the source and the restored database and compare:

```sql
SELECT count(*) FROM reviews;
SELECT count(*) FROM events;
SELECT count(*) FROM ticket_listings;
SELECT count(*) FROM listing_offers;
SELECT count(*) FROM notifications;
SELECT count(*) FROM watchlist_price_tracking;
SELECT count(*) FROM escrow_transactions;
SELECT count(*) FROM refunds;
```

#### Money-critical tables: disputes, refunds, transfers

Disputes, refunds, and transfers represent money that is contested or in
flight, so every restore drill checks them **row for row**, not just by count
(issue #545). Run the fingerprint script against both databases and diff the
output:

```bash
psql "$DATABASE_URL"         -X -q -A -t -f apps/backend/scripts/verify-critical-tables-restore.sql > source.txt
psql "$RESTORE_DATABASE_URL" -X -q -A -t -f apps/backend/scripts/verify-critical-tables-restore.sql > restored.txt
diff source.txt restored.txt && echo "critical tables restored intact"
```

For `disputes`, `refunds`, `refund_idempotency`, `ownership_transfers`,
`transfers`, `transfer_idempotency`, and `row_change_audit`, the script prints
`table|row_count|md5`. The md5 covers every row, so any missing, duplicated,
or altered record shows up as a difference. A table that doesn't exist yet
(still in memory or Hasura-managed) prints as `MISSING`. That's expected while
it isn't persisted, but if it's `MISSING` in only one of the two outputs, the
restore failed. Take the source fingerprint at the moment of the snapshot, or
with writes paused, so new rows don't show up as differences.

The drill fails if the diff isn't empty. When a table is moved from memory to
Postgres, add it to the script's table list in the same PR.

Also spot-check referential integrity and value ranges:

```sql
-- Orphaned reviews (should return 0 rows)
SELECT r.* FROM reviews r
LEFT JOIN escrow_transactions e ON e.id = r.escrow_id
WHERE e.id IS NULL;

-- Ratings outside the allowed 1-5 range (should return 0 rows)
SELECT * FROM reviews WHERE rating < 1 OR rating > 5;

-- Offers whose listing no longer exists (should return 0 rows)
SELECT o.* FROM listing_offers o
LEFT JOIN ticket_listings l ON l.id = o.listing_id
WHERE l.id IS NULL;
```

### Smoke-testing the application

1. Start the backend against the restored database and exercise the
   HMAC-verified escrow webhook path plus at least one authenticated
   user-facing route.
2. Start the frontend pointed at the restored Hasura instance and confirm
   sign-in, listing browse, and earnings/escrow views render data from the
   restored snapshot.
3. Confirm Hasura metadata is tracked for the restored tables (reload metadata
   if the restore target is a new Hasura project).

### Recorded test restore

| Field | Value |
| --- | --- |
| Date performed | _pending — record the date of the next drill_ |
| Snapshot source | _pending_ |
| Restore target | _pending_ |
| Migrations applied | _pending_ |
| Row-count comparison | _pending_ |
| Disputes/refunds/transfers fingerprint diff (`verify-critical-tables-restore.sql`) | _pending_ |
| Integrity checks | _pending_ |
| Smoke tests | _pending_ |
| Result | _pending_ |

Update this table every time the drill is run. A restore that has not been
re-run since a schema or provider change should be treated as unverified.

## Changelog growth management

The write-once changelog is immutable and append-only, so it grows without
bound. No archival strategy for moving older entries out of hot storage
has been documented yet (an earlier version of this page linked to a
`CHANGELOG_ARCHIVAL.md` that was never added). Until one is, don't add indexes
or queries that assume the full changelog history will always be in the hot
table.

## Schema maintenance

When adding or changing a table, update the SQL migration, Hasura tracking and
permissions, and this document. Keep externally managed Hasura tables clearly
distinguished from repository-owned migrations until their DDL is brought into
this repository.