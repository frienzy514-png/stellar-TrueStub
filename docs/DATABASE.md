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

Migration `006_normalize_events_primary_key.sql` renames the legacy primary-key
constraint to `events_pkey` where required; it does not create a table.

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
- Dispute state, changelog entries, and several refund/transfer coordination
  records currently use in-memory services. They are not durable PostgreSQL
  tables and are not included in historical database analytics.
- Firebase Authentication owns sign-in identities; Firestore and Storage are
  currently unused by the client and default-deny all access. See
  [`apps/frontend/docs/FIREBASE_SECURITY_RULES.md`](../apps/frontend/docs/FIREBASE_SECURITY_RULES.md).

## Schema maintenance

When adding or changing a table, update the SQL migration, Hasura tracking and
permissions, and this document. Keep externally managed Hasura tables clearly
distinguished from repository-owned migrations until their DDL is brought into
this repository.