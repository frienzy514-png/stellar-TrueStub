# STATUS_MAP doc cross-check (issue #602)

> **Status: Living.** Describes the planned CI check that keeps the
> `STATUS_MAP` table in `apps/backend/README.md` in sync with the code.

## Why

`apps/backend/README.md` § *Trustless Work escrow statuses → Canonical status
list* documents every status `POST /webhooks/escrow-status` accepts, and its
*Completeness contract* says the table and `STATUS_MAP` must agree. Nothing
enforces that today, so the table drifts as soon as someone edits the map and
forgets the README. `GRAPHQL_WIRING_STATUS.md` drifted the same way.

## The three lists are already out of sync

As of this writing there are three separate lists of statuses, and no two
match:

| Source | Location |
| --- | --- |
| Code | `STATUS_MAP` in `apps/backend/src/routes/webhooks.ts` |
| Docs | Canonical status table in `apps/backend/README.md` |
| Test | `DOCUMENTED_TRUSTLESS_WORK_STATUSES` in `apps/backend/src/routes/webhooks.test.ts` |

| Status key | `STATUS_MAP` (code) | README table | Test list |
| --- | --- | --- | --- |
| `created` | `pending` | `pending` | yes |
| `funded` | `funded` | `funded` | yes |
| `active` | `funded` | **missing** | `ACTIVE` (uppercase) |
| `in_progress` | `funded` | **`in_progress`** | — |
| `completed` | `completed` | `completed` | yes (+ `COMPLETE`) |
| `released` | `released` | `released` | yes (+ `RELEASED`) |
| `disputed` | `disputed` | `disputed` | yes (+ `DISPUTED`) |
| `resolved` | `resolved` | `resolved` | — |
| `cancelled` | `cancelled` | `cancelled` | yes (+ `CANCELLED`) |
| `expired` | `expired` | **missing** | — |
| `refunded` | `refunded` | `refunded` | yes (+ `REFUNDED`) |
| `pending` | `pending` | **missing** | `PENDING` (uppercase) |
| `in_review` | `disputed` | **missing** | — |
| `failed` | `cancelled` | **missing** | — |

So:

- The README leaves out five keys (`active`, `expired`, `pending`,
  `in_review`, `failed`) and gives the wrong mapping for `in_progress` (the
  README says `in_progress`, the code says `funded`).
- The test checks `status in STATUS_MAP` with uppercase keys (`ACTIVE`,
  `PENDING`, …) and with `COMPLETE`. The handler lowercases the incoming
  status before the lookup, but the test doesn't, and `STATUS_MAP` has no
  uppercase keys and no `complete` key. As written, the
  `STATUS_MAP coverage` test should fail. (Found by reading the code; the
  suite wasn't run for this doc.)

The first PR that adds the check has to fix the README table and the test so
they start out matching the code.

## The check

### Script

Add `scripts/check-status-map-doc.ts` (run with `tsx`, which the backend
already uses):

1. **Code side.** Import `STATUS_MAP` from
   `apps/backend/src/routes/webhooks.ts`. Importing the real object is more
   reliable than parsing the TypeScript source with a regex. If importing
   `webhooks.ts` pulls in env validation or Sentry at load time, move
   `STATUS_MAP` into its own module (for example `src/routes/status-map.ts`)
   and re-export it from `webhooks.ts`.
2. **Doc side.** Read `apps/backend/README.md`, find the
   `### Canonical status list` heading, and parse the first Markdown table
   under it. Each row has the form `` | `key` | `value` | ``. Strip the
   backticks and whitespace. Stop at the first line that doesn't start with
   `|`.
3. **Compare.** Report each problem separately:
   - a key that's in code but not in the README,
   - a key that's in the README but not in code,
   - a key whose mapped value differs,
   - a key that appears twice in the README table.
4. **Exit codes.** `0` when the two match exactly. `1` on any difference,
   printing one `::error file=apps/backend/README.md::…` line per problem so
   GitHub shows it on the PR. Also exit `1` if the heading or table can't be
   found, so renaming the heading can't silently turn the check off.

Wire it up as `yarn workspace @truestub/backend check:status-map-doc`.

### CI

Add a step to `.github/workflows/backend-ci.yml` after **Install
dependencies**. It doesn't need Postgres, so it can go before the migration
steps:

```yaml
      - name: Check README STATUS_MAP table matches code
        run: yarn workspace @truestub/backend check:status-map-doc
```

`backend-ci.yml` already runs on any change under `apps/backend/**`, which
covers both `webhooks.ts` and `apps/backend/README.md`. No new path filter is
needed.

### Should the test use the same source?

Optional, but recommended. `DOCUMENTED_TRUSTLESS_WORK_STATUSES` in
`webhooks.test.ts` is a third copy of the list. Either:

- have the test call the same README parser, so README, code and test all
  share one list, or
- keep the test's list (it's meant to be Trustless Work's upstream list, not
  ours) but lowercase it before checking.

Either way, fix the uppercase and `COMPLETE` entries.

## Acceptance

- [ ] README table, `STATUS_MAP` and the test list agree (the drift above
      is fixed).
- [ ] A PR that changes `STATUS_MAP` without changing the README table fails
      the **Backend CI** job with a message naming the key.
- [ ] A PR that changes the README table without changing `STATUS_MAP` fails
      the same way.
- [ ] Removing or renaming the `### Canonical status list` heading fails
      the check instead of skipping it.
- [ ] The *Completeness contract* in `apps/backend/README.md` mentions that
      CI enforces it.
