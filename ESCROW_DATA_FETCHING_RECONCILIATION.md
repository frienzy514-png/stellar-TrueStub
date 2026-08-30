# Escrow Data-Fetching Stack Reconciliation Analysis

**Issue**: Two independent data-fetching layers for escrow domain with separate caches (Apollo InMemoryCache vs TanStack Query cache) risk inconsistency after mutations.

**Status**: ✅ **INTENTIONAL SEPARATION** - Both stacks serve fundamentally different data sources and should coexist, but require explicit documentation and clear component responsibilities.

---

## Architecture Overview

### Stack 1: Apollo Client / GraphQL (Hasura Backend)
**Purpose**: Query and subscribe to Hasura database state  
**Endpoint**: GraphQL backend (Hasura)  
**Cache**: Apollo InMemoryCache  
**Update Pattern**: Subscriptions + direct mutations

| Artifact | Path | Purpose |
|----------|------|---------|
| **Query** | `apps/frontend/src/graphql/queries/escrow-queries.ts` | `GET_ESCROW_TRANSACTIONS` - fetch escrow_transactions table |
| **Subscriptions** | `apps/frontend/src/graphql/subscriptions/escrow-subscriptions.ts` | Live updates: `ESCROW_STATUS_SUBSCRIPTION`, `USER_ESCROW_ACTIVITY_SUBSCRIPTION` |
| **Hook** | `apps/frontend/src/hooks/useEscrowSubscription.ts` | Consume subscription with toast notifications |
| **Mutation** | `apps/frontend/src/graphql/mutations/escrow.ts` | `FUND_ESCROW_TRANSACTION` (currently unused?) |

**Used By**:
- `EscrowList.tsx` - List all escrow_transactions from Hasura
- `ActivityFeed.tsx` - Show escrow activity 
- `CacheWarmer.tsx` - Pre-fetch critical data
- `RealTimeEscrowStatus.tsx` - Subscribe to status changes
- `EscrowNotesPanel.tsx` - View notes
- `ApolloTestComponent.tsx` - Development/testing

---

### Stack 2: TanStack Query / @trustless-work/escrow (Blockchain Indexer)
**Purpose**: Query and mutate real on-chain escrow state via Trustless Work Indexer API  
**Endpoint**: External Trustless Work Indexer (off-chain index of on-chain state)  
**Cache**: TanStack Query QueryClient  
**Update Pattern**: On-chain transaction + invalidateQueries on success

| Artifact | Path | Purpose |
|----------|------|---------|
| **Queries** | `apps/frontend/src/components/tw-blocks/tanstack/useEscrowsByRoleQuery.ts` | Fetch escrows by role (approver/marker/releaser) from indexer |
| | `apps/frontend/src/components/tw-blocks/tanstack/useEscrowsBySignerQuery.ts` | Fetch escrows by wallet signer from indexer |
| **Mutations** | `apps/frontend/src/components/tw-blocks/tanstack/useEscrowsMutations.ts` | 8 on-chain operations: deploy, update, fund, approve, changeMilestoneStatus, startDispute, releaseFunds, resolveDispute |
| **Provider** | `apps/frontend/src/components/tw-blocks/providers/ReactQueryClientProvider.tsx` | Wraps tw-blocks components with QueryClient |

**Mutation Details** (all follow: tx → sign → send → invalidateQueries pattern):
- `deployEscrowMutation` - Initialize escrow on-chain
- `updateEscrowMutation` - Modify escrow parameters
- `fundEscrowMutation` - Send funds into escrow
- `approveMilestoneMutation` - Approve milestone
- `changeMilestoneStatusMutation` - Update milestone
- `startDisputeMutation` - Initiate dispute
- `releaseFundsMutation` - Release from escrow
- `resolveDisputeMutation` - Settle dispute

**Used By**:
- `WalletEscrowDashboard.tsx` - Primary dashboard (queries by signer)
- `EscrowOverviewCard.tsx` - Card view
- All tw-blocks escrow form/dialog/button components (mutations)

---

## Data Source Separation (NOT OVERLAP)

### Hasura Backend (`escrow_transactions` table)
- **What it stores**: App-side escrow transaction metadata
  - `id`, `contract_id`, `created_at`, `status`, `transaction_hash`, `amount`
  - Associated `escrow_transaction_users` with `funding_status`, `funded_at`
- **Lifecycle**: Created/updated by app business logic
- **Audience**: Mostly admin/visibility purposes (EscrowList, ActivityFeed, real-time status watching)

### Trustless Work Blockchain Indexer
- **What it stores**: On-chain escrow contract state
  - Roles (approver, marker/serviceProvider, releaser/releaseSigner)
  - Milestone statuses, balances, dispute states
  - Full blockchain escrow lifecycle
- **Lifecycle**: Driven by on-chain transaction execution
- **Audience**: Operational interfaces (WalletEscrowDashboard, form-based operations)

---

## Consistency Analysis

### Current Risk Points

1. **Independent Cache Invalidation**  
   - TanStack mutations invalidate `["escrows"]` queryKey (all role/signer queries)
   - Apollo subscriptions update independently when Hasura changes
   - **Risk**: After a blockchain mutation (e.g., fund), TanStack cache updates, but if Hasura isn't synchronized, Apollo cache stays stale
   - **Severity**: **MEDIUM** — only affects components mixing both stacks

2. **No Cross-Stack Coordination**  
   - When `deployEscrowMutation` succeeds on-chain, it invalidates TanStack cache but doesn't notify Apollo
   - When Hasura subscription fires, TanStack Query doesn't know about it
   - **Risk**: A component reading from Apollo might show outdated state while TanStack shows current
   - **Severity**: **LOW** — components are currently segregated (one or the other, rarely both)

