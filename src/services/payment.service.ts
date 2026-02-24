import type { SupabaseClient } from "@supabase/supabase-js";

import { getStripe } from "../config/stripe";
import { supabaseAdmin } from "../config/supabase";
import { notFound, forbidden, conflict, badRequest } from "../utils/errors";
import { incrementStock } from "../utils/inventory";
import { onPaymentSuccess } from "./hooks/paymentHooks";
import { onPaymentRefunded } from "./hooks/paymentHooks";
import { sendOrderConfirmation, sendOrderStatusUpdate } from "./email.service";
import { PaymentAuditService } from "./paymentAudit.service";
import type {
  PaymentIntentResult,
  PaymentConfirmationResult,
  RefundResult,
  PaymentAttempt,
} from "../types/payment.types";
import type Stripe from "stripe";

export class PaymentService {
  static async createPaymentIntent(
    orderId: string,
    customerId: string,
  ): Promise<PaymentIntentResult> {
    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select("id, customer_id, status, payment_intent_id, total_amount, order_number")
      .eq("id", orderId)
      .single();

    if (error || !order) {
      throw notFound("Order");
    }

    if (order.customer_id !== customerId) {
      throw forbidden();
    }

    if (order.status !== "pending_payment") {
      throw conflict("Order is not awaiting payment");
    }

    if (order.payment_intent_id) {
      throw conflict("Payment already initiated");
    }

    const amountInCents = Math.round(Number(order.total_amount) * 100);

    const stripe = getStripe();
    const pi = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: "usd",
      metadata: {
        order_id: orderId,
        order_number: order.order_number,
        customer_id: customerId,
      },
      automatic_payment_methods: { enabled: true },
    });

    await supabaseAdmin
      .from("orders")
      .update({ payment_intent_id: pi.id, payment_status: "processing" })
      .eq("id", orderId);

    return { clientSecret: pi.client_secret!, paymentIntentId: pi.id };
  }

  static async confirmPayment(
    orderId: string,
    customerId: string,
  ): Promise<PaymentConfirmationResult> {
    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select(
        "id, customer_id, status, payment_intent_id, payment_status, total_amount, order_number, created_at, shipping_address, order_items(id, product_name, quantity, unit_price, subtotal, suppliers(business_name))",
      )
      .eq("id", orderId)
      .single();

    if (error || !order) {
      throw notFound("Order");
    }

    if (order.customer_id !== customerId) {
      throw forbidden();
    }

    if (order.payment_status === "paid") {
      return { orderId, status: "paid", paidAt: new Date().toISOString() };
    }

    if (!order.payment_intent_id) {
      throw badRequest("No payment initiated");
    }

    const stripe = getStripe();
    const pi = await stripe.paymentIntents.retrieve(order.payment_intent_id);

    if (pi.status === "processing") {
      return { orderId, status: "processing", paidAt: "" };
    }

    if (pi.status === "canceled") {
      return { orderId, status: "canceled", paidAt: "" };
    }

    if (pi.status === "succeeded") {
      await supabaseAdmin
        .from("orders")
        .update({ payment_status: "paid", status: "payment_confirmed" })
        .eq("id", orderId)
        .eq("payment_status", "processing");

      await onPaymentSuccess(orderId);

      const { data: customer } = await supabaseAdmin
        .from("users")
        .select("email")
        .eq("id", customerId)
        .single();

      if (customer?.email) {
        const items = (order.order_items as unknown as Array<Record<string, unknown>>) ?? [];
        sendOrderConfirmation(
          {
            id: order.order_number ?? orderId,
            createdAt: order.created_at as string | undefined,
            status: "payment_confirmed",
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

      return { orderId, status: "paid", paidAt: new Date().toISOString() };
    }

    return { orderId, status: pi.status, paidAt: "" };
  }

  static async getPaymentStatus(
    orderId: string,
    customerId: string,
  ): Promise<{ paymentStatus: string; orderStatus: string }> {
    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select("id, customer_id, payment_status, status")
      .eq("id", orderId)
      .single();

    if (error || !order) {
      throw notFound("Order");
    }

    if (order.customer_id !== customerId) {
      throw forbidden();
    }

    return { paymentStatus: order.payment_status, orderStatus: order.status };
  }

  static async getPaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
    const stripe = getStripe();
    return stripe.paymentIntents.retrieve(paymentIntentId);
  }

  static async refundPayment(
    orderId: string,
    customerId: string,
    reason?: string,
  ): Promise<RefundResult> {
    // 1. Fetch order and verify ownership
    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select(
        "id, customer_id, status, payment_status, payment_intent_id, total_amount, order_number",
      )
      .eq("id", orderId)
      .single();

    if (error || !order) {
      throw notFound("Order");
    }

    if (order.customer_id !== customerId) {
      throw forbidden();
    }

    // 2. Eligibility checks
    if (order.payment_status !== "paid") {
      throw conflict("Order payment status must be 'paid' to request a refund");
    }

    const NON_REFUNDABLE_STATUSES = ["shipped", "delivered", "cancelled"];
    if (NON_REFUNDABLE_STATUSES.includes(order.status)) {
      throw conflict(`Cannot refund an order with status '${order.status}'`);
    }

    if (!order.payment_intent_id) {
      throw badRequest("No payment intent associated with this order");
    }

    // 3. Process Stripe refund — if this fails, nothing else happens
    const stripe = getStripe();
    const refund = await stripe.refunds.create({
      payment_intent: order.payment_intent_id,
      reason: "requested_by_customer",
    });

    // 4. Update order to cancelled / refunded
    await supabaseAdmin
      .from("orders")
      .update({ payment_status: "refunded", status: "cancelled" })
      .eq("id", orderId);

    // 5. Restore inventory atomically
    const { data: orderItems } = await supabaseAdmin
      .from("order_items")
      .select("product_id, quantity")
      .eq("order_id", orderId);

    type ItemRow = { product_id: string; quantity: number };
    const itemRows = (orderItems ?? []) as unknown as ItemRow[];

    if (itemRows.length > 0) {
      const items = itemRows.map((item) => ({
        productId: item.product_id,
        quantity: item.quantity,
      }));
      await incrementStock(items, supabaseAdmin as unknown as SupabaseClient);
    }

    // 6. Call payment refunded hook
    await onPaymentRefunded(orderId);

    // 7. Log refund payment event
    const amount = Number(order.total_amount);
    await PaymentAuditService.logPaymentEvent({
      orderId,
      stripePaymentIntentId: order.payment_intent_id,
      amount: -amount,
      status: "refunded",
    });

    // 8. Insert order_status_history
    await supabaseAdmin.from("order_status_history").insert({
      order_id: orderId,
      from_status: order.status,
      to_status: "cancelled",
      changed_by: customerId,
      reason: reason ?? "Customer requested refund",
    });

    // 9. Send cancellation email (fire-and-forget)
    const { data: customer } = await supabaseAdmin
      .from("users")
      .select("email")
      .eq("id", customerId)
      .single();

    if (customer?.email) {
      sendOrderStatusUpdate(
        { id: order.order_number ?? orderId },
        customer.email,
        "cancelled — refund issued",
      );
    }

    // 10. Return result
    return {
      refundId: refund.id,
      status: "refunded",
      amount,
    };
  }

  static async retryPayment(orderId: string, customerId: string): Promise<PaymentIntentResult> {
    // 1. Fetch order and verify ownership
    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select(
        "id, customer_id, status, payment_intent_id, total_amount, order_number, payment_status",
      )
      .eq("id", orderId)
      .single();

    if (error || !order) {
      throw notFound("Order");
    }

    if (order.customer_id !== customerId) {
      throw forbidden();
    }

    // 2. Check payment status eligibility
    if (order.payment_status === "paid") {
      throw conflict("Order already paid");
    }
    if (order.payment_status === "refunded") {
      throw conflict("Order has been refunded");
    }
    if (order.payment_status !== "pending" && order.payment_status !== "failed") {
      throw conflict("Order is not eligible for payment retry");
    }

    // 3. Check attempt count
    const { data: attempts } = await supabaseAdmin
      .from("payments")
      .select("id")
      .eq("order_id", orderId);

    const attemptCount = (attempts ?? []).length;
    if (attemptCount >= 3) {
      throw conflict("Maximum payment attempts exceeded. Contact support.");
    }

    // 4. Cancel old PaymentIntent if exists
    const stripe = getStripe();
    if (order.payment_intent_id) {
      try {
        await stripe.paymentIntents.cancel(order.payment_intent_id);
      } catch {
        // Already canceled or can't cancel — proceed anyway
      }
    }

    // 5. Create new PaymentIntent
    const amountInCents = Math.round(Number(order.total_amount) * 100);
    const pi = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: "usd",
      metadata: {
        order_id: orderId,
        order_number: order.order_number,
        customer_id: customerId,
      },
      automatic_payment_methods: { enabled: true },
    });

    // 6. Update order with new payment_intent_id
    await supabaseAdmin
      .from("orders")
      .update({ payment_intent_id: pi.id, payment_status: "processing" })
      .eq("id", orderId);

    // 7. Log payment attempt
    await PaymentAuditService.logPaymentEvent({
      orderId,
      stripePaymentIntentId: pi.id,
      amount: Number(order.total_amount),
      status: "initiated",
    });

    return { clientSecret: pi.client_secret!, paymentIntentId: pi.id };
  }

  static async getPaymentAttempts(orderId: string, customerId: string): Promise<PaymentAttempt[]> {
    // 1. Fetch order and verify ownership
    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select("id, customer_id")
      .eq("id", orderId)
      .single();

    if (error || !order) {
      throw notFound("Order");
    }

    if (order.customer_id !== customerId) {
      throw forbidden();
    }

    // 2. Fetch payment attempts
    const { data: payments } = await supabaseAdmin
      .from("payments")
      .select("id, status, amount, created_at, failure_reason")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true });

    type PaymentRow = {
      id: string;
      status: string;
      amount: string | number;
      created_at: string;
      failure_reason: string | null;
    };
    const rows = (payments ?? []) as unknown as PaymentRow[];

    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      amount: Number(row.amount),
      createdAt: row.created_at,
      failureReason: row.failure_reason,
    }));
  }
}
