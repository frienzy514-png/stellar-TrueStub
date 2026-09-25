"use client";

import { useMutation, useSubscription } from "@apollo/client/react";
import { Bell } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { NotificationItem } from "@/components/dashboard/NotificationItem";
import { NotificationPreferences } from "@/components/notifications/NotificationPreferences";
import { USER_NOTIFICATIONS_SUBSCRIPTION } from "@/graphql/subscriptions/notification-subscriptions";
import {
  MARK_ALL_NOTIFICATIONS_READ,
  MARK_NOTIFICATION_READ,
} from "@/graphql/mutations/notification-mutations";
import { useCurrentUserId } from "@/hooks/useCurrentUserId";

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
}

const SUCCESS_TYPES = new Set(["success", "funded", "completed", "released", "resolved"]);
const WARNING_TYPES = new Set(["warning", "disputed", "cancelled", "action_required", "about_to_sell"]);

/** Maps a stored notification type onto the three NotificationItem styles. */
function toDisplayType(type: string): "success" | "info" | "warning" {
  if (SUCCESS_TYPES.has(type)) return "success";
  if (WARNING_TYPES.has(type)) return "warning";
  return "info";
}

export default function NotificationsPage() {
  const userId = useCurrentUserId();
  const { data, loading, error } = useSubscription<{ notifications: NotificationRow[] }>(
    USER_NOTIFICATIONS_SUBSCRIPTION,
    { variables: { userId }, skip: !userId },
  );
  const [markNotificationRead] = useMutation(MARK_NOTIFICATION_READ);
  const [markAllNotificationsRead] = useMutation(MARK_ALL_NOTIFICATIONS_READ);

  const notifications = data?.notifications ?? [];
  const unreadCount = notifications.filter((n) => !n.read).length;
  const isLoading = userId === undefined || loading;

  // The subscription pushes the updated rows back, so no local state to patch.
  const markAllRead = () => {
    if (userId) markAllNotificationsRead({ variables: { userId } });
  };

  const markRead = (id: string) => {
    markNotificationRead({ variables: { id } });
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <NotificationPreferences />

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">Activity & History</h1>
            {unreadCount > 0 && (
              <span className="rounded-full bg-purple-600 px-2 py-0.5 text-xs text-white font-medium">
                {unreadCount}
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="text-xs text-gray-400 hover:text-white transition-colors"
            >
              Mark all as read
            </button>
          )}
        </div>

        <hr className="border-border" />

        {isLoading && (
          <p className="py-16 text-center text-sm text-gray-400">Loading notifications...</p>
        )}

        {!isLoading && error && (
          <p className="py-16 text-center text-sm text-red-400">Unable to load notifications.</p>
        )}

        {!isLoading && !error && notifications.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 space-y-3">
            <Bell className="h-10 w-10 text-gray-600" />
            <p className="text-sm font-medium text-gray-400">No notifications yet</p>
            <p className="text-xs text-gray-500">You are all caught up</p>
          </div>
        )}

        {notifications.length > 0 && (
          <div className="space-y-2">
            {notifications.map((n) => (
              <NotificationItem
                key={n.id}
                type={toDisplayType(n.type)}
                title={n.title}
                message={n.message}
                timestamp={formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                read={n.read}
                onClick={() => !n.read && markRead(n.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

