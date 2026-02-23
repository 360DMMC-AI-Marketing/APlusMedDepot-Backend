import { Request, Response } from "express";

import { WebhookService } from "../services/webhook.service";

export class WebhookController {
  static async handleWebhook(req: Request, res: Response): Promise<void> {
    const signature = req.headers["stripe-signature"];

    if (!signature || typeof signature !== "string") {
      res.status(400).json({ error: "Missing stripe-signature header" });
      return;
    }

    let event;
    try {
      event = WebhookService.constructEvent(req.body as Buffer, signature);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error(`[WEBHOOK] Signature verification failed: ${message}`);
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
        console.log(`[WEBHOOK] Unhandled event type: ${event.type}`);
    }

    res.status(200).json({ received: true });
  }
}
