import { Router, Request, Response } from "express";
import { createHmac, timingSafeEqual } from "crypto";
import { env } from "../config/env";
import { logger } from "../lib/logger";
import { Sentry } from "../lib/sentry";
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

/**
 * Replay/dedup protection (#326).
 *
 * HMAC verification proves a payload was signed by Trustless Work, but a
 * legitimately signed payload can still be delivered more than once — either
 * because Trustless Work retries a delivery it believes failed, or because an
 * attacker captures and replays a valid signed request. The status write is
 * naturally idempotent (it sets a fixed value), but the notification side
 * effect is not: replaying the same event would send the recipient a duplicate
 * notification.
 *
 * We therefore track processed event IDs in-memory and short-circuit any
 * delivery whose event ID we have already handled. The cache is bounded and
 * entries expire so it cannot grow without limit.
 */
const PROCESSED_EVENT_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const PROCESSED_EVENT_MAX = 10_000;

const processedEvents = new Map<string, number>();

function pruneProcessedEvents(now: number): void {
  for (const [id, seenAt] of processedEvents) {
    if (now - seenAt > PROCESSED_EVENT_TTL_MS) {
      processedEvents.delete(id);
    }
  }
  // Map preserves insertion order, so the oldest entries come first.
  while (processedEvents.size > PROCESSED_EVENT_MAX) {
    const oldest = processedEvents.keys().next().value;
    if (oldest === undefined) break;
    processedEvents.delete(oldest);
  }
}

/**
 * Derive a stable dedup key for a delivery. Prefer an explicit event ID from
 * the payload; fall back to a deterministic hash of the identifying fields so
 * identical replays still collapse to the same key.
 */
function getEventId(body: Record<string, unknown>, rawBody: Buffer): string {
  const explicit =
    body.eventId ?? body.event_id ?? body.id ?? body.deliveryId ?? body.delivery_id;
  if (typeof explicit === "string" && explicit) {
    return explicit;
  }
  return createHmac("sha256", "webhook-dedup").update(rawBody).digest("hex");
}

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

/**
 * Surface a retryable delivery failure to the on-call channel immediately.
 *
 * Trustless Work retries a 5xx response, but this integration does not receive
 * a separate "retries exhausted" callback. Capturing each retryable failure
 * gives the on-call alert time to repair the write path before that happens.
 * Do not attach the request body: it can contain recipient PII.
 */
function captureDeliveryFailure(
  err: unknown,
  contractId?: string,
  step?: string,
  engagementId?: string
): void {
  Sentry.captureException(err, {
    tags: {
      alert: "webhook.delivery_failure",
      webhook: "escrow-status",
      retryable: "true",
      ...(step ? { step } : {}),
      ...(contractId ? { contractId } : {}),
      ...(engagementId ? { engagementId } : {}),
    },
    ...(contractId || engagementId
      ? { extra: { ...(contractId ? { contractId } : {}), ...(engagementId ? { engagementId } : {}) } }
      : {}),
  });
}

webhookRouter.post("/escrow-status", async (req: Request, res: Response) => {
  const secret = env.TRUSTLESS_WORK_WEBHOOK_SECRET;
  if (!secret) {
    logger.error("[webhook:escrow-status] TRUSTLESS_WORK_WEBHOOK_SECRET is not configured");
    captureDeliveryFailure(
      new Error("TRUSTLESS_WORK_WEBHOOK_SECRET is not configured"),
      undefined,
      "config.secret_missing"
    );
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

  const body = (req.body || {}) as Record<string, unknown>;
  const {
    contractId,
    engagementId,
    status,
    amount,
    currency,
    recipientEmail,
    recipientName,
    recipientPushToken,
    role,
  } = body as {
    contractId?: unknown;
    engagementId?: unknown;
    status?: unknown;
    amount?: unknown;
    currency?: unknown;
    recipientEmail?: unknown;
    recipientName?: unknown;
    recipientPushToken?: unknown;
    role?: unknown;
  };

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

  // Replay/dedup guard: a delivery we have already processed is acknowledged
  // with 200 (so Trustless Work stops retrying) but produces no side effects.
  const now = Date.now();
  pruneProcessedEvents(now);
  const eventId = getEventId(body, req.rawBody);
  if (processedEvents.has(eventId)) {
    logger.info(
      { contractId, eventId },
      "[webhook:escrow-status] Duplicate delivery ignored"
    );
    return res.status(200).json({
      success: true,
      duplicate: true,
      contractId,
      status: normalizedStatus,
    });
  }

  const resolvedEngagementId =
    typeof engagementId === "string" && engagementId ? engagementId : contractId;

  // Enrich every Sentry event from this request with the business identifiers
  // so a failure is traceable to the specific escrow/contract (#323).
  Sentry.setTag("webhook", "escrow-status");
  Sentry.setTag("contractId", contractId);
  Sentry.setTag("engagementId", resolvedEngagementId);
  Sentry.setContext("escrow", {
    contractId,
    engagementId: resolvedEngagementId,
    status,
    normalizedStatus,
  });

  let rowsUpdated: number;
  try {
    ({ affected_rows: rowsUpdated } = await HasuraService.updateEscrowStatus(
      contractId,
      normalizedStatus
    ));
  } catch (err) {
    // Non-2xx so Trustless Work retries the delivery.
    logger.error({ err, contractId }, "[webhook:escrow-status] Failed to update escrow status");
    captureDeliveryFailure(err, contractId, "escrow_status.update", resolvedEngagementId);
    return res.status(500).json({ error: "Failed to sync escrow status" });
  }

  // Mark the event as processed before the notification side effect so a
  // concurrent replay cannot slip through and send a duplicate notification.
  processedEvents.set(eventId, now);

  // The status write is what matters; a notification failure must not make
  // Trustless Work retry (and re-apply) an update that already landed.
  let notifications: Awaited<
    ReturnType<typeof NotificationService.notifyEscrowStatusChange>
  > | null = null;
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
    captureDeliveryFailure(err, contractId, "escrow_status.notify", resolvedEngagementId);
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
