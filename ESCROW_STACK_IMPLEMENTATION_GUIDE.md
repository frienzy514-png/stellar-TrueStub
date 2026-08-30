# Escrow Data-Fetching Stack: Implementation Guide

**Approach**: Document and enforce the intentional separation between Apollo (Hasura metadata) and TanStack Query (blockchain state).

---

## Phase 1: Add Clarity Comments (15 minutes)

### 1. Apollo Escrow Query Layer
**File**: `apps/frontend/src/graphql/queries/escrow-queries.ts`

Add at top:
```typescript
/**
 * Hasura Escrow Metadata Queries
 *
 * Purpose: Query app-managed escrow transaction metadata from Hasura backend.
 * This is secondary/supporting data — the authoritative escrow state lives on-chain
 * and is indexed by Trustless Work Indexer.
 *
 * Use this for:
 * - Admin visibility into all escrow_transactions table records
 * - App-side funding status tracking
 * - Activity feeds and audit logs
 *
 * DO NOT use this for:
 * - Operational escrow workflows (use useEscrowsByRoleQuery or useEscrowsBySignerQuery instead)
 * - On-chain state queries (use TanStack Query helpers instead)
 * - Mutations (escrow mutations are on-chain; see useEscrowsMutations)
 *
 * Cache: Apollo InMemoryCache (subscriptions provide real-time updates)
 * Related: apps/frontend/src/graphql/subscriptions/escrow-subscriptions.ts
 */
```

### 2. Apollo Subscriptions
**File**: `apps/frontend/src/graphql/subscriptions/escrow-subscriptions.ts`

Add at top:
```typescript
/**
 * Hasura Escrow Subscriptions
 *
 * Live updates to escrow_transactions table state.
 * Use these to react to app-side changes (funding status, transaction record creation, etc).
 *
 * Subscriptions:
 * - ESCROW_STATUS_SUBSCRIPTION: Watch a single escrow transaction's status
 * - USER_ESCROW_ACTIVITY_SUBSCRIPTION: Watch all activity for a user's escrow records
 *
 * Cache: Apollo InMemoryCache (auto-updated by subscription)
 *
 * Note: On-chain escrow state is NOT guaranteed to be in sync with these records.
 * If on-chain state is needed, use TanStack Query helpers (useEscrowsByRoleQuery, etc).
 */
```

### 3. TanStack Query Providers
**File**: `apps/frontend/src/components/tw-blocks/providers/ReactQueryClientProvider.tsx`

Add comment before `export function ReactQueryClientProvider`:
```typescript
/**
 * TanStack Query Provider for Trustless Work Escrows
 *
 * Scope: All on-chain escrow queries, mutations, and caching.
 * Data Source: Trustless Work Indexer API (authoritative blockchain state).
 *
 * This provider should wrap ONLY tw-blocks components that interact with
 * on-chain escrows (queries, mutations, signer operations).
 *
 * Purpose:
 * - Manage queries to Trustless Work Indexer (roles, signers, status, balances)
 * - Handle blockchain mutations (deploy, fund, approve, dispute, release)
 * - Cache and invalidate escrow state (5-min stale time, manual invalidation on success)
 *
 * DO NOT mix with Apollo escrow queries — they're separate data sources.
 * Components should use EITHER Apollo (metadata) OR TanStack Query (on-chain), never both.
 *
 * Example: WalletEscrowDashboard uses only TanStack Query.
 */
```

### 4. useEscrowSubscription Hook
**File**: `apps/frontend/src/hooks/useEscrowSubscription.ts`

Add comment at top:
```typescript
/**
 * Hook: Subscribe to a single escrow_transaction from Hasura
 *
 * Data Source: Hasura escrow_transactions table (app-side metadata)
 *
 * Use this for:
 * - Showing live updates to escrow status (for admin/monitoring)
 * - Reacting to funding_status changes
 * - Toast notifications on escrow updates
 *
 * DO NOT use this for:
 * - Operational workflow checks (use useEscrowsByRoleQuery instead)
 * - On-chain state validation (use Trustless Work Indexer queries)
 *
 * Related: apps/frontend/src/graphql/subscriptions/escrow-subscriptions.ts
 */
```

### 5. TanStack Query Hooks
**File**: `apps/frontend/src/components/tw-blocks/tanstack/useEscrowsByRoleQuery.ts`

Add comment at top:
```typescript
/**
 * Query: Fetch escrows for a specific role from Trustless Work Indexer
 *
 * Data Source: Trustless Work Indexer API (on-chain escrow state)
 *
 * Parameters:
 * - role: 'approver' | 'marker' | 'releaser'
 * - roleAddress: Wallet address of the user
 * - isActive: Filter to active escrows only
 * - Filtering: title, engagementId, status, type, amount range, dates, etc.
 *
 * Caching:
 * - Stale time: 5 minutes
 * - Invalidation: Manual via mutation.onSuccess() → queryClient.invalidateQueries(['escrows'])
 *
 * DO NOT use this for:
 * - App metadata queries (use Apollo GET_ESCROW_TRANSACTIONS instead)
 * - Hasura records (different data source entirely)
 *
 * Use this for:
 * - Operational dashboards (WalletEscrowDashboard, role-based views)
 * - Workflow decisions (show buttons only if user is approver, etc.)
 * - Displaying on-chain state
 */
```

