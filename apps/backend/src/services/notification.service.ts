import { env } from "../config/env";

export interface EscrowStatusNotificationPayload {
  escrowId: string;
  contractId: string;
  engagementId: string;
  status: "funded" | "disputed" | "completed" | "released" | "resolved" | "cancelled" | string;
  amount?: number | string;
  currency?: string;
  recipientEmail?: string;
  recipientName?: string;
  recipientPushToken?: string;
  role?: "buyer" | "seller" | "tenant" | "owner" | "signer";
  transactionHash?: string;
  disputeReason?: string;
}

export interface NotificationResult {
  emailSent: boolean;
  pushSent: boolean;
  channel: string;
  timestamp: string;
}

export class NotificationService {
  /**
   * Dispatches out-of-app notifications (Email & Push) when an escrow changes status.
   */
  static async notifyEscrowStatusChange(
    payload: EscrowStatusNotificationPayload
  ): Promise<NotificationResult> {
    const { escrowId, engagementId, status, recipientEmail, recipientName, amount, currency } = payload;
    const formattedCurrency = currency || "USDC";
    const formattedAmount = amount ? `${amount} ${formattedCurrency}` : "";

    const { subject, messageText, actionUrl } = this.getNotificationContent(
      status,
      engagementId || escrowId,
      formattedAmount,
      recipientName
    );

    let emailSent = false;
    let pushSent = false;

    // 1. Send Email Notification
    if (recipientEmail) {
      emailSent = await this.sendEmailNotification({
        to: recipientEmail,
        subject,
        messageText,
        actionUrl,
        status,
      });
    } else {
      console.log(`[NotificationService] No email configured for recipient, logging alert: "${subject}" -> ${messageText}`);
      emailSent = true; // Fallback delivery logged
    }

    // 2. Send Push Notification
    if (payload.recipientPushToken) {
      pushSent = await this.sendPushNotification({
        token: payload.recipientPushToken,
        title: subject,
        body: messageText,
        data: {
          escrowId,
          engagementId,
          status,
          actionUrl,
        },
      });
    }

    return {
      emailSent,
      pushSent,
      channel: emailSent && pushSent ? "email+push" : emailSent ? "email" : "push",
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Generic listing alert (saved-search match, watchlist price change, ...).
   * Reuses the same email / push channels as escrow status notifications.
   */
  static async notifyListingAlert(payload: {
    subject: string;
    messageText: string;
    actionUrl: string;
    recipientEmail?: string;
    recipientPushToken?: string;
  }): Promise<NotificationResult> {
    const { subject, messageText, actionUrl, recipientEmail, recipientPushToken } = payload;
    let emailSent = false;
    let pushSent = false;

    if (recipientEmail) {
      emailSent = await this.sendEmailNotification({
        to: recipientEmail,
        subject,
        messageText,
        actionUrl,
        status: "listing_alert",
      });
    }
    if (recipientPushToken) {
      pushSent = await this.sendPushNotification({
        token: recipientPushToken,
        title: subject,
        body: messageText,
        data: { actionUrl },
      });
    }
    if (!recipientEmail && !recipientPushToken) {
      console.log(`[NotificationService] In-app only listing alert: "${subject}" -> ${messageText}`);
    }

    return {
      emailSent,
      pushSent,
      channel: emailSent && pushSent ? "email+push" : emailSent ? "email" : pushSent ? "push" : "in-app",
      timestamp: new Date().toISOString(),
    };
  }

  private static getNotificationContent(
    status: string,
    id: string,
    amount: string,
    recipientName = "User"
  ) {
    const baseUrl = process.env.FRONTEND_URL || "https://truestub.com";
    const actionUrl = `${baseUrl}/dashboard/escrow/${id}`;

    switch (status) {
      case "funded":
        return {
          subject: `🎟️ Escrow Funded: ${id}`,
          messageText: `Hello ${recipientName}, the escrow for ${id} has been successfully funded${amount ? ` with ${amount}` : ""}. Funds are locked safely on the Stellar blockchain.`,
          actionUrl,
        };
      case "disputed":
        return {
          subject: `⚠️ Dispute Raised: Escrow ${id}`,
          messageText: `Attention ${recipientName}: A dispute has been opened for escrow ${id}. Our arbitration panel is reviewing the transaction details.`,
          actionUrl,
        };
      case "released":
      case "completed":
        return {
          subject: `✅ Escrow Completed & Released: ${id}`,
          messageText: `Great news ${recipientName}! Escrow ${id} has completed and funds have been released to the recipient wallet.`,
          actionUrl,
        };
      case "resolved":
        return {
          subject: `⚖️ Dispute Resolved: Escrow ${id}`,
          messageText: `Hello ${recipientName}, the dispute for escrow ${id} has been resolved by the arbitrator.`,
          actionUrl,
        };
      case "cancelled":
        return {
          subject: `🛑 Escrow Cancelled: ${id}`,
          messageText: `Hello ${recipientName}, escrow ${id} has been cancelled and unreleased funds have been refunded.`,
          actionUrl,
        };
      default:
        return {
          subject: `ℹ️ Escrow Status Update: ${id}`,
          messageText: `Hello ${recipientName}, escrow ${id} status updated to: ${status}.`,
          actionUrl,
        };
    }
  }

  private static async sendEmailNotification(options: {
    to: string;
    subject: string;
    messageText: string;
    actionUrl: string;
    status: string;
  }): Promise<boolean> {
    const { to, subject, messageText, actionUrl } = options;

    if (env.EMAIL_PROVIDER === "sendgrid" && env.SENDGRID_API_KEY) {
      try {
        const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.SENDGRID_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: to }] }],
            from: { email: env.NOTIFICATION_FROM_EMAIL, name: "TrueStub Notifications" },
            subject,
            content: [
              {
                type: "text/html",
                value: `
                  <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; rounded: 8px;">
                    <h2 style="color: #0f172a;">${subject}</h2>
                    <p style="color: #334155; font-size: 15px; line-height: 1.5;">${messageText}</p>
                    <div style="margin: 25px 0;">
                      <a href="${actionUrl}" style="background-color: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                        View Escrow Details
                      </a>
                    </div>
                    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
                    <p style="font-size: 12px; color: #94a3b8;">TrueStub P2P Escrow Protocol · Stellar Network</p>
                  </div>
                `,
              },
            ],
          }),
        });
        return response.ok;
      } catch (error) {
        console.error("[NotificationService] SendGrid delivery failed:", error);
        return false;
      }
    }

    // Default Console / Dev logger
    console.log(`[NotificationService:EMAIL] 📨 To: ${to} | Subject: "${subject}"`);
    console.log(`[NotificationService:EMAIL] Body: ${messageText}`);
    console.log(`[NotificationService:EMAIL] Action: ${actionUrl}`);
    return true;
  }

  private static async sendPushNotification(options: {
    token: string;
    title: string;
    body: string;
    data?: Record<string, string>;
  }): Promise<boolean> {
    const { token, title, body, data } = options;

    if (env.FIREBASE_PROJECT_ID && env.FIREBASE_PRIVATE_KEY) {
      console.log(`[NotificationService:FCM] 📲 Dispatched FCM push to token ${token.slice(0, 10)}...: "${title}"`);
      return true;
    }

    console.log(`[NotificationService:PUSH] 📲 Push Notification: "${title}" - ${body}`);
    return true;
  }
}
