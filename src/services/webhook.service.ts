import type Stripe from "stripe";

import { getStripe } from "../config/stripe";
import { getEnv } from "../config/env";
import { supabaseAdmin } from "../config/supabase";
import { onPaymentSuccess, onPaymentRefunded } from "./hooks/paymentHooks";
import { sendOrderConfirmation } from "./email.service";
import { logSuspiciousActivity } from "../utils/securityLogger";

const MAX_PROCESSED_EVENTS = 10_000;
const processedEvents = new Set<string>();

export class WebhookService {
  static isDuplicate(eventId: string): boolean {
    if (processedEvents.has(eventId)) {
      return true;
    }
    if (processedEvents.size >= MAX_PROCESSED_EVENTS) {
      const oldest = processedEvents.values().next().value;
      if (oldest !== undefined) {
        processedEvents.delete(oldest);
      }
    }
    processedEvents.add(eventId);
    return false;
  }

  static clearProcessedEvents(): void {
    processedEvents.clear();
  }

  static getProcessedEventsSize(): number {
    return processedEvents.size;
  }

  static constructEvent(rawBody: Buffer, signature: string): Stripe.Event {
    const stripe = getStripe();
    const env = getEnv();
    return stripe.webhooks.constructEvent(
      rawBody,
      signature,
      env.STRIPE_WEBHOOK_SECRET,
      env.STRIPE_WEBHOOK_TOLERANCE,
    );
  }

  static async handlePaymentSuccess(event: Stripe.Event): Promise<void> {
    if (WebhookService.isDuplicate(event.id)) {
      logSuspiciousActivity("duplicate_webhook_event", {
        eventId: event.id,
        eventType: event.type,
      });
      return;
    }

    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    const orderId = paymentIntent.metadata?.order_id;

    if (!orderId) {
      console.warn("[WEBHOOK] payment_intent.succeeded missing order_id in metadata");
      return;
    }

    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select(
        "id, customer_id, payment_status, order_number, total_amount, created_at, order_items(id, product_name, quantity, unit_price, subtotal, suppliers(business_name))",
      )
      .eq("id", orderId)
      .single();

    if (error || !order) {
      console.warn(`[WEBHOOK] Order ${orderId} not found`);
      return;
    }

    if (order.payment_status === "paid") {
      return;
    }

    await supabaseAdmin
      .from("orders")
      .update({ payment_status: "paid", status: "confirmed" })
      .eq("id", orderId);

    await supabaseAdmin.from("payments").insert({
      order_id: orderId,
      stripe_payment_intent_id: paymentIntent.id,
      amount: paymentIntent.amount / 100,
      currency: paymentIntent.currency,
      status: "succeeded",
      payment_method: paymentIntent.payment_method_types?.[0] ?? "card",
      paid_at: new Date().toISOString(),
      stripe_event_id: event.id,
    });

    await onPaymentSuccess(orderId);

    try {
      const { data: customer } = await supabaseAdmin
        .from("users")
        .select("email")
        .eq("id", order.customer_id)
        .single();

      if (customer?.email) {
        const items = (order.order_items as unknown as Array<Record<string, unknown>>) ?? [];
        sendOrderConfirmation(
          {
            id: order.order_number ?? orderId,
            createdAt: order.created_at as string | undefined,
            status: "confirmed",
            total: Number(order.total_amount),
            items: items.map((item) => ({
              name: item.product_name as string,
              quantity: item.quantity as number,
              unitPrice: Number(item.unit_price),
              lineSubtotal: Number(item.subtotal),
              supplierName: (item.suppliers as { business_name?: string } | null)?.business_name,
            })),
          },
          customer.email,
        );
      }
    } catch (err) {
      console.error("[WEBHOOK] Failed to send order confirmation email:", err);
    }
  }

  static async handlePaymentFailure(event: Stripe.Event): Promise<void> {
    if (WebhookService.isDuplicate(event.id)) {
      logSuspiciousActivity("duplicate_webhook_event", {
        eventId: event.id,
        eventType: event.type,
      });
      return;
    }

    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    const orderId = paymentIntent.metadata?.order_id;

    if (!orderId) {
      console.warn("[WEBHOOK] payment_intent.payment_failed missing order_id in metadata");
      return;
    }

    await supabaseAdmin
      .from("orders")
      .update({ payment_status: "failed" })
      .eq("id", orderId)
      .not("payment_status", "in", '("paid","refunded")');

    const failureReason = paymentIntent.last_payment_error?.message ?? "Unknown payment failure";

    await supabaseAdmin.from("payments").insert({
      order_id: orderId,
      stripe_payment_intent_id: paymentIntent.id,
      amount: paymentIntent.amount / 100,
      currency: paymentIntent.currency,
      status: "failed",
      failure_reason: failureReason,
      stripe_event_id: event.id,
    });
  }

  static async handleRefund(event: Stripe.Event): Promise<void> {
    if (WebhookService.isDuplicate(event.id)) {
      logSuspiciousActivity("duplicate_webhook_event", {
        eventId: event.id,
        eventType: event.type,
      });
      return;
    }

    const charge = event.data.object as Stripe.Charge;
    const paymentIntentId =
      typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;

    if (!paymentIntentId) {
      console.warn("[WEBHOOK] charge.refunded missing payment_intent");
      return;
    }

    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select("id, payment_status")
      .eq("payment_intent_id", paymentIntentId)
      .single();

    if (error || !order) {
      console.warn(`[WEBHOOK] No order found for payment_intent ${paymentIntentId}`);
      return;
    }

    const isFullRefund = charge.amount_refunded === charge.amount;

    if (isFullRefund) {
      await supabaseAdmin
        .from("orders")
        .update({ payment_status: "refunded", status: "cancelled" })
        .eq("id", order.id);

      await onPaymentRefunded(order.id);
    } else {
      await supabaseAdmin
        .from("orders")
        .update({ payment_status: "partially_refunded" })
        .eq("id", order.id);
    }
  }
}