**File**: `apps/frontend/src/components/tw-blocks/tanstack/useEscrowsBySignerQuery.ts`

Add comment at top:
```typescript
/**
 * Query: Fetch all escrows for a wallet signer from Trustless Work Indexer
 *
 * Data Source: Trustless Work Indexer API (on-chain escrow state)
 *
 * Similar to useEscrowsByRoleQuery but returns all roles for a given signer.
 *
 * Caching:
 * - Stale time: 5 minutes
 * - Invalidation: Manual via mutation.onSuccess()
 *
 * Usage: WalletEscrowDashboard calls this to fetch all signer's escrows,
 * then filters by role in-memory.
 */
```

**File**: `apps/frontend/src/components/tw-blocks/tanstack/useEscrowsMutations.ts`

Add comment at top:
```typescript
/**
 * Mutations: On-chain escrow operations via Trustless Work API
 *
 * Data Source: Trustless Work blockchain (on-chain state)
 *
 * Operations:
 * 1. deployEscrowMutation - Create new escrow contract
 * 2. updateEscrowMutation - Modify escrow parameters
 * 3. fundEscrowMutation - Send funds into escrow
 * 4. approveMilestoneMutation - Approver marks milestone done
 * 5. changeMilestoneStatusMutation - Change milestone state
 * 6. startDisputeMutation - Initiate dispute
 * 7. releaseFundsMutation - Release funds from escrow
 * 8. resolveDisputeMutation - Settle dispute
 *
 * Pattern (all mutations):
 * 1. Construct unsigned transaction
 * 2. Sign with user's wallet
 * 3. Send signed tx to blockchain
 * 4. On success: invalidateQueries(['escrows']) — refresh TanStack cache
 *
 * DO NOT use Apollo mutations for on-chain operations.
 * Apollo escrow mutations (if any) are for app metadata only.
 */
```

---

## Phase 2: Component Responsibility Matrix (5 minutes)

Create a reference file:
**File**: `apps/frontend/src/components/ESCROW_COMPONENT_STACK_MATRIX.md`

```markdown
# Escrow Data Stack by Component

## Apollo (Hasura) Only ✅
| Component | Path | Primary Query | Purpose |
|-----------|------|---------------|---------|
| EscrowList | `components/EscrowList.tsx` | GET_ESCROW_TRANSACTIONS | List all escrow_transactions |
| ActivityFeed | `components/notifications/ActivityFeed.tsx` | USER_ESCROW_ACTIVITY_SUBSCRIPTION | Show escrow activity log |
| RealTimeEscrowStatus | `components/escrow/RealTimeEscrowStatus.tsx` | ESCROW_STATUS_SUBSCRIPTION | Live status badge |
| CacheWarmer | `components/performance/CacheWarmer.tsx` | GET_ESCROW_TRANSACTIONS | Pre-fetch on app load |

## TanStack Query (Blockchain Indexer) Only ✅
| Component | Path | Primary Query | Purpose |
|-----------|------|---------------|---------|
| WalletEscrowDashboard | `components/escrow/WalletEscrowDashboard.tsx` | useEscrowsBySignerQuery | Main user dashboard |
| EscrowOverviewCard | `components/escrow/EscrowOverviewCard.tsx` | useEscrowsBySignerQuery | Card summary view |
| InitializeEscrow | `tw-blocks/escrows/*/initialize-escrow/` | useEscrowsMutations | Deploy on-chain |
| FundEscrow | `tw-blocks/escrows/*/fund-escrow/` | useEscrowsMutations | Send funds |
| ApproveMilestone | `tw-blocks/escrows/*/approve-milestone/` | useEscrowsMutations | Approver action |
| ChangeMilestoneStatus | `tw-blocks/escrows/*/change-milestone-status/` | useEscrowsMutations | Milestone update |
| StartDispute | `tw-blocks/escrows/*/start-dispute/` | useEscrowsMutations | Escalate |
| ReleaseFunds | `tw-blocks/escrows/*/release-funds/` | useEscrowsMutations | Complete escrow |
| ResolveDispute | `tw-blocks/escrows/*/resolve-dispute/` | useEscrowsMutations | Settle dispute |

## ⚠️ Requires Review (Potential Mixed Stack)
| Component | Path | Note |
|-----------|------|------|
| EscrowNotesPanel | `components/escrow/EscrowNotesPanel.tsx` | Verify it doesn't read both Apollo + TanStack |
| stubEscrow.ts | `components/escrow/views/stubEscrow.ts` | Test stub; verify no cross-stack usage |

**Rule**: Each component uses ONE stack, never both.
If you need to display data from both sources, create a wrapper component that bridges them transparently.
```

---

## Phase 3: Code Review Checklist (Add to PR Template)

**File**: `.github/pull_request_template.md` (add to Escrow Data section)

```markdown
## Escrow Data Stack Checklist
- [ ] If using Apollo escrow queries, NOT using TanStack escrow queries in same component
- [ ] If using TanStack escrow queries/mutations, NOT using Apollo escrow queries
- [ ] Comment in PR explains which stack is used and why
- [ ] If component touches escrow state, data source is clear from imports
```

---

## Phase 4: Enforce via TypeScript/Lint (Optional but Recommended)

**Option A: ESLint Rule (if tooling allows)**

Create a rule file to flag components importing both:
```typescript
// .eslintrc.d.ts or custom rule file
// Flag any file that imports BOTH:
// - useEscrowSubscription (Apollo)
// - useEscrowsByRoleQuery or useEscrowsBySignerQuery (TanStack)
```

**Option B: Manual CI Check (bash script)**

```bash
#!/bin/bash
# Check no component imports both stacks

if grep -l "useEscrowSubscription" apps/frontend/src/components/**/*.tsx | \
   xargs grep -l "useEscrowsByRoleQuery\|useEscrowsBySignerQuery"; then
  echo "ERROR: Found component mixing Apollo and TanStack escrow queries"
  exit 1
