import { Router, Request, Response } from "express";
import { createHmac, timingSafeEqual } from "crypto";
import { env } from "../config/env";
import { logger } from "../lib/logger";
import { NotificationService } from "../services/notification.service";
import { HasuraService } from "../services/hasura.service";

/**
 * Trustless Work escrow-status webhook — the single authoritative code path
 * for updating `escrow_transactions.status` (#233).
 *
 * Every request must carry a valid HMAC-SHA256 signature of the raw body,
 * keyed with TRUSTLESS_WORK_WEBHOOK_SECRET. apps/frontend's
 * `/webhooks/escrow-status` route is a pass-through that forwards the signed
 * payload here unchanged; nothing else writes escrow status.
 */
export const webhookRouter = Router();

/** Trustless Work status → stored status. Unknown statuses are rejected. */
export const STATUS_MAP: Record<string, string> = {
  funded: "funded",
  active: "funded",
  completed: "completed",
  released: "released",
  disputed: "disputed",
  resolved: "resolved",
  cancelled: "cancelled",
};

function getSignatureHeader(req: Request): string | undefined {
  const sig =
    req.headers["x-trustless-work-signature"] ||
    req.headers["x-webhook-signature"] ||
    req.headers["x-signature"];
  return typeof sig === "string" ? sig : Array.isArray(sig) ? sig[0] : undefined;
}

function normalizeSignature(sig: string): string {
  return sig.startsWith("sha256=") ? sig.slice(7) : sig;
}

function verifySignature(rawBody: Buffer, signature: string, secret: string): boolean {
  try {
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    const actual = normalizeSignature(signature);
    const expectedBuf = Buffer.from(expected, "utf8");
    const actualBuf = Buffer.from(actual, "utf8");
    if (expectedBuf.length !== actualBuf.length) {
      return false;
    }
    return timingSafeEqual(expectedBuf, actualBuf);
  } catch {
    return false;
  }
}

webhookRouter.post("/escrow-status", async (req: Request, res: Response) => {
  const secret = env.TRUSTLESS_WORK_WEBHOOK_SECRET;
  if (!secret) {
    logger.error("[webhook:escrow-status] TRUSTLESS_WORK_WEBHOOK_SECRET is not configured");
    return res.status(500).json({ error: "Webhook secret is not configured" });
  }

  const signature = getSignatureHeader(req);
  if (!signature) {
    return res.status(401).json({ error: "Missing webhook signature header" });
  }

  if (!req.rawBody) {
    return res.status(400).json({ error: "Expected a JSON request body" });
  }

  if (!verifySignature(req.rawBody, signature, secret)) {
    return res.status(401).json({ error: "Invalid webhook signature" });
  }

  const { contractId, engagementId, status, amount, currency, recipientEmail, recipientName, recipientPushToken, role } =
    req.body || {};

  // escrow_transactions is keyed by contract_id — engagementId alone can't
  // identify the row to update.
  if (typeof contractId !== "string" || !contractId || typeof status !== "string" || !status) {
    return res.status(400).json({ error: "Missing contractId or status" });
  }

  const normalizedStatus = STATUS_MAP[status.toLowerCase()];
  if (!normalizedStatus) {
    logger.warn({ status }, "[webhook:escrow-status] Unknown status received");
    return res.status(400).json({ error: `Unknown status: ${status}` });
  }

  const resolvedEngagementId = typeof engagementId === "string" && engagementId ? engagementId : contractId;

  let rowsUpdated: number;
  try {
    ({ affected_rows: rowsUpdated } = await HasuraService.updateEscrowStatus(contractId, normalizedStatus));
  } catch (err) {
    // Non-2xx so Trustless Work retries the delivery.
    logger.error({ err, contractId }, "[webhook:escrow-status] Failed to update escrow status");
    return res.status(500).json({ error: "Failed to sync escrow status" });
  }

  // The status write is what matters; a notification failure must not make
  // Trustless Work retry (and re-apply) an update that already landed.
  let notifications: Awaited<ReturnType<typeof NotificationService.notifyEscrowStatusChange>> | null = null;
  try {
    notifications = await NotificationService.notifyEscrowStatusChange({
      escrowId: resolvedEngagementId,
      contractId,
      engagementId: resolvedEngagementId,
      status: normalizedStatus,
      amount,
      currency,
      recipientEmail,
      recipientName,
      recipientPushToken,
      role,
    });
  } catch (err) {
    logger.error({ err, contractId }, "[webhook:escrow-status] Escrow status notification failed");
  }

  logger.info(
    { contractId, engagementId: resolvedEngagementId, status, normalizedStatus, rowsUpdated },
    "[webhook:escrow-status] Escrow status synced"
  );

  return res.status(200).json({
    success: true,
    contractId,
    engagementId: resolvedEngagementId,
    status: normalizedStatus,
    rowsUpdated,
    notifications,
  });
});
