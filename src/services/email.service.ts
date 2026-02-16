import type { Resend } from "resend";

import { getEnv } from "../config/env";
import { getResend } from "../config/resend";
import { baseLayout, escapeHtml } from "../templates/baseLayout";
import { generateOrderConfirmationHtml } from "../templates/orderConfirmation";
import { generateShippingNotificationHtml } from "../templates/shippingNotification";
import { generateSupplierNewOrderHtml } from "../templates/supplierNewOrder";

export type ShippingAddress = {
  name?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
};

export type EmailOrderItem = {
  id?: string;
  name?: string;
  sku?: string;
  quantity?: number;
  unitPrice?: number;
  lineSubtotal?: number;
  subtotal?: number;
  total?: number;
  commissionAmount?: number;
  commissionRate?: number;
  supplierPayout?: number;
  supplierName?: string;
};

export type EmailOrder = {
  id: string;
  createdAt?: string;
  status?: string;
  customerEmail?: string;
  items?: EmailOrderItem[];
  subtotal?: number;
  tax?: number;
  shipping?: number;
  total?: number;
  shippingAddress?: ShippingAddress | string;
};

export type TrackingInfo = {
  carrier?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  estimatedDelivery?: string;
};

type TemplateShippingAddress = {
  name?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
};

let resendClient: Resend | null = null;

export function initResend(): Resend | null {
  if (resendClient) return resendClient;
  const env = getEnv();
  if (!env.RESEND_API_KEY || env.RESEND_API_KEY.trim().length === 0) {
    console.warn("RESEND_API_KEY not configured. Skipping email.");
    return null;
  }
  resendClient = getResend();
  return resendClient;
}

const toNumber = (value: number | string | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const resolveLineSubtotal = (item: EmailOrderItem): number | null => {
  const candidates: Array<number | string | null | undefined> = [
    item.lineSubtotal,
    item.subtotal,
    item.total,
  ];
  for (const candidate of candidates) {
    const num = toNumber(candidate);
    if (num !== null) return num;
  }
  const unitPrice = toNumber(item.unitPrice);
  const quantity = typeof item.quantity === "number" ? item.quantity : null;
  if (unitPrice !== null && quantity !== null) {
    return unitPrice * quantity;
  }
  return null;
};

const resolveCommissionAmount = (
  item: EmailOrderItem,
  lineSubtotal: number | null,
): number | null => {
  const direct = toNumber(item.commissionAmount);
  if (direct !== null) return direct;
  const rate = toNumber(item.commissionRate);
  if (rate !== null && lineSubtotal !== null) return lineSubtotal * rate;
  return null;
};

const resolveSupplierPayout = (
  item: EmailOrderItem,
  lineSubtotal: number | null,
  commission: number | null,
): number | null => {
  const direct = toNumber(item.supplierPayout);
  if (direct !== null) return direct;
  if (lineSubtotal !== null && commission !== null) return lineSubtotal - commission;
  return null;
};

const sumNumbers = (values: Array<number | null>): number | null => {
  const filtered = values.filter((value): value is number => value !== null);
  if (filtered.length === 0) return null;
  return filtered.reduce((sum, value) => sum + value, 0);
};

const mapShippingAddress = (
  address?: ShippingAddress | string,
): TemplateShippingAddress | string | undefined => {
  if (!address) return undefined;
  if (typeof address === "string") return address;
  return {
    name: address.name,
    line1: address.line1,
    line2: address.line2,
    city: address.city,
    state: address.state,
    postal_code: address.postalCode,
    country: address.country,
  };
};

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const resend = initResend();
  if (!resend) return;

  const from = getEnv().FROM_EMAIL?.trim();
  if (!from) {
    console.warn("FROM_EMAIL not configured. Skipping email.");
    return;
  }

  const recipient = to?.trim();
  if (!recipient) {
    console.warn("Email recipient not provided. Skipping email.");
    return;
  }

  const payload = {
    from,
    to: recipient,
    subject,
    html,
  };

  try {
    await resend.emails.send(payload);
  } catch (error) {
    try {
      await resend.emails.send(payload);
    } catch (retryError) {
      console.error("Failed to send email after retry:", { error, retryError });
    }
  }
}

