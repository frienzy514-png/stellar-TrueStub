# Escrow Data Stack: Quick Reference Guide

**TL;DR**: Choose ONE stack per component. Apollo for app metadata, TanStack for on-chain operations.

---

## Which Stack Should I Use?

```
Am I querying escrow data?
│
├─ YES: Do I need on-chain state (roles, balances, dispute status)?
│  ├─ YES → Use TanStack Query (useEscrowsByRoleQuery / useEscrowsBySignerQuery)
│  └─ NO  → Use Apollo (GET_ESCROW_TRANSACTIONS)
│
└─ NO: Am I performing an on-chain operation (fund, approve, release)?
   └─ YES → Use TanStack Query (useEscrowsMutations)
```

---

## Decision Matrix

| I need to... | Stack | Hook/Query | File |
|---|---|---|---|
| Show all escrow_transactions records | Apollo | `GET_ESCROW_TRANSACTIONS` | `graphql/queries/escrow-queries.ts` |
| Watch real-time updates to one escrow's status | Apollo | `ESCROW_STATUS_SUBSCRIPTION` | `graphql/subscriptions/escrow-subscriptions.ts` |
| Show user's activity on escrows | Apollo | `USER_ESCROW_ACTIVITY_SUBSCRIPTION` | `graphql/subscriptions/escrow-subscriptions.ts` |
| Get escrows where user is approver/marker/releaser | TanStack | `useEscrowsByRoleQuery` | `tw-blocks/tanstack/useEscrowsByRoleQuery.ts` |
| Get all escrows for a wallet signer | TanStack | `useEscrowsBySignerQuery` | `tw-blocks/tanstack/useEscrowsBySignerQuery.ts` |
| Deploy an escrow on-chain | TanStack | `useEscrowsMutations` → `deployEscrow` | `tw-blocks/tanstack/useEscrowsMutations.ts` |
| Fund an escrow | TanStack | `useEscrowsMutations` → `fundEscrow` | `tw-blocks/tanstack/useEscrowsMutations.ts` |
| Approve a milestone | TanStack | `useEscrowsMutations` → `approveMilestone` | `tw-blocks/tanstack/useEscrowsMutations.ts` |
| Change milestone status | TanStack | `useEscrowsMutations` → `changeMilestoneStatus` | `tw-blocks/tanstack/useEscrowsMutations.ts` |
| Start a dispute | TanStack | `useEscrowsMutations` → `startDispute` | `tw-blocks/tanstack/useEscrowsMutations.ts` |
| Release funds | TanStack | `useEscrowsMutations` → `releaseFunds` | `tw-blocks/tanstack/useEscrowsMutations.ts` |
| Resolve a dispute | TanStack | `useEscrowsMutations` → `resolveDispute` | `tw-blocks/tanstack/useEscrowsMutations.ts` |

---

## Quick Examples

### ✅ Correct: TanStack for user dashboard
```tsx
import { useEscrowsBySignerQuery } from '@/components/tw-blocks/tanstack/useEscrowsBySignerQuery';

export function WalletEscrowDashboard({ walletAddress }: Props) {
  const { data: escrows } = useEscrowsBySignerQuery({ signer: walletAddress });
  return <>{/* display escrows */}</>;
}
```

### ✅ Correct: Apollo for activity feed
```tsx
import { useSubscription } from '@apollo/client/react';
import { USER_ESCROW_ACTIVITY_SUBSCRIPTION } from '@/graphql/subscriptions/escrow-subscriptions';

export function ActivityFeed({ userId }: Props) {
  const { data } = useSubscription(USER_ESCROW_ACTIVITY_SUBSCRIPTION, {
    variables: { userId }
  });
  return <>{/* show activity */}</>;
}
```

### ✅ Correct: TanStack for operations
```tsx
import { useEscrowsMutations } from '@/components/tw-blocks/tanstack/useEscrowsMutations';

export function FundEscrowButton({ escrowId, amount }: Props) {
  const { fundEscrow } = useEscrowsMutations();
  
  const handleFund = async () => {
    await fundEscrow.mutateAsync({ payload: {...}, type: 'single', address: userWallet });
  };
  
  return <button onClick={handleFund}>Fund Escrow</button>;
}
```

### ❌ Wrong: Mixing stacks in same component
```tsx
// DON'T DO THIS
import { useQuery } from '@apollo/client';
import { useEscrowsBySignerQuery } from '@/components/tw-blocks/tanstack/useEscrowsBySignerQuery';
import { GET_ESCROW_TRANSACTIONS } from '@/graphql/queries/escrow-queries';

export function MixedComponent() {
  const apolloEscrows = useQuery(GET_ESCROW_TRANSACTIONS); // ❌ WRONG
  const tanstackEscrows = useEscrowsBySignerQuery({ signer }); // ❌ WRONG
  // These are different data sources! Don't mix them.
}
```

---

## Common Scenarios

### "I need to show escrows in a dashboard"
→ **Use TanStack** (`useEscrowsBySignerQuery` or `useEscrowsByRoleQuery`)

### "I need to show admin activity log of all escrows"
→ **Use Apollo** (`GET_ESCROW_TRANSACTIONS` or subscriptions)

