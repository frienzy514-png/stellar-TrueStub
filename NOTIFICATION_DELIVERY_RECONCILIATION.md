# Notification Delivery: Polling vs GraphQL Subscription Reconciliation

**Issue #207**: Two independent notification mechanisms — REST polling (`/notifications/test/*` endpoints) and GraphQL subscriptions — risk inconsistency. Only one should own notification delivery.

**Status**: 🔴 **ACTIVE CONFLICT** — Polling is currently used; subscription is defined but unused. Polling should be replaced with subscription as intended.

---

## Current State Analysis

### Mechanism 1: REST Polling (Currently Active ❌)
**Status**: In use in production code  
**Scope**: Specific to escrow notifications only  
**Characteristics**: Inefficient, scalable, high server load

| Artifact | Path | Purpose |
|----------|------|---------|
| **Functions** | `apps/frontend/src/core/config/axios/notifications.ts` | 3 polling functions |
| **Function 1** | `checkPendingNotifications(escrowId)` | GET `/notifications/test/check-pending` |
| **Function 2** | `checkMilestoneUpdates(escrowId)` | GET `/notifications/test/check-milestone-updates` |
| **Function 3** | `checkDisputeNotifications(escrowId)` | GET `/notifications/test/check-dispute-notifications` |
| **Tests** | `apps/frontend/src/core/config/axios/notifications.test.ts` | Unit tests for polling functions |
| **Hook** | `apps/frontend/src/components/escrow/hook/useEscrowUpdates.ts` | Calls polling functions every 15s |

**Used By**:
- `useEscrowUpdates` hook — polls escrowId every 15 seconds
- `RoleEscrowDashboard.tsx` — has placeholder stubs for notification checks

**Problems**:
- ❌ Inefficient: Makes 3 HTTP requests every 15 seconds per active escrow
- ❌ Scalable: With many users, creates O(n) traffic on notification endpoint
- ❌ Latency: 15-second polling delay; user sees updates only every 15s
- ❌ `/test/` endpoints suggest temporary scaffolding ("test" path)
- ❌ Hardcoded escrow-specific logic; won't scale to other notification types

---

### Mechanism 2: GraphQL Subscription (Defined but Unused ✅)
**Status**: Defined; never consumed  
**Scope**: General user notifications  
**Characteristics**: Efficient, real-time, low server load

| Artifact | Path | Purpose |
|----------|------|---------|
| **Subscription** | `apps/frontend/src/graphql/subscriptions/notification-subscriptions.ts` | `USER_NOTIFICATIONS_SUBSCRIPTION` |

**Subscription Details**:
```graphql
subscription UserNotifications($userId: uuid!) {
  notifications(
    where: { user_id: { _eq: $userId } }
    order_by: { created_at: desc }
    limit: 20
  ) {
    id
    type
    title
    message
    read
    created_at
  }
}
```

**Never Used By**: *(No imports found in codebase)*

**Advantages** (if used):
- ✅ Real-time: Push updates instantly when available
- ✅ Efficient: Single persistent connection; no polling overhead
- ✅ Scalable: O(1) server cost per user (regardless of notification count)
- ✅ Generic: Works for any notification type, not escrow-specific
- ✅ User-centric: Subscribed by `userId`, not `escrowId`

---

## Root Cause

**Timeline**:
1. Polling functions were scaffolded quickly to unblock escrow monitoring
2. Endpoints got `/test/` prefix (indicating temporary)
3. GraphQL subscription was designed but never integrated
4. Polling became de facto standard; subscription was abandoned mid-development

**Why subscription wasn't used**:
- Likely blocked on backend subscription support
- OR polling was "good enough" for MVP
- OR team prioritized other work

---

## Impact Assessment

### For Users
| Aspect | Polling | Subscription |
|--------|---------|--------------|
| **Latency** | 0-15 seconds | Real-time |
| **Reliability** | Good (simple REST) | Good (WebSocket) |
| **Responsiveness** | Poor (15s delay) | Excellent (instant) |
| **Battery drain** | High (polling) | Low (push) |

### For Server
| Aspect | Polling | Subscription |
|--------|---------|--------------|
| **Requests** | 3 per user per 15s | 1 connection setup + 0 per event |
| **Scalability** | O(n) w/ user count | O(1) amortized |
| **Load at 1000 users** | 200 req/sec | ~0.5 req/sec |

### For Code Maintenance
| Aspect | Polling | Subscription |
|--------|---------|--------------|
| **Scope** | Escrow-specific only | Generic (all notification types) |
| **Test Coverage** | High (has unit tests) | None (unused) |
| **Lines of Code** | ~35 lines + hooks | ~20 lines |
| **Type Safety** | Loose (REST) | Strong (GraphQL) |

---

## Component Usage Map

### Active Polling Usage
```
useEscrowUpdates (hook)
  └─ checkPendingNotifications()
  └─ checkMilestoneUpdates()
  └─ checkDisputeNotifications()
  └─ Polls every 15 seconds
  
RoleEscrowDashboard (component)
  └─ Has placeholder notification functions
  └─ No actual notifications implemented
```

### Unused Subscription
```
USER_NOTIFICATIONS_SUBSCRIPTION (GraphQL)
  └─ No imports anywhere in codebase
  └─ Ready to use but never called
```

---

## Recommended Action: Replace Polling with Subscription

**Decision**: Deprecate REST polling; switch to GraphQL subscription for real-time, efficient notification delivery.

### Phase 1: Create Subscription Hook (30 min)

**File**: `apps/frontend/src/hooks/useUserNotifications.ts` (new)