export function sendOrderConfirmation(order: EmailOrder, customerEmail: string): void {
  const orderId = order.id || "unknown";
  const items = order.items ?? [];

  const computedSubtotal = sumNumbers(items.map((item) => resolveLineSubtotal(item))) ?? 0;
  const subtotal = toNumber(order.subtotal) ?? (computedSubtotal > 0 ? computedSubtotal : null);
  const tax = toNumber(order.tax);
  const shipping = toNumber(order.shipping);
  const total =
    toNumber(order.total) ?? (subtotal !== null ? subtotal + (tax ?? 0) + (shipping ?? 0) : null);

  const subject = `Order Confirmation - ${orderId}`;
  const html = generateOrderConfirmationHtml({
    order: {
      id: orderId,
      created_at: order.createdAt,
      status: order.status,
    },
    items: items.map((item) => ({
      name: item.name ?? item.sku ?? item.id ?? "Item",
      quantity: item.quantity,
      unit_price: item.unitPrice,
      subtotal: resolveLineSubtotal(item) ?? undefined,
      supplier_name: item.supplierName,
    })),
    totals: {
      subtotal: subtotal ?? undefined,
      tax: tax ?? undefined,
      total: total ?? undefined,
    },
    shipping_address: mapShippingAddress(order.shippingAddress),
  });
  void sendEmail(customerEmail, subject, html);
}

export function sendShippingNotification(
  order: EmailOrder,
  item: EmailOrderItem,
  trackingInfo: TrackingInfo,
): void {
  const orderId = order.id || "unknown";
  const subject = `Shipping Update - Order ${orderId}`;
  const html = generateShippingNotificationHtml({
    order_id: orderId,
    item: {
      name: item.name ?? item.sku ?? item.id ?? "Item",
      quantity: item.quantity,
    },
    carrier: trackingInfo.carrier,
    tracking_number: trackingInfo.trackingNumber,
    supplier_name: item.supplierName,
  });
  const recipient = order.customerEmail ?? "";
  void sendEmail(recipient, subject, html);
}

export function sendOrderStatusUpdate(
  order: EmailOrder,
  customerEmail: string,
  newStatus: string,
): void {
  const orderId = order.id || "unknown";
  const subject = `Order ${orderId} Status Update - ${newStatus}`;
  const html = baseLayout({
    title: "Order Status Update",
    preheader: `Order ${orderId} status updated`,
    body: `
      <p>Your order status has been updated.</p>
      <p><strong>Order Number:</strong> ${escapeHtml(orderId)}</p>
      <p><strong>New Status:</strong> ${escapeHtml(newStatus)}</p>
    `,
  });
  void sendEmail(customerEmail, subject, html);
}

export function sendSupplierNewOrder(
  supplierEmail: string,
  orderItems: EmailOrderItem[],
  shippingAddress?: ShippingAddress | string,
): void {
  const lineSubtotals = orderItems.map((item) => resolveLineSubtotal(item));
  const commissions = orderItems.map((item, index) =>
    resolveCommissionAmount(item, lineSubtotals[index] ?? null),
  );
  const payouts = orderItems.map((item, index) =>
    resolveSupplierPayout(item, lineSubtotals[index] ?? null, commissions[index] ?? null),
  );

  const subtotal = sumNumbers(lineSubtotals);
  const totalCommission = sumNumbers(commissions);
  const totalPayout = sumNumbers(payouts);
  const commissionRate =
    subtotal !== null && totalCommission !== null && subtotal > 0
      ? totalCommission / subtotal
      : null;

  const subject = "New Supplier Order";
  const html = generateSupplierNewOrderHtml({
    items: orderItems.map((item) => ({
      name: item.name ?? item.sku ?? item.id ?? "Item",
      quantity: item.quantity,
      unit_price: item.unitPrice,
      subtotal: resolveLineSubtotal(item) ?? undefined,
    })),
    shipping_address: mapShippingAddress(shippingAddress),
    commission_breakdown: {
      sale_amount: subtotal ?? undefined,
      commission_rate: commissionRate ?? undefined,
      commission_amount: totalCommission ?? undefined,
      payout_amount: totalPayout ?? undefined,
    },
  });
  void sendEmail(supplierEmail, subject, html);
}
