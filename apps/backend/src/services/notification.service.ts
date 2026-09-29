import { Notification } from '../types/notification';
import { NotificationRepository } from '../repositories/notification.repository';
import { logger } from '../utils/logger';

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
      await this.dispatch(notification);
    } catch (error) {
      logger.error(`Failed to send notification: ${error}`);
      throw error;
    }
  }

  private async dispatch(notification: Notification): Promise<void> {
    // Existing delivery logic (email/push/etc.) is unchanged.
    await this.notificationRepository.deliver(notification);
  }
}
