import { Router, Request, Response } from "express";
import { createHmac, timingSafeEqual } from "crypto";
import { env } from "../config/env";
import { logger } from "../lib/logger";
import { Sentry } from "../lib/sentry";
import { NotificationService } from "../services/notification.service";
import { HasuraService } from "../services/hasura.service";
import { webhookIpAllowlist } from "../middleware/webhookIpAllowlist";

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

/**
 * Out-of-app notification adapter. Kept as a narrow interface because
 * notification delivery is a best-effort side effect of the webhook; the
 * authoritative work is the Postgres status write above it.
 */
interface EscrowStatusNotifier {
  notifyEscrowStatusChange(payload: {
    escrowId: string;
    contractId: string;
    engagementId: string;
    status: string;
    amount?: unknown;
    currency?: unknown;
    recipientEmail?: unknown;
    recipientName?: unknown;
    recipientPushToken?: unknown;
    role?: unknown;
  }): Promise<unknown>;
}

const escrowStatusNotifier = NotificationService as unknown as EscrowStatusNotifier;

/**
 * Trustless Work status → stored status.
 *
 * Source: Trustless Work's escrow API documentation for the escrow `status`
 * field (https://docs.trustlesswork.com — "Escrow Status" / escrow lifecycle).
 * The documented lifecycle values are: created, funded, active, completed,
 * released, disputed, resolved, cancelled, expired, refunded. We also accept
 * the common aliases Trustless Work has used in webhook payloads (pending,
 * in_progress, in_review, failed) so a legitimate delivery is never rejected
 * merely because it uses a synonym for a documented state.
 *
 * Anything not listed here is an intentional rejection: it is not a status
 * Trustless Work documents, so a 400 is the correct response (and is alerted
 * on below, since it likely signals a new upstream status we must map).
 */
export const STATUS_MAP: Record<string, string> = {
  // Documented lifecycle values.
  created: "pending",
  funded: "funded",
  active: "funded",
  completed: "completed",
  released: "released",
  disputed: "disputed",
  resolved: "resolved",
  cancelled: "cancelled",
  expired: "expired",
  refunded: "refunded",
  // Documented aliases / historical payload variants.
  pending: "pending",
  complete: "completed",
  in_progress: "funded",
  in_review: "disputed",
  failed: "cancelled",
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
 * We therefore record processed event IDs in Postgres (table
 * `processed_webhook_events`, migration 010) and short-circuit any delivery
 * whose event ID has already been claimed. The unique primary key makes the
 * check atomic across backend instances; old rows are pruned by the scheduled
 * cleanup job below instead of an in-process eviction loop.
 */
export const PROCESSED_EVENT_TTL_MS = 24 * 60 * 60 * 1000; // 24h

let cleanupRunning = false;

/**
 * Deletes dedup rows older than the TTL. Returns the number of rows removed.
 * Failures are logged and swallowed: cleanup must never break webhook
 * processing.
 */
export async function cleanupProcessedWebhookEvents(
  retentionMs: number = PROCESSED_EVENT_TTL_MS
): Promise<number> {
  if (cleanupRunning) return 0;
  cleanupRunning = true;
  try {
    const cutoff = new Date(Date.now() - retentionMs).toISOString();
    const deleted = await HasuraService.deleteProcessedWebhookEventsBefore(cutoff);
    if (deleted > 0) {
      logger.info(
        { deleted, cutoff },
        "[webhook:escrow-status] Pruned old delivery dedup rows"
      );
    }
    return deleted;
  } catch (err) {
    logger.error({ err }, "[webhook:escrow-status] Dedup cleanup failed");
    return 0;
  } finally {
    cleanupRunning = false;
  }
}

/**
 * Starts the scheduled dedup cleanup (hourly by default). Returns the timer
 * so the caller can stop it during shutdown/tests.
 */
export function startProcessedWebhookEventCleanup(
  intervalMs: number = 60 * 60 * 1000
): NodeJS.Timeout {
  const timer = setInterval(() => {
    void cleanupProcessedWebhookEvents();
  }, intervalMs);
  // Never keep the process alive solely for cleanup.
  timer.unref();
  return timer;
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

// Optional defense-in-depth source-IP allowlist (#532). No-op unless
// TRUSTLESS_WORK_WEBHOOK_ALLOWED_IPS is set; HMAC below is always enforced.
const escrowStatusIpAllowlist = webhookIpAllowlist(
  () => env.TRUSTLESS_WORK_WEBHOOK_ALLOWED_IPS,
  "escrow-status"
);

webhookRouter.post("/escrow-status", escrowStatusIpAllowlist, async (req: Request, res: Response) => {
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
    // A 400 here almost always means Trustless Work introduced a status value
    // we do not map yet — an integration gap, not a malformed request. Alert
    // on it distinctly from generic delivery failures so it is visible rather
    // than buried in logs (#410).
    Sentry.captureMessage("[webhook:escrow-status] Unmapped escrow status received", {
      level: "warning",
      tags: {
        alert: "webhook.unmapped_status",
        webhook: "escrow-status",
      },
      extra: { status },
    });
    return res.status(400).json({ error: `Unknown status: ${status}` });
  }

  // Stable dedup key for this delivery. Claimed atomically in Postgres after
  // the status write below, so a replay is acknowledged without repeating the
  // notification side effect.
  const eventId = getEventId(body, req.rawBody);

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

  // Claim the event before the notification side effect so a concurrent or
  // replayed delivery cannot send a duplicate notification. The unique key in
  // `processed_webhook_events` is the cross-instance guard (#518).
  let firstDelivery: boolean;
  try {
    firstDelivery = await HasuraService.claimProcessedWebhookEvent(
      eventId,
      new Date().toISOString()
    );
  } catch (err) {
    // Non-2xx so Trustless Work retries; the status write is idempotent.
    logger.error(
      { err, contractId, eventId },
      "[webhook:escrow-status] Failed to record delivery dedup key"
    );
    captureDeliveryFailure(err, contractId, "escrow_status.dedup", resolvedEngagementId);
    return res.status(500).json({ error: "Failed to process webhook delivery" });
  }

  if (!firstDelivery) {
    logger.info(
      { contractId, eventId },
      "[webhook:escrow-status] Duplicate delivery ignored"
    );
    return res.status(200).json({
      success: true,
      duplicate: true,
      contractId,
      status: normalizedStatus,
      rowsUpdated,
    });
  }

  // The status write is what matters; a notification failure must not make
  // Trustless Work retry (and re-apply) an update that already landed.
  let notifications: unknown = null;
  try {
    notifications = await escrowStatusNotifier.notifyEscrowStatusChange({
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
