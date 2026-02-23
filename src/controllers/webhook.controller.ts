import { Request, Response } from "express";

import { WebhookService } from "../services/webhook.service";
import { logWebhookVerificationFailure, logWebhookProcessed } from "../utils/securityLogger";

export class WebhookController {
  static async handleWebhook(req: Request, res: Response): Promise<void> {
    const signature = req.headers["stripe-signature"];
    const clientIp = req.ip ?? req.socket.remoteAddress ?? "unknown";

    if (!signature || typeof signature !== "string") {
      logWebhookVerificationFailure(clientIp, "Missing stripe-signature header");
      res.status(400).json({ error: "Missing stripe-signature header" });
      return;
    }

    let event;
    try {
      event = WebhookService.constructEvent(req.body as Buffer, signature);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      logWebhookVerificationFailure(clientIp, message);
      res.status(400).json({ error: `Webhook signature verification failed: ${message}` });
      return;
    }

    switch (event.type) {
      case "payment_intent.succeeded":
        await WebhookService.handlePaymentSuccess(event);
        break;
      case "payment_intent.payment_failed":
        await WebhookService.handlePaymentFailure(event);
        break;
      case "charge.refunded":
        await WebhookService.handleRefund(event);
        break;
      default:
        break;
    }

    logWebhookProcessed(event.id, event.type);
    res.status(200).json({ received: true });
  }
}
