import { Notification } from '../types/notification';
import { NotificationRepository } from '../repositories/notification.repository';
import { logger } from '../utils/logger';
import { captureException } from '../lib/sentry';
import { env } from '../config/env';

const MAX_DELIVERY_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 200;
const MAX_BACKOFF_MS = 10_000;

/**
 * Notification types that carry financial status and therefore must never be
 * silently dropped. If delivery ultimately fails for one of these we escalate
 * the dead-letter record so it is surfaced for manual intervention.
 */
const FINANCIAL_STATUS_TYPES = new Set([
  'escrow_funded',
  'escrow_released',
  'escrow_disputed',
]);

interface DeliveryErrorClassification {
  transient: boolean;
  reason: string;
}

export class NotificationService {
  private notificationRepository: NotificationRepository;

  constructor() {
    this.notificationRepository = new NotificationRepository();
  }

  /**
   * Sends a notification for a webhook event.
   *
   * Webhook deliveries can be retried by Trustless Work (or replayed by an
   * attacker with a captured, validly-signed payload). To keep delivery
   * idempotent we dedupe on the event id: if a notification for the same
   * event has already been recorded, we skip sending it again so the same
   * event never produces duplicate side effects.
   */
  async sendNotification(notification: Notification): Promise<void> {
    const eventId = notification.eventId;

    if (eventId) {
      const alreadyProcessed = await this.notificationRepository.existsByEventId(eventId);
      if (alreadyProcessed) {
        logger.info(`Skipping duplicate notification for event ${eventId}`);
        return;
      }
    }

    try {
      await this.notificationRepository.create(notification);
      // #570 — with no email provider configured, the notification is still
      // recorded but delivery is skipped. Never throw here, so the caller's
      // primary operation (e.g. a webhook status update) still completes.
      if (!env.EMAIL_PROVIDER) {
        logger.warn(
          `EMAIL_PROVIDER is not configured; skipping delivery for event ${eventId ?? 'unknown'}`,
        );
        return;
      }
      await this.dispatchWithRetry(notification);
    } catch (error) {
      logger.error(`Failed to send notification: ${error}`);
      throw error;
    }
  }

  /**
   * Delivers a notification, retrying transient provider failures with
   * exponential backoff plus jitter. Permanent failures (4xx validation) are
   * not retried. When delivery is ultimately given up on, a dead-letter record
   * is written and an alert is emitted so the notification is never silently
   * dropped.
   */
  private async dispatchWithRetry(notification: Notification): Promise<void> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_DELIVERY_ATTEMPTS; attempt++) {
      try {
        await this.dispatch(notification);
        return;
      } catch (error) {
        lastError = error;
        const classification = this.classifyError(error);

        if (!classification.transient) {
          logger.error(
            `Permanent notification delivery failure (attempt ${attempt}/${MAX_DELIVERY_ATTEMPTS}) ` +
              `for event ${notification.eventId ?? 'unknown'}: ${classification.reason}`,
          );
          break;
        }

        if (attempt === MAX_DELIVERY_ATTEMPTS) {
          logger.error(
            `Notification delivery exhausted ${MAX_DELIVERY_ATTEMPTS} attempts ` +
              `for event ${notification.eventId ?? 'unknown'}: ${classification.reason}`,
          );
          break;
        }

        const delay = this.computeBackoffDelay(attempt);
        logger.warn(
          `Transient notification delivery failure (attempt ${attempt}/${MAX_DELIVERY_ATTEMPTS}) ` +
            `for event ${notification.eventId ?? 'unknown'}: ${classification.reason}. ` +
            `Retrying in ${delay}ms`,
        );
        await this.sleep(delay);
      }
    }

    await this.handleDeliveryFailure(notification, lastError);
  }

  private async dispatch(notification: Notification): Promise<void> {
    // Existing delivery logic (email/push/etc.) is unchanged.
    await this.notificationRepository.deliver(notification);
  }

  /**
   * Classifies a delivery error as transient (network/5xx/timeout) or
   * permanent (4xx validation). Unknown errors are treated as transient so we
   * err on the side of retrying rather than dropping a notification.
   */
  private classifyError(error: unknown): DeliveryErrorClassification {
    const status = this.extractStatusCode(error);
    const message = error instanceof Error ? error.message : String(error);

    if (status !== undefined) {
      if (status >= 500) {
        return { transient: true, reason: `provider responded ${status}` };
      }
      if (status >= 400) {
        return { transient: false, reason: `provider responded ${status}` };
      }
    }

    const normalized = message.toLowerCase();
    if (
      normalized.includes('timeout') ||
      normalized.includes('timed out') ||
      normalized.includes('econnreset') ||
      normalized.includes('econnrefused') ||
      normalized.includes('etimedout') ||
      normalized.includes('enotfound') ||
      normalized.includes('socket hang up') ||
      normalized.includes('network')
    ) {
      return { transient: true, reason: message };
    }

    return { transient: true, reason: message };
  }

  private extractStatusCode(error: unknown): number | undefined {
    if (typeof error !== 'object' || error === null) {
      return undefined;
    }

    const candidate = error as {
      status?: unknown;
      statusCode?: unknown;
      response?: { status?: unknown };
    };

    const raw = candidate.status ?? candidate.statusCode ?? candidate.response?.status;
    return typeof raw === 'number' ? raw : undefined;
  }

  private computeBackoffDelay(attempt: number): number {
    const exponential = Math.min(BASE_BACKOFF_MS * 2 ** (attempt - 1), MAX_BACKOFF_MS);
    const jitter = Math.random() * BASE_BACKOFF_MS;
    return Math.round(exponential + jitter);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Records a dead-letter entry and raises an alert for a notification that
   * could not be delivered. Financial-status notifications are escalated.
   */
  private async handleDeliveryFailure(notification: Notification, error: unknown): Promise<void> {
    const isFinancial = FINANCIAL_STATUS_TYPES.has(notification.type);
    const reason = error instanceof Error ? error.message : String(error);

    logger.error(
      `Dead-lettering notification for event ${notification.eventId ?? 'unknown'} ` +
        `(type=${notification.type}, financial=${isFinancial}): ${reason}`,
    );

    try {
      await this.notificationRepository.createDeadLetter({
        notification,
        reason,
        attempts: MAX_DELIVERY_ATTEMPTS,
        isFinancial,
      });
    } catch (deadLetterError) {
      logger.error(
        `Failed to persist dead-letter record for event ${notification.eventId ?? 'unknown'}: ${deadLetterError}`,
      );
    }

    captureException(error, {
      eventId: notification.eventId,
      notificationType: notification.type,
      isFinancial,
      deadLettered: true,
    });
  }
}
