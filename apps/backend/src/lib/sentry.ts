/**
 * Error tracking (#111) — the single home for Sentry in the backend (#260).
 *
 * All Sentry configuration and initialisation lives in this file. There used
 * to be a second copy in `config/sentry.ts` with a different sample rate; it
 * was merged in here so the two can no longer disagree. Everything else in
 * the backend should import Sentry helpers from `lib/sentry`, never call
 * `Sentry.init` itself.
 *
 * `initSentry` is called once from `index.ts` at process start. It is a
 * no-op when `SENTRY_DSN` isn't set (local dev, CI), and later calls are
 * ignored, so Sentry can't be initialised twice.
 *
 * Also exposes `alertCriticalFailure` (#328): a dedicated, higher-urgency
 * alert channel for money/listing-critical failures (refunds, ownership
 * transfers) so they surface promptly instead of being buried in the general
 * error stream. The alert is delivered to `CRITICAL_ALERT_WEBHOOK_URL` when
 * configured, and always emitted to the logger with a distinct tag.
 */
import * as Sentry from "@sentry/node";
import { env } from "../config/env";
import { logger } from "./logger";
import { getCorrelationId as getRequestId } from "../middleware/requestLogger";

/**
 * Tag key used to mark events that belong to the escrow-status webhook
 * integration. Alert rules in Sentry can filter on this tag so that
 * unmapped-status 400s raise a dedicated alert instead of being buried in
 * generic error noise.
 */
export const ESCROW_STATUS_WEBHOOK_TAG = "escrow_status_webhook";

let sentryInitialized = false;

export function initSentry(): void {
  if (sentryInitialized || !env.SENTRY_DSN) {
    return;
  }
  sentryInitialized = true;

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    // Capture 10% of transactions in production only.
    tracesSampleRate: env.NODE_ENV === "production" ? 0.1 : 0,
    // Always attach the environment tag so alert rules scoped to a specific
    // environment (e.g. production) fire correctly.
    initialScope: {
      tags: { environment: env.NODE_ENV },
    },
    // Attach the current request correlation ID (from AsyncLocalStorage) to
    // every event so Sentry events share the same ID as the log lines across
    // the refund→dispute→changelog chain (#425).
    beforeSend(event) {
      const requestId = getRequestId();
      if (requestId) {
        event.tags = { ...event.tags, requestId };
        event.extra = { ...event.extra, requestId };
      }
      return event;
    },
  });
}

/**
 * Attach a request's correlation ID (and optional extra context) to the
 * current Sentry scope, so every event captured while handling the request
 * carries it.
 */
export function setSentryRequestContext(
  requestId: string,
  context: Record<string, unknown> = {},
): void {
  Sentry.setTag("requestId", requestId);
  Sentry.setContext("request", { requestId, ...context });
}

/**
 * Alert raised when the dispute-resolver wallet balance drops below its
 * configured threshold (#420), so it can be topped up before a refund fails.
 */
export function captureLowBalanceAlert(details: {
  walletAddress: string;
  balance: number;
  threshold: number;
}): void {
  Sentry.captureMessage(
    `[LOW_BALANCE] Dispute-resolver wallet balance ${details.balance} is below threshold ${details.threshold}`,
    {
      level: "warning",
      tags: { alert: "dispute_resolver_low_balance" },
      extra: { ...details },
    },
  );
}

/**
 * Dedicated alert for refund/transfer failure paths (#328).
 *
 * Distinct from the general Sentry error stream: it is tagged as a critical
 * alert, logged at `error` level with a stable `[CRITICAL_ALERT]` prefix, and
 * pushed to the operational alert webhook (Slack/PagerDuty/etc.) when
 * `CRITICAL_ALERT_WEBHOOK_URL` is set. Never throws — alerting must not mask
 * the original failure.
 */
export async function alertCriticalFailure(
  kind: "refund" | "transfer",
  message: string,
  context: Record<string, unknown> = {},
): Promise<void> {
  const requestId = getRequestId();

  const payload = {
    kind,
    message,
    context,
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
    ...(requestId ? { requestId } : {}),
  };

  logger.error(payload, `[CRITICAL_ALERT] ${kind} failure: ${message}`);

  Sentry.captureMessage(`[CRITICAL_ALERT] ${kind} failure: ${message}`, {
    level: "fatal",
    tags: { alert: "critical", kind, ...(requestId ? { requestId } : {}) },
    extra: { ...context, ...(requestId ? { requestId } : {}) },
  });

  const webhookUrl = env.CRITICAL_ALERT_WEBHOOK_URL;
  if (!webhookUrl) {
    return;
  }

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `:rotating_light: CRITICAL ${kind} failure: ${message}`,
        ...payload,
      }),
    });
  } catch (err) {
    logger.error({ err, payload }, "[CRITICAL_ALERT] failed to deliver alert");
  }
}

/**
 * Dedicated alert for notification-delivery failure paths (#408).
 *
 * Distinct from the general Sentry error stream: it is tagged as a
 * notification-delivery alert, logged at `error` level with a stable
 * `[NOTIFICATION_DELIVERY_FAILURE]` prefix, and pushed to the operational
 * alert webhook (Slack/PagerDuty/etc.) when `CRITICAL_ALERT_WEBHOOK_URL` is
 * set. Never throws — alerting must not mask the original failure.
 */
export async function alertNotificationDeliveryFailure(
  notificationType: string,
  reason: "transient_exhausted" | "permanent",
  message: string,
  context: Record<string, unknown> = {},
): Promise<void> {
  const payload = {
    notificationType,
    reason,
    message,
    context,
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
  };

  logger.error(
    payload,
    `[NOTIFICATION_DELIVERY_FAILURE] ${notificationType} (${reason}): ${message}`,
  );

  Sentry.captureMessage(
    `[NOTIFICATION_DELIVERY_FAILURE] ${notificationType} (${reason}): ${message}`,
    {
      level: "error",
      tags: {
        alert: "notification_delivery_failure",
        notificationType,
        reason,
      },
      extra: context,
    },
  );

  const webhookUrl = env.CRITICAL_ALERT_WEBHOOK_URL;
  if (!webhookUrl) {
    return;
  }

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `:warning: NOTIFICATION DELIVERY FAILURE ${notificationType} (${reason}): ${message}`,
        ...payload,
      }),
    });
  } catch (err) {
    logger.error(
      { err, payload },
      "[NOTIFICATION_DELIVERY_FAILURE] failed to deliver alert",
    );
  }
}

export { Sentry };

/**
 * Correlation-aware Sentry helpers (#425).
 *
 * These wrap the SDK capture calls so the current request correlation ID is
 * always attached as a tag/extra, even when `beforeSend` isn't invoked (e.g.
 * when Sentry is not initialized). Prefer these over calling `Sentry.*`
 * directly on the refund→dispute→changelog path.
 */
export function captureException(
  error: unknown,
  context: Record<string, unknown> = {},
): void {
  const requestId = getRequestId();
  Sentry.captureException(error, {
    tags: requestId ? { requestId } : undefined,
    extra: { ...context, ...(requestId ? { requestId } : {}) },
  });
}

export function captureMessage(
  message: string,
  context: Record<string, unknown> = {},
): void {
  const requestId = getRequestId();
  Sentry.captureMessage(message, {
    tags: requestId ? { requestId } : undefined,
    extra: { ...context, ...(requestId ? { requestId } : {}) },
  });
}
