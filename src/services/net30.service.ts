import { supabaseAdmin } from "../config/supabase";
import { AppError, notFound, forbidden, conflict } from "../utils/errors";
import { CreditService } from "./credit.service";
import { onPaymentSuccess } from "./hooks/paymentHooks";
import type { Net30OrderResult } from "../types/credit.types";

type OrderRow = {
  id: string;
  customer_id: string;
  status: string;
  payment_status: string;
  payment_intent_id: string | null;
  paypal_order_id: string | null;
  payment_method: string | null;
  total_amount: string;
  order_number: string;
};

export class Net30Service {
  static async placeNet30Order(orderId: string, userId: string): Promise<Net30OrderResult> {
    const { data: orderData, error } = await supabaseAdmin
      .from("orders")
      .select(
        "id, customer_id, status, payment_status, payment_intent_id, paypal_order_id, payment_method, total_amount, order_number",
      )
      .eq("id", orderId)
      .single();

    if (error || !orderData) {
      throw notFound("Order");
    }

    const order = orderData as unknown as OrderRow;

    if (order.customer_id !== userId) {
      throw forbidden("You do not own this order");
    }

    if (order.status !== "pending_payment") {
      throw conflict("Order is not awaiting payment");
    }

    if (order.payment_intent_id) {
      throw conflict("Payment already initiated via Stripe");
    }

    if (order.paypal_order_id) {
      throw conflict("Payment already initiated via PayPal");
    }

    if (order.payment_method === "net30") {
      throw conflict("Net30 payment already initiated");
    }

    const orderAmount = Number(order.total_amount);
    const check = await CreditService.checkCreditEligibility(userId, orderAmount);
    if (!check.eligible) {
      throw new AppError(check.reason || "Not eligible for Net30 terms", 403, "CREDIT_INELIGIBLE");
    }

    // Deduct credit atomically — if insufficient, throws before order is placed
    await CreditService.deductCredit(userId, orderAmount);

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);

    // Update order
    await supabaseAdmin
      .from("orders")
      .update({
        status: "confirmed",
        payment_status: "paid",
        payment_method: "net30",
      })
      .eq("id", orderId)
      .neq("payment_status", "paid");

    // Create invoice
    const { data: invoice } = await supabaseAdmin
      .from("invoices")
      .insert({
        order_id: orderId,
        user_id: userId,
        amount: orderAmount,
        status: "pending",
        due_date: dueDate.toISOString(),
      })
      .select("id, due_date")
      .single();

    const invoiceRow = invoice as unknown as { id: string; due_date: string } | null;

    // Trigger commission calculation — SAME hook as Stripe and PayPal
    try {
      await onPaymentSuccess(orderId);
    } catch (hookErr) {
      console.error("Payment success hook failed for Net30 order:", hookErr);
    }

    return {
      orderId,
      invoiceId: invoiceRow?.id || null,
      invoiceDueDate: dueDate.toISOString(),
      amount: orderAmount,
      status: "confirmed",
    };
  }
}
