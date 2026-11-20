import { env } from "../config/env";
import { logger } from "./logger";
import { Sentry } from "./sentry";

export type FinancialOperation =
  | "refund.claim"
  | "transfer.initiate"
  | "transfer.accept"
  | "transfer.cancel"
  | "dispute.open"
  | "dispute.transition";

/**
 * Measures a money-sensitive operation and emits a dedicated alert when it
 * exceeds FINANCIAL_OPERATION_SLOW_MS. This is separate from generic request
 * latency monitoring and includes only safe operational context.
 */
export async function trackFinancialOperation<T>(
  operation: FinancialOperation,
  run: () => Promise<T>,
  context: Record<string, string> = {},
  thresholdMs = env.FINANCIAL_OPERATION_SLOW_MS,
): Promise<T> {
  const startedAt = Date.now();

  try {
    return await run();
  } finally {
    const durationMs = Date.now() - startedAt;
    if (durationMs >= thresholdMs) {
      const alert = {
        alert: "financial_operation_slow",
        operation,
        durationMs,
        thresholdMs,
        ...context,
      };
      const message = `[FINANCIAL_OPERATION_SLOW] ${operation} took ${durationMs}ms (threshold: ${thresholdMs}ms)`;

      logger.warn(alert, message);
      Sentry.captureMessage(message, {
        level: "warning",
        tags: { alert: "financial_operation_slow", operation },
        extra: alert,
      });

      const webhookUrl = env.CRITICAL_ALERT_WEBHOOK_URL;
      if (webhookUrl) {
        void fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: message, ...alert }),
        }).catch((error) => {
          logger.error({ error, operation }, "[FINANCIAL_OPERATION_SLOW] alert delivery failed");
        });
      }
    }
  }
}
