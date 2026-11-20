# Changelog Entry Taxonomy

> Issue #416. The source of truth in code is
> [`apps/backend/src/services/changelog-taxonomy.ts`](../apps/backend/src/services/changelog-taxonomy.ts).
> Keep this document and that file in sync.

The backend changelog (`/api/changelog`, `ChangelogService`) is a write-once audit log.
Each entry has an `action` (the **entry type**), an `actorId`, a `resourceId` and optional
`metadata`. Several systems write to it, so every writer must use one of the entry types
below with the matching metadata shape. Consumers can then tell entry kinds apart by
`action` alone, without guessing at each writer's own shape.

## Naming convention

- Format: `<domain>.<past-tense verb>`, all lowercase, with snake_case words, e.g. `dispute.resolved`,
  `dispute.sla_breach`.
- The domain names the resource type. `resourceId` is always that resource's id.
- Deterministic `entryId`s are built as `<entry type>:<resourceId>[:<timestamp>]`, so a
  retried write hits the write-once duplicate check and is not recorded twice.

## Entry types

| Entry type           | `resourceId` | Written by                                  | Metadata shape |
|----------------------|--------------|---------------------------------------------|----------------|
| `dispute.raised`     | disputeId    | `DisputeService.openDispute`                | `{ escrowId, fromState: null, toState: "OPEN", reason }` |
| `dispute.escalated`  | disputeId    | `DisputeService.transition("escalate")`     | `{ escrowId, fromState, toState: "ESCALATED" }` |
| `dispute.resolved`   | disputeId    | `DisputeService.transition("resolve")`      | `{ escrowId, fromState, toState: "RESOLVED", resolution? }` |
| `dispute.withdrawn`  | disputeId    | `DisputeService.transition("withdraw")`     | `{ escrowId, fromState, toState: "WITHDRAWN" }` |
| `dispute.sla_breach` | disputeId    | `GET /api/disputes/sla/breaches`            | `{ escrowId, state: "ESCALATED", escalatedAt, elapsedMs, slaMs, policy: "manual_intervention" }` |
| `refund.submitted`   | refundId     | refund flow (`CHANGELOG_ACTIONS.REFUND_SUBMITTED`) | `{ escrowId, amount, currency?, refundTo }` |
| `refund.completed`   | refundId     | refund flow (`CHANGELOG_ACTIONS.REFUND_COMPLETED`) | `{ escrowId, amount, currency?, refundTo, txHash }` |
| `transfer.completed` | transferId   | transfer flow (`CHANGELOG_ACTIONS.TRANSFER_COMPLETED`) | `{ escrowId, fromOwner, toOwner }` |
| `account.deleted`    | userId       | account-deletion flow                       | `{ reason }` |

`fromState` / `toState` use the dispute state machine values: `OPEN`, `ESCALATED`,
`RESOLVED`, `WITHDRAWN`.

Typed metadata for each entry type is exported as `ChangelogEntryMetadata[<type>]`.

## Enforcement

- `POST /api/changelog` rejects any `action` that is not in the taxonomy with
  `400 CHANGELOG_UNKNOWN_ENTRY_TYPE`.
- Internal writers (`DisputeService`, the disputes route, `recordMoneyMovement`) use the
  `CHANGELOG_ENTRY_TYPES` constants. They never use string literals.
- `ChangelogService.appendEntry` validates the type as a final boundary, so every
  internal writer and API path rejects taxonomy drift with the same error.

## Adding a new entry type

1. Add the constant to `CHANGELOG_ENTRY_TYPES` and its metadata shape to
   `ChangelogEntryMetadata` in `changelog-taxonomy.ts`.
2. Add a row to the table above.
3. Write the entry through the constant. Do not use a string literal.

Never rename or reuse an existing entry type. Entries are write-once, so old entries keep
their original `action` forever. If a type's meaning changes, add a new type.

## Out of scope

The frontend's in-browser escrow changelog (`apps/frontend/src/lib/changelog/escrow-changelog.ts`)
is a separate client-side store with its own `kind` enum. It never writes to the backend
changelog API.