3. **Stale Time Mismatch**  
   - Apollo: Subscriptions (real-time) for `ESCROW_STATUS_SUBSCRIPTION`
   - TanStack: 5-minute stale time + manual invalidation
   - **Risk**: TanStack data can lag if invalidation fails
   - **Severity**: **LOW** — acceptable for blockchain UX

---

## Component Responsibility Mapping

### ✅ Pure Apollo Consumers (Safe — No Overlap)
```
EscrowList.tsx
  └─ GET_ESCROW_TRANSACTIONS (Hasura)
  
ActivityFeed.tsx
  └─ USER_ESCROW_ACTIVITY_SUBSCRIPTION (Hasura)
  
RealTimeEscrowStatus.tsx
  └─ useEscrowSubscription → ESCROW_STATUS_SUBSCRIPTION (Hasura)
  
CacheWarmer.tsx
  └─ GET_ESCROW_TRANSACTIONS (Hasura) [pre-fetch only]
```

### ✅ Pure TanStack Consumers (Safe — No Overlap)
```
WalletEscrowDashboard.tsx
  └─ useEscrowsBySignerQuery (Indexer)
  └─ [Potential child mutations via useEscrowsMutations]

EscrowOverviewCard.tsx
  └─ useEscrowsBySignerQuery (Indexer)

tw-blocks escrow components (all)
  └─ useEscrowsByRoleQuery / useEscrowsBySignerQuery (Indexer)
  └─ useEscrowsMutations (Indexer) [on-chain operations]
```

### ⚠️ Mixed Stack Consumers (REVIEW REQUIRED)
*None currently detected, but check:*
- `EscrowNotesPanel.tsx` - May read Apollo state but needs confirmation
- `stubEscrow.ts` - Test stub; verify it doesn't bridge stacks

---

## Recommendations

### **Option 1: Document the Split as Intentional (Recommended)**
**Rationale**: The separation is architecture correct—Hasura is app metadata, blockchain indexer is source-of-truth state.

**Actions**:
1. ✅ Add explicit comment in both provider/hook files:
   ```tsx
   // Apollo = Hasura app backend escrow metadata (secondary)
   // TanStack Query = Trustless Work Indexer escrow state (authoritative)
   // Components MUST NOT mix both for the same escrow entity
   ```

2. ✅ Create a decision document (this file) and link from [README.md](./README.md) under "Data Fetching Architecture"

3. ✅ Add lint rule / code review checklist:
   - Flag any component importing both `useEscrowSubscription` AND `useEscrowsByRoleQuery`
   - Document which components are "Hasura-side" vs "Blockchain-side"

4. ✅ Rename or organize to make separation obvious:
   - Option A: Move Apollo escrow queries to `src/graphql/hasura/` folder
   - Option B: Rename `useEscrowSubscription.ts` → `useEscrowTransactionSubscription.ts` (emphasize it's metadata)
   - Option C: Add comments to [ReactQueryClientProvider.tsx](./apps/frontend/src/components/tw-blocks/providers/ReactQueryClientProvider.tsx) clarifying scope

### **Option 2: Converge on TanStack Query (Alternative)**
**Rationale**: If blockchain state is authoritative, app shouldn't maintain separate Hasura escrow table.

**Actions** (if chosen):
1. Replace Apollo escrow queries with TanStack equivalents everywhere
2. Remove Apollo escrow subscriptions; use TanStack polling or webhooks for real-time
3. Deprecate Hasura `escrow_transactions` table (or reduce to logging only)
4. Delete: `escrow-queries.ts`, `escrow-subscriptions.ts`, `useEscrowSubscription.ts`

**Trade-off**: Requires Trustless Work Indexer to have all metadata (notes, app-side status, etc.)

### **Option 3: Converge on Apollo (Alternative)**
**Rationale**: App controls escrow lifecycle; blockchain is just execution layer.

**Actions** (if chosen):
1. Replace TanStack queries with Apollo queries from Hasura
2. Have Hasura subscribe to blockchain events (via webhook or polling) and sync
3. All mutations go through Hasura → smart contract pipeline
4. Delete: all tw-blocks tanstack files

**Trade-off**: Adds complexity to Hasura sync logic; may lag blockchain state.

---

## Acceptance Criteria

✅ **Responsibility is explicit and enforced**:
- [ ] This document is linked from project README / architecture guide
- [ ] Each component file has a clear comment on which stack it uses and why
- [ ] Code review checklist includes: "No component mixes Apollo escrow + TanStack escrow queries"

✅ **No silent cache conflicts**:
- [ ] Mutations in TanStack invalidate `["escrows"]` (already done ✓)
- [ ] If Hasura is updated externally, Apollo subscription fires (existing behavior ✓)
- [ ] Document that these caches are *expected* to diverge until Hasura sync completes

✅ **Team alignment**:
- [ ] #207 (notification reconciliation) follows same pattern if applicable
- [ ] Architect / tech lead review and sign off on chosen option

---

## Next Steps

1. **Decision**: Team chooses Option 1 (document), 2 (TanStack), or 3 (Apollo)
2. **If Option 1**: Create brief architecture doc, add comments to files, set up lint rule
3. **If Option 2 or 3**: Plan phased deprecation of one stack
4. **Testing**: Add integration test verifying no component imports both stacks' escrow hooks

---

## Related Issues
- #207: Reconcile polling-based notification checks with GraphQL subscriptions (similar pattern)