```typescript
import { useSubscription } from "@apollo/client/react";
import { USER_NOTIFICATIONS_SUBSCRIPTION } from "@/graphql/subscriptions/notification-subscriptions";

interface UseUserNotificationsProps {
  userId: string;
  skip?: boolean;
}

export const useUserNotifications = ({ userId, skip = false }: UseUserNotificationsProps) => {
  const { data, loading, error } = useSubscription(USER_NOTIFICATIONS_SUBSCRIPTION, {
    variables: { userId },
    skip: skip || !userId,
  });

  return {
    notifications: data?.notifications ?? [],
    loading,
    error,
  };
};
```

### Phase 2: Migrate useEscrowUpdates (30 min)

**Replace polling with derived logic**:

```typescript
import { useUserNotifications } from "@/hooks/useUserNotifications";

export const useEscrowUpdates = (escrowId: string, userId: string) => {
  const { notifications } = useUserNotifications({ userId });
  
  const status = useMemo(() => {
    // Filter notifications for this escrow
    const escrowNotifications = notifications.filter(n => n.escrowId === escrowId);
    
    if (escrowNotifications.some(n => n.type === "pending")) return "pending_action";
    if (escrowNotifications.some(n => n.type === "milestone" && n.message.includes("approved"))) return "milestone_approved";
    if (escrowNotifications.some(n => n.type === "dispute")) return "disputed";
    
    return "milestone_approved";
  }, [notifications, escrowId]);
  
  return { status };
};
```

**Benefits**:
- Eliminates polling interval
- Real-time updates via GraphQL subscription
- Single connection for all notifications (not per-escrow)
- Automatically scales to other notification types

### Phase 3: Remove Polling Functions (10 min)

Once migration complete:
1. Delete `apps/frontend/src/core/config/axios/notifications.ts`
2. Delete `apps/frontend/src/core/config/axios/notifications.test.ts`
3. Delete `useEscrowUpdates` or rewrite to use subscription
4. Remove any references to polling functions

### Phase 4: Verify Backend Supports Subscription (5 min)

Confirm:
- [ ] Hasura `notifications` table exists
- [ ] Subscriptions are enabled for `notifications` query
- [ ] Backend can push updates in real-time
- [ ] WebSocket/subscription infrastructure is ready

### Phase 5: Test & Deploy (20 min)

- [ ] Manually test real-time notifications
- [ ] Verify no HTTP `/test/` requests in network tab
- [ ] Monitor backend load for improvement
- [ ] Update PR checklist to flag any new polling functions

---

## Migration Checklist

- [ ] **Phase 1**: `useUserNotifications` hook created & tested
- [ ] **Phase 2**: `useEscrowUpdates` refactored to use subscription
- [ ] **Phase 3**: Old polling functions removed
- [ ] **Phase 4**: Backend confirmed ready for subscriptions
- [ ] **Phase 5**: Manual testing of real-time notifications
- [ ] **Verification**: No imports of removed polling functions
- [ ] **Deployment**: Safely rolled out; server load monitored
- [ ] **Documentation**: Updated any docs that reference polling

---

## Alternative: Keep Both (Not Recommended)

**If keeping polling + subscription together**:
- Document that subscription is the intended path, polling is fallback
- Add flag: `ENABLE_NOTIFICATION_SUBSCRIPTION=true` to migrate gradually
- Risk: Dual notifications (user gets same event twice)
- Complexity: Worth it only if backend migration is phased

---

## Effort Estimate

| Phase | Time | Difficulty |
|-------|------|-----------|
| 1: Hook creation | 30 min | Low |
| 2: Migration | 30 min | Medium |
| 3: Cleanup | 10 min | Low |
| 4: Verification | 5 min | Low |
| 5: Testing | 20 min | Low |
| **Total** | **~95 min** | **Medium** |

---

## Success Criteria

✅ **Zero polling for notifications**:
- [ ] No HTTP requests to `/notifications/test/*` endpoints
- [ ] All notification delivery via GraphQL subscription

✅ **Real-time delivery**:
- [ ] Users see notifications instantly (no 15-second delay)
- [ ] Tested with manual event + subscription listener

✅ **Server load reduction**:
- [ ] Network tab shows no polling requests
- [ ] Backend metrics show dramatic reduction in notification endpoint traffic

✅ **Code cleanup**:
- [ ] Old polling functions deleted
- [ ] useEscrowUpdates refactored or removed
- [ ] PR checklist prevents new polling functions

---

## Related Issues

- **#208**: Escrow data-fetching stacks (similar pattern: two mechanisms for same data)
- **Similar pattern**: Both issues have "scaffolding" mechanisms that should be replaced with designed solutions

---

## Questions?

**"Why not keep polling as fallback?"** → GraphQL subscriptions are more reliable. Polling adds complexity without benefit.

**"Will subscription work everywhere?"** → WebSocket support required; check deployment environment. Most modern stacks support it.

**"What if backend doesn't support subscriptions yet?"** → Phase 4 catches this. If unsupported, schedule backend work before frontend migration.

**"How do I test this?"** → Use Apollo DevTools to monitor subscription; trigger backend event manually; verify real-time update.

---

## Files to Review

- `apps/frontend/src/core/config/axios/notifications.ts` — To delete
- `apps/frontend/src/components/escrow/hook/useEscrowUpdates.ts` — To refactor
- `apps/frontend/src/graphql/subscriptions/notification-subscriptions.ts` — To verify
- `apps/frontend/src/components/dashboard/RoleEscrowDashboard.tsx` — To update if using notifications
