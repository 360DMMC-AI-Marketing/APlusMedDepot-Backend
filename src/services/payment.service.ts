import { getStripe } from "../config/stripe";
import { supabaseAdmin } from "../config/supabase";
import { notFound, forbidden, conflict, badRequest } from "../utils/errors";
import { onPaymentSuccess } from "./hooks/paymentHooks";
import { sendOrderConfirmation } from "./email.service";
import type { PaymentIntentResult, PaymentConfirmationResult } from "../types/payment.types";
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
        .update({ payment_status: "paid", status: "confirmed" })
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
}
