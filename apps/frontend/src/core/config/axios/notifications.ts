import http from "./http";

/**
 * Check for pending (unread) notifications for the given escrow.
 * Endpoint: GET /notifications/test/check-pending
 */
export async function checkPendingNotifications(escrowId: string) {
  const { data } = await http.get("/notifications/test/check-pending", {
    params: { escrowId },
  });
  return data;
}

/**
 * Check for milestone-update notifications for the given escrow.
 * Endpoint: GET /notifications/test/check-milestone-updates
 */
export async function checkMilestoneUpdates(escrowId: string) {
  const { data } = await http.get("/notifications/test/check-milestone-updates", {
    params: { escrowId },
  });
  return data;
}

/**
 * Check for dispute-related notifications for the given escrow.
 * Endpoint: GET /notifications/test/check-dispute-notifications
 */
export async function checkDisputeNotifications(escrowId: string) {
  const { data } = await http.get("/notifications/test/check-dispute-notifications", {
    params: { escrowId },
  });
  return data;
}
