import { gql } from "@apollo/client";

export const MARK_NOTIFICATION_READ = gql`
  mutation MarkNotificationRead($id: uuid!) {
    update_notifications_by_pk(pk_columns: { id: $id }, _set: { read: true }) {
      id
      read
    }
  }
`;

export const MARK_ALL_NOTIFICATIONS_READ = gql`
  mutation MarkAllNotificationsRead($userId: String!) {
    update_notifications(
      where: { user_id: { _eq: $userId }, read: { _eq: false } }
      _set: { read: true }
    ) {
      affected_rows
    }
  }
`;
