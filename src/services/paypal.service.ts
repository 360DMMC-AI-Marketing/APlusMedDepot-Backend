import { getPayPalAccessToken, isPayPalConfigured, PAYPAL_API_BASE } from "../config/paypal";
import { supabaseAdmin } from "../config/supabase";
import {
  AppError,
  notFound,
  forbidden,
  conflict,
  badRequest,
  serviceUnavailable,
} from "../utils/errors";
import { onPaymentSuccess } from "./hooks/paymentHooks";
import type { PayPalOrderResult, PayPalCaptureResult } from "../types/paypal.types";

type OrderRow = {
  id: string;
  customer_id: string;
  status: string;
  payment_status: string;
  payment_intent_id: string | null;
  paypal_order_id: string | null;
  total_amount: string;
  order_number: string;
};

type PayPalLink = { rel: string; href: string };

type PayPalOrderResponse = {
  id: string;
  status: string;
  links?: PayPalLink[];
};

type PayPalCaptureResponse = {
  id: string;
  status: string;
  purchase_units?: Array<{
    payments?: {
      captures?: Array<{ id: string }>;
    };
  }>;
};

export class PayPalService {
  static async createOrder(orderId: string, customerId: string): Promise<PayPalOrderResult> {
    if (!isPayPalConfigured()) {
      throw serviceUnavailable("PayPal payments are not currently available");
    }

    const { data: orderData, error } = await supabaseAdmin
      .from("orders")
      .select(
        "id, customer_id, status, payment_status, payment_intent_id, paypal_order_id, total_amount, order_number",
      )
      .eq("id", orderId)
      .single();

    if (error || !orderData) {
      throw notFound("Order");
    }

    const order = orderData as unknown as OrderRow;

    if (order.customer_id !== customerId) {
      throw forbidden("You do not own this order");
    }

    if (order.status !== "pending_payment") {
      throw conflict("Order is not awaiting payment");
    }

    if (order.payment_intent_id) {
      throw conflict("Payment already initiated via Stripe. Cannot use PayPal.");
    }

    if (order.paypal_order_id) {
      throw conflict("PayPal payment already initiated for this order");
    }

    const accessToken = await getPayPalAccessToken();

    const response = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: orderId,
            description: `APlusMedDepot Order ${order.order_number}`,
            custom_id: orderId,
            amount: {
              currency_code: "USD",
              value: Number(order.total_amount).toFixed(2),
            },
          },
        ],
        application_context: {
          brand_name: "APlusMedDepot",
          landing_page: "LOGIN",
          user_action: "PAY_NOW",
          return_url: `${process.env.FRONTEND_URL || "http://localhost:5173"}/orders/paypal-success`,
          cancel_url: `${process.env.FRONTEND_URL || "http://localhost:5173"}/orders/paypal-cancel`,
        },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("PayPal create order failed:", errorBody);
      throw new AppError("Failed to create PayPal order", 502, "PAYPAL_ERROR");
    }

    const paypalOrder = (await response.json()) as PayPalOrderResponse;

    await supabaseAdmin
      .from("orders")
      .update({
        paypal_order_id: paypalOrder.id,
        payment_status: "processing",
        payment_method: "paypal",
      })
      .eq("id", orderId);

    const approveLink = paypalOrder.links?.find((l) => l.rel === "approve");
    const approvalUrl = approveLink?.href || "";

    return { paypalOrderId: paypalOrder.id, approvalUrl };
  }

  static async captureOrder(orderId: string, customerId: string): Promise<PayPalCaptureResult> {
    const { data: orderData, error } = await supabaseAdmin
      .from("orders")
      .select(
        "id, customer_id, status, payment_status, paypal_order_id, total_amount, order_number",
      )
      .eq("id", orderId)
      .single();

    if (error || !orderData) {
      throw notFound("Order");
    }

    const order = orderData as unknown as OrderRow;

    if (order.customer_id !== customerId) {
      throw forbidden("You do not own this order");
    }

    // Idempotency: if already paid, return success
    if (order.payment_status === "paid") {
      return { orderId, status: "paid", paidAt: new Date().toISOString() };
    }

    if (!order.paypal_order_id) {
      throw badRequest("No PayPal payment initiated for this order");
    }

    const accessToken = await getPayPalAccessToken();

    const response = await fetch(
      `${PAYPAL_API_BASE}/v2/checkout/orders/${order.paypal_order_id}/capture`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("PayPal capture failed:", errorBody);
      throw new AppError("Failed to capture PayPal payment", 502, "PAYPAL_ERROR");
    }

    const captureResult = (await response.json()) as PayPalCaptureResponse;

    if (captureResult.status === "COMPLETED") {
      const captureId = captureResult.purchase_units?.[0]?.payments?.captures?.[0]?.id || null;

      // Update order — idempotent WHERE clause
      await supabaseAdmin
        .from("orders")
        .update({
          payment_status: "paid",
          status: "confirmed",
          payment_method: "paypal",
        })
        .eq("id", orderId)
        .neq("payment_status", "paid");

      // Insert payment record
      await supabaseAdmin.from("payments").insert({
        order_id: orderId,
        amount: Number(order.total_amount),
        currency: "USD",
        status: "succeeded",
        payment_method: "paypal",
        paid_at: new Date().toISOString(),
        metadata: {
          paypal_order_id: order.paypal_order_id,
          capture_id: captureId,
        },
      });

      // Trigger commission calculation — SAME hook as Stripe
      try {
        await onPaymentSuccess(orderId);
      } catch (hookErr) {
        console.error("Payment success hook failed for PayPal order:", hookErr);
      }

      return { orderId, status: "paid", paidAt: new Date().toISOString() };
    }

    // Not completed — return current status
    return {
      orderId,
      status: captureResult.status?.toLowerCase() || "unknown",
      paidAt: null,
    };
  }
}
