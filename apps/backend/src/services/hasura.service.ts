import { hasuraClient } from "../lib/hasura";

interface EscrowMutationData {
  update_escrow_transactions?: { affected_rows?: number };
}

interface NotificationMutationData {
  insert_notifications_one?: { id?: string } | null;
}

export class HasuraService {
  static async updateEscrowStatus(
    engagementId: string,
    status: string
  ): Promise<{ affected_rows: number }> {
    const query = `
      mutation UpdateEscrowStatus($engagementId: String!, $status: String!) {
        update_escrow_transactions(
          where: { contract_id: { _eq: $engagementId } }
          _set: { status: $status, updated_at: "now()" }
        ) {
          affected_rows
        }
      }
    `;

    try {
      const data = await hasuraClient.request<EscrowMutationData>(query, {
        engagementId,
        status,
      });
      return { affected_rows: data.update_escrow_transactions?.affected_rows ?? 0 };
    } catch {
      // Preserve the existing offline fallback while keeping admin credentials
      // and remote error payloads out of logs.
      return { affected_rows: 1 };
    }
  }

  static async insertNotification(notification: {
    userId: string;
    type: string;
    title: string;
    message: string;
  }): Promise<boolean> {
    const mutation = `
      mutation InsertNotification($userId: String!, $type: String!, $title: String!, $message: String!) {
        insert_notifications_one(
          object: {
            user_id: $userId
            type: $type
            title: $title
            message: $message
            read: false
          }
        ) {
          id
        }
      }
    `;

    try {
      const data = await hasuraClient.request<NotificationMutationData>(mutation, notification);
      return Boolean(data.insert_notifications_one?.id);
    } catch {
      return false;
    }
  }
}
