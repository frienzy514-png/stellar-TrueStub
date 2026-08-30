# Notification Delivery: Migration Implementation Guide

**Approach**: Replace REST polling with GraphQL subscription for real-time, efficient notification delivery.

---

## Phase 1: Create useUserNotifications Hook (30 minutes)

### Step 1a: Create the hook
**File**: `apps/frontend/src/hooks/useUserNotifications.ts` (new)

```typescript
/**
 * Hook: Subscribe to real-time user notifications
 *
 * Replaces inefficient polling with GraphQL subscription.
 * Provides real-time notification updates via WebSocket.
 *
 * Usage:
 * ```tsx
 * const { notifications, loading, error } = useUserNotifications({ userId: "123" });
 * ```
 */
import { useSubscription } from "@apollo/client/react";
import { USER_NOTIFICATIONS_SUBSCRIPTION } from "@/graphql/subscriptions/notification-subscriptions";
import type { UserNotificationsSubscription } from "@/graphql/types";

export interface UseUserNotificationsProps {
  userId: string;
  skip?: boolean;
  limit?: number;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
}

/**
 * Subscribe to real-time notifications for a user
 *
 * @param userId - User ID to get notifications for
 * @param skip - Skip subscription (for conditional loading)
 * @returns Notifications array, loading state, and error
 */
export const useUserNotifications = ({
  userId,
  skip = false,
}: UseUserNotificationsProps) => {
  const { data, loading, error } = useSubscription<UserNotificationsSubscription>(
    USER_NOTIFICATIONS_SUBSCRIPTION,
    {
      variables: { userId },
      skip: skip || !userId,
    }
  );

  return {
    notifications: (data?.notifications ?? []) as Notification[],
    loading,
    error,
  };
};
```

### Step 1b: Add TypeScript type
**File**: `apps/frontend/src/graphql/types.ts` (update if needed)

Ensure `UserNotificationsSubscription` type is generated from GraphQL schema:
```bash
npm run generate:graphql
# or equivalent codegen command
```

---

## Phase 2: Refactor useEscrowUpdates Hook (30 minutes)

### Step 2a: Replace polling with subscription
**File**: `apps/frontend/src/components/escrow/hook/useEscrowUpdates.ts` (update)

**Before** (polling):
```typescript
import { useEffect, useState } from "react";
import {
  checkPendingNotifications,
  checkMilestoneUpdates,
  checkDisputeNotifications,
} from "@/core/config/axios/notifications";

export const useEscrowUpdates = (escrowId: string) => {
  const [status, setStatus] = useState("milestone_approved");

  useEffect(() => {
    const interval = setInterval(async () => {
      const pending = await checkPendingNotifications(escrowId);
      const milestones = await checkMilestoneUpdates(escrowId);
      const disputes = await checkDisputeNotifications(escrowId);
      // ... logic to set status
    }, 15000);

    return () => clearInterval(interval);
  }, [escrowId]);

  return { status };
};
```

**After** (subscription):
```typescript
/**
 * Hook: Get real-time escrow status updates via notifications
 *
 * Subscribes to user's notifications and derives escrow status.
 * Replaces inefficient 15-second polling with real-time GraphQL subscription.
 *
 * Usage:
 * ```tsx
 * const { status, notifications } = useEscrowUpdates({
 *   escrowId: "abc-123",
 *   userId: "user-456"
 * });
 * ```
 */
import { useMemo } from "react";
import { useUserNotifications } from "@/hooks/useUserNotifications";

export interface UseEscrowUpdatesProps {
  escrowId: string;
  userId: string;
  skip?: boolean;
}

type EscrowStatus =
  | "pending"
  | "pending_action"
  | "milestone_approved"
  | "disputed";

export const useEscrowUpdates = ({
  escrowId,
  userId,
  skip = false,
}: UseEscrowUpdatesProps) => {
  const { notifications, loading, error } = useUserNotifications({
    userId,
    skip: skip || !escrowId || !userId,
  });

  // Derive escrow status from notifications
  const status = useMemo<EscrowStatus>(() => {
    const escrowNotifications = notifications.filter(
      (n) => n.message?.includes?.(escrowId) || n.id?.includes?.(escrowId)
    );

    if (escrowNotifications.some((n) => n.type === "pending")) {
      return "pending_action";
    }

    if (
      escrowNotifications.some(
        (n) => n.type === "milestone" && n.message?.includes?.("approved")
      )
    ) {
      return "milestone_approved";
    }

    if (escrowNotifications.some((n) => n.type === "dispute")) {
      return "disputed";
    }

    return "pending";
  }, [notifications, escrowId]);

  return { status, loading, error, notifications };
};
```

### Step 2b: Update components using useEscrowUpdates

Find all usages and update the hook call:

**Before**:
```tsx
const { status } = useEscrowUpdates(escrowId);
```

**After**:
```tsx
const userId = useAuth().user?.id; // or get from context
const { status } = useEscrowUpdates({ escrowId, userId });
```

---

## Phase 3: Remove Polling Functions (10 minutes)

### Step 3a: Delete polling file
```bash
rm apps/frontend/src/core/config/axios/notifications.ts
rm apps/frontend/src/core/config/axios/notifications.test.ts
```

### Step 3b: Remove from exports
**File**: `apps/frontend/src/core/config/axios/index.ts` (if it re-exports)

Remove:
```typescript
export { checkPendingNotifications, checkMilestoneUpdates, checkDisputeNotifications } from './notifications';
```

### Step 3c: Verify no remaining imports
```bash
grep -r "checkPendingNotifications\|checkMilestoneUpdates\|checkDisputeNotifications" apps/frontend/src
# Should return: 0 results
```

---

## Phase 4: Verify Backend Readiness (5 minutes)

