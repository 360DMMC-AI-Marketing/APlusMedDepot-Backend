import { supabaseAdmin } from "../config/supabase";
import type { PaymentRecord, LogPaymentEventData } from "../types/payment.types";

type PgError = { code?: string; message?: string };

function isUniqueViolation(err: unknown): boolean {
  const e = err as PgError | null;
  if (!e) return false;
  return e.code === "23505" || /duplicate key|unique/i.test(e.message ?? "");
}

export class PaymentAuditService {
  /**
   * Insert a payment audit row. Returns true if inserted, false if the
   * stripe_event_id already exists (DB-level webhook dedup via UNIQUE INDEX
   * payments_stripe_event_id_unique — see migration 039).
   */
  static async logPaymentEvent(data: LogPaymentEventData): Promise<boolean> {
    const { error } = await supabaseAdmin.from("payments").insert({
      order_id: data.orderId,
      stripe_payment_intent_id: data.stripePaymentIntentId,
      amount: data.amount,
      currency: data.currency ?? "usd",
      status: data.status,
      payment_method: data.paymentMethod,
      failure_reason: data.failureReason,
      stripe_event_id: data.stripeEventId,
      paid_at: data.paidAt,
      metadata: data.metadata ?? {},
    });

    if (error) {
      if (isUniqueViolation(error)) {
        console.log(
          `[PAYMENT_AUDIT] Duplicate stripe_event_id ${data.stripeEventId} — already processed`,
        );
        return false;
      }
      console.error(`[PAYMENT_AUDIT] Failed to insert payment row: ${error.message}`);
    }
    return !error;
  }

  static async getPaymentHistory(orderId: string): Promise<PaymentRecord[]> {
    const { data: payments } = await supabaseAdmin
      .from("payments")
      .select(
        "id, order_id, stripe_payment_intent_id, amount, currency, status, stripe_charge_id, payment_method, failure_reason, stripe_event_id, paid_at, metadata, created_at",
      )
      .eq("order_id", orderId)
      .order("created_at", { ascending: true });

    type PaymentRow = {
      id: string;
      order_id: string;
      stripe_payment_intent_id: string;
      amount: string | number;
      currency: string;
      status: string;
      stripe_charge_id: string | null;
      payment_method: string | null;
      failure_reason: string | null;
      stripe_event_id: string | null;
      paid_at: string | null;
      metadata: Record<string, unknown> | null;
      created_at: string;
    };
    const rows = (payments ?? []) as unknown as PaymentRow[];

    return rows.map((row) => ({
      id: row.id,
      orderId: row.order_id,
      stripePaymentIntentId: row.stripe_payment_intent_id,
      amount: Number(row.amount),
      currency: row.currency,
      status: row.status,
      stripeChargeId: row.stripe_charge_id,
      paymentMethod: row.payment_method,
      failureReason: row.failure_reason,
      stripeEventId: row.stripe_event_id,
      paidAt: row.paid_at,
      metadata: row.metadata,
      createdAt: row.created_at,
    }));
  }

  static async getPaymentByIntentId(paymentIntentId: string): Promise<PaymentRecord | null> {
    const { data: payment } = await supabaseAdmin
      .from("payments")
      .select(
        "id, order_id, stripe_payment_intent_id, amount, currency, status, stripe_charge_id, payment_method, failure_reason, stripe_event_id, paid_at, metadata, created_at",
      )
      .eq("stripe_payment_intent_id", paymentIntentId)
      .limit(1)
      .single();

    if (!payment) {
      return null;
    }

    type PaymentRow = {
      id: string;
      order_id: string;
      stripe_payment_intent_id: string;
      amount: string | number;
      currency: string;
      status: string;
      stripe_charge_id: string | null;
      payment_method: string | null;
      failure_reason: string | null;
      stripe_event_id: string | null;
      paid_at: string | null;
      metadata: Record<string, unknown> | null;
      created_at: string;
    };
    const row = payment as unknown as PaymentRow;

    return {
      id: row.id,
      orderId: row.order_id,
      stripePaymentIntentId: row.stripe_payment_intent_id,
      amount: Number(row.amount),
      currency: row.currency,
      status: row.status,
      stripeChargeId: row.stripe_charge_id,
      paymentMethod: row.payment_method,
      failureReason: row.failure_reason,
      stripeEventId: row.stripe_event_id,
      paidAt: row.paid_at,
      metadata: row.metadata,
      createdAt: row.created_at,
    };
  }
}