fi
```

---

## Phase 5: Documentation (Link from README)

**Update**: `apps/frontend/README.md` or `apps/frontend/docs/ARCHITECTURE.md`

Add section:
```markdown
## Data Fetching Architecture

### Escrow Data Stack Separation

We maintain **two independent escrow data stacks** for different purposes:

1. **Apollo Client + GraphQL** (Hasura)
   - Purpose: App-side escrow metadata and activity
   - Use in: Admin dashboards, activity feeds, status subscriptions
   - Cache: Apollo InMemoryCache
   - Files: `src/graphql/queries/escrow-queries.ts`, `src/graphql/subscriptions/escrow-subscriptions.ts`

2. **TanStack Query** (Trustless Work Indexer)
   - Purpose: On-chain escrow state and operations
   - Use in: User operational workflows, fund transfers, dispute resolution
   - Cache: TanStack Query QueryClient
   - Files: `src/components/tw-blocks/tanstack/useEscrows*.ts`

**Rule**: Components use ONE stack, never both. See [ESCROW_COMPONENT_STACK_MATRIX.md](../src/components/ESCROW_COMPONENT_STACK_MATRIX.md).

**Why separate?**
- Hasura tracks app-side metadata (who funded, when, status)
- Blockchain Indexer tracks on-chain state (roles, balances, disputes)
- They diverge: on-chain state is source-of-truth; Hasura records when app becomes aware

For details, see [ESCROW_DATA_FETCHING_RECONCILIATION.md](../../ESCROW_DATA_FETCHING_RECONCILIATION.md).
```

---

## Implementation Checklist

- [ ] **Phase 1 Complete**: Comments added to all 5 files above
- [ ] **Phase 2 Complete**: ESCROW_COMPONENT_STACK_MATRIX.md created and reviewed
- [ ] **Phase 3 Complete**: PR template updated with data stack checklist
- [ ] **Phase 4 Complete** (optional): Lint rule or CI check in place
- [ ] **Phase 5 Complete**: README/Architecture docs updated with escrow stack section
- [ ] **Verification**: Run through component list in Phase 2; confirm no file imports both stacks
- [ ] **Team Alignment**: Architect/tech lead reviews and approves

---

## Estimated Effort

- **Phase 1** (Comments): 15 minutes
- **Phase 2** (Matrix): 5 minutes
- **Phase 3** (PR Template): 5 minutes
- **Phase 4** (Lint/CI): 30 minutes (optional; skip if team prefers manual review)
- **Phase 5** (Docs): 10 minutes

**Total: ~65 minutes** (or ~35 if skipping optional Phase 4)

---

## What This Solves

✅ **Clarity**: Every developer knows which stack to use for which data  
✅ **Consistency**: No accidental double-fetching or cache conflicts  
✅ **Maintainability**: Future changes to one stack won't accidentally break another  
✅ **Reviews**: PR checklist prevents accidental stack mixing  
✅ **Accountability**: Clear responsibility for each component's data source

---

## Future: If Moving to Single Stack

If the team later decides to converge on one stack:
1. All comments added here will guide the deprecation path
2. The component matrix makes it easy to identify what needs changing
3. The PR checklist will help catch any mixed-stack code

See [ESCROW_DATA_FETCHING_RECONCILIATION.md](../../ESCROW_DATA_FETCHING_RECONCILIATION.md) for details on convergence strategies.