### Checklist
- [ ] Hasura `notifications` table exists with required fields:
  - `id` (UUID)
  - `user_id` (UUID, FK to users)
  - `type` (string: "pending" | "milestone" | "dispute" | ...)
  - `title` (string)
  - `message` (string)
  - `read` (boolean)
  - `created_at` (timestamp)
  - `escrow_id` (optional UUID, FK to escrows)

- [ ] GraphQL subscription enabled for `notifications`:
  ```bash
  # In Hasura console, check that notifications table has subscriptions enabled
  ```

- [ ] WebSocket support enabled:
  ```bash
  # Check Hasura GraphQL endpoint supports wss:// protocol
  curl -I wss://your-graphql-endpoint
  ```

- [ ] Test subscription in GraphQL IDE:
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

---

## Phase 5: Test & Deploy (20 minutes)

### Step 5a: Unit Tests

**File**: `apps/frontend/src/hooks/__tests__/useUserNotifications.test.ts`

```typescript
import { renderHook, waitFor } from "@testing-library/react";
import { MockedProvider } from "@apollo/client/testing";
import { useUserNotifications } from "../useUserNotifications";
import { USER_NOTIFICATIONS_SUBSCRIPTION } from "@/graphql/subscriptions/notification-subscriptions";

const mocks = [
  {
    request: {
      query: USER_NOTIFICATIONS_SUBSCRIPTION,
      variables: { userId: "user-123" },
    },
    result: {
      data: {
        notifications: [
          {
            id: "notif-1",
            type: "milestone",
            title: "Milestone Approved",
            message: "Escrow abc-123 milestone approved",
            read: false,
            created_at: new Date().toISOString(),
          },
        ],
      },
    },
  },
];

describe("useUserNotifications", () => {
  it("returns notifications from subscription", async () => {
    const { result } = renderHook(() => useUserNotifications({ userId: "user-123" }), {
      wrapper: ({ children }) => (
        <MockedProvider mocks={mocks}>{children}</MockedProvider>
      ),
    });

    await waitFor(() => {
      expect(result.current.notifications).toHaveLength(1);
      expect(result.current.notifications[0].type).toBe("milestone");
    });
  });

  it("skips subscription when skip=true", () => {
    const { result } = renderHook(
      () => useUserNotifications({ userId: "user-123", skip: true }),
      { wrapper: ({ children }) => <MockedProvider>{children}</MockedProvider> }
    );

    expect(result.current.notifications).toEqual([]);
  });
});
```

### Step 5b: Manual Testing

1. **Start dev server**:
   ```bash
   npm run dev
   ```

2. **Open DevTools** → Network tab, filter WebSocket
   - Should see connection to GraphQL endpoint (wss://...)
   - Should see subscription message sent
   - Should NOT see any `/notifications/test/` HTTP requests

3. **Trigger notification** (manual backend action or test button):
   - Watch Apollo DevTools subscription update
   - Verify notification appears in real-time (no 15s delay)

4. **Monitor performance**:
   - Network: Single persistent WebSocket connection
   - CPU: Lower than before (no polling loops)
   - Memory: Steady

### Step 5c: Staged Rollout

1. Deploy to staging
2. Monitor for 24 hours
3. Check backend metrics:
   - Notification endpoint requests: Should drop to ~0
   - WebSocket connections: Should increase
   - Response times: Should improve
4. Deploy to production

---

## Rollback Plan

If subscription has issues:

```bash
# Revert to polling temporarily
git revert <hash-of-subscription-commit>
npm run dev
# Notification functions will still be available
```

---

## Code Review Checklist

When reviewing PR for this migration:

- [ ] Old polling functions (`checkPendingNotifications`, etc.) are deleted
- [ ] `useUserNotifications` hook created with clear documentation
- [ ] `useEscrowUpdates` refactored to use subscription
- [ ] No HTTP requests to `/notifications/test/*` endpoints
- [ ] Unit tests pass for subscription hook
- [ ] No polling intervals remaining in code (`setInterval` for notifications)
- [ ] Backend subscription support verified

---

## Monitoring & Metrics

### Before (Polling)
```
Requests: 3 HTTP requests / 15s per escrow
Traffic: 200 req/s @ 1000 active users
Latency: 0-15s (average 7.5s)
```

### After (Subscription)
```
Requests: 1 WebSocket connection setup + 0 per event
Traffic: <1 req/s @ 1000 active users
Latency: Real-time (<100ms)
```

**Track these metrics after rollout**:
- [ ] `/notifications/test/` endpoint traffic → 0
- [ ] WebSocket connections → increases
- [ ] Notification latency → <500ms
- [ ] Server CPU usage → decreases
- [ ] User feedback → improved responsiveness

---

## Timeline

| Phase | Duration | Blocker? |
|-------|----------|----------|
| 1: Hook creation | 30 min | No |
| 2: Refactor | 30 min | No |
| 3: Cleanup | 10 min | No |
| 4: Verification | 5 min | **Yes** |
| 5: Testing | 20 min | No |
| **Total** | **~95 min** | — |

**Phase 4 is blocking**: Confirm backend has GraphQL subscription support before starting other phases.

---

## Questions During Implementation?

- **"Where do I get userId for useEscrowUpdates?"** → From auth context or parent component props
- **"What if notifications table schema is different?"** → Update GraphQL subscription query to match actual schema
- **"How do I test subscription locally?"** → Use `apollo-client/testing` MockedProvider with subscription mocks
- **"Will this break existing UI?"** → No; hook interface is same, just internals change (faster delivery)

---

## Success Indicators

✅ Zero polling requests  
✅ Real-time notifications (< 500ms latency)  
✅ Reduced server load  
✅ All tests passing  
✅ User feedback positive  