### "I need to update escrow state (fund, approve, etc.)"
→ **Use TanStack** (`useEscrowsMutations`)

### "I need real-time notification when escrow updates"
→ **Use Apollo** (subscription) for app metadata
→ **Use TanStack invalidation** (on-chain mutation success)

### "I need to know if user can perform an action"
→ **Use TanStack** (query by role/signer to check permissions)

### "I need app-side audit trail"
→ **Use Apollo** (`escrow_transactions` table tracks all records)

---

## Cache Invalidation Patterns

### TanStack Query
```tsx
const { useEscrowsMutations } = useEscrowsMutations();

// All mutations auto-invalidate ["escrows"] on success
const { fundEscrow } = useEscrowsMutations();
fundEscrow.mutateAsync(...)
  // On success: queryClient.invalidateQueries({ queryKey: ["escrows"] })
  // All useEscrowsByRoleQuery and useEscrowsBySignerQuery re-fetch
```

### Apollo Client
```tsx
// Subscriptions auto-update cache
const { data } = useSubscription(ESCROW_STATUS_SUBSCRIPTION, {
  variables: { escrowId }
  // Cache updates automatically on subscription push
});
```

---

## Stack Origins

**Apollo/GraphQL Stack** (`apps/frontend/src/graphql/`)
- **Endpoint**: GraphQL backend (Hasura)
- **Data**: `escrow_transactions` table (app-managed metadata)
- **Scope**: Admin views, activity feeds, metadata queries

**TanStack Query Stack** (`apps/frontend/src/components/tw-blocks/tanstack/`)
- **Endpoint**: Trustless Work Indexer API
- **Data**: Blockchain-indexed escrow contracts (on-chain state)
- **Scope**: User workflows, fund operations, on-chain actions

---

## Files to Know

### Apollo Layer
- Queries: `src/graphql/queries/escrow-queries.ts`
- Subscriptions: `src/graphql/subscriptions/escrow-subscriptions.ts`
- Mutations: `src/graphql/mutations/escrow.ts`
- Hook: `src/hooks/useEscrowSubscription.ts`

### TanStack Layer
- Queries: `src/components/tw-blocks/tanstack/useEscrowsByRoleQuery.ts`
- Queries: `src/components/tw-blocks/tanstack/useEscrowsBySignerQuery.ts`
- Mutations: `src/components/tw-blocks/tanstack/useEscrowsMutations.ts`
- Provider: `src/components/tw-blocks/providers/ReactQueryClientProvider.tsx`

### Reference
- Component Matrix: `src/components/ESCROW_COMPONENT_STACK_MATRIX.md`
- Full Analysis: `ESCROW_DATA_FETCHING_RECONCILIATION.md`
- Implementation Guide: `ESCROW_STACK_IMPLEMENTATION_GUIDE.md`

---

## Rule of Thumb

**One stack per component. If you need to display data from both, create a bridge component that uses only one stack and passes data down.**

Example:
```tsx
// ✅ Correct: Bridge component uses TanStack, passes to child
function EscrowContainer({ signer }: Props) {
  const { data } = useEscrowsBySignerQuery({ signer });
  return <EscrowList escrows={data} />; // Props only, no hooks
}

// ✅ EscrowList component (if needed) can use Apollo for metadata
function EscrowList({ escrows }) {
  // ... display only, use Apollo for additional metadata if needed
}
```

---

## When to Use Each

| Question | Use Apollo | Use TanStack |
|---|:---:|:---:|
| "What does the app think the escrow status is?" | ✓ | |
| "What is the actual on-chain escrow state?" | | ✓ |
| "What has happened to this escrow?" | ✓ | |
| "Can this user perform this action?" | | ✓ |
| "When was this escrow created in our system?" | ✓ | |
| "When was this escrow deployed on-chain?" | | ✓ |

---

## Troubleshooting

**"Why are my escrows showing stale data?"**
- If using TanStack: Might be stale (5-min cache). Call `refetch()` or trigger mutation to invalidate.
- If using Apollo: Check that subscription is connected (check Apollo DevTools).

**"I deployed an escrow but TanStack query still shows old data"**
- Mutations invalidate `["escrows"]` on success. If still stale, call `refetch()` manually.

**"I see the escrow in Apollo but not in TanStack"**
- Apollo = app metadata (created when app processes it)
- TanStack = blockchain state (created when on-chain)
- Wait for Indexer to catch up, or check blockchain explorer directly.

**"I'm not sure which stack to use"**
- Ask: "Is this blockchain state or app metadata?"
- Blockchain → TanStack
- Metadata → Apollo

---

## Code Review Checklist

When reviewing a PR that touches escrow data:

- [ ] Component uses only ONE escrow stack (Apollo OR TanStack, not both)
- [ ] Imports are from correct files (see Files to Know section)
- [ ] If querying: Data source matches the query (is it blockchain or metadata?)
- [ ] If mutating: Using TanStack mutations, not Apollo mutations
- [ ] Comment in code explains which stack and why

---

**Still have questions?** See [ESCROW_DATA_FETCHING_RECONCILIATION.md](./ESCROW_DATA_FETCHING_RECONCILIATION.md) for full details.
