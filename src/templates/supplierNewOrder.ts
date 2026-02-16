import { baseLayout, escapeHtml } from "./baseLayout";

export type SupplierOrderItem = {
  name?: string;
  quantity?: number;
  unit_price?: number;
  subtotal?: number;
};

export type SupplierOrderData = {
  items?: SupplierOrderItem[];
  shipping_address?: string | ShippingAddress;
  commission_breakdown?: {
    sale_amount?: number;
    commission_rate?: number;
    commission_amount?: number;
    payout_amount?: number;
  };
};

export type ShippingAddress = {
  name?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
};

const formatMoney = (value?: number): string => {
  if (typeof value !== "number" || Number.isNaN(value)) return "N/A";
  return `$${value.toFixed(2)}`;
};

const formatRate = (value?: number): string => {
  if (typeof value !== "number" || Number.isNaN(value)) return "N/A";
  const rate = value <= 1 ? value * 100 : value;
  return `${rate.toFixed(2)}%`;
};

const formatQuantity = (value?: number): string => {
  if (typeof value !== "number" || Number.isNaN(value)) return "N/A";
  return String(value);
};

const renderAddress = (address?: string | ShippingAddress): string => {
  if (!address) {
    return '<div class="muted">No shipping address provided.</div>';
  }
  if (typeof address === "string") {
    return `<div>${escapeHtml(address)}</div>`;
  }
  const parts = [
    address.name,
    address.line1,
    address.line2,
    address.city,
    address.state,
    address.postal_code,
    address.country,
  ].filter((part): part is string => typeof part === "string" && part.trim().length > 0);
  if (parts.length === 0) {
    return '<div class="muted">No shipping address provided.</div>';
  }
  return `<div>${parts.map((part) => escapeHtml(part)).join("<br />")}</div>`;
};

export const generateSupplierNewOrderHtml = (data: SupplierOrderData): string => {
  const items = data.items ?? [];
  const rows =
    items.length === 0
      ? '<tr><td colspan="4" class="muted">No items</td></tr>'
      : items
          .map((item) => {
            const name = escapeHtml(item.name ?? "Item");
            const quantity = formatQuantity(item.quantity);
            const unitPrice = formatMoney(item.unit_price);
            const subtotal = formatMoney(item.subtotal);
            return `<tr>
  <td>${name}</td>
  <td>${quantity}</td>
  <td>${unitPrice}</td>
  <td>${subtotal}</td>
</tr>`;
          })
          .join("");

  const breakdown = data.commission_breakdown ?? {};

  const body = `
    <p>You have a new order containing the items listed below.</p>
    <h2 style="margin-top: 24px;">Items</h2>
    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th>Qty</th>
          <th>Unit Price</th>
          <th>Subtotal</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
    <h2 style="margin-top: 24px;">Commission Breakdown</h2>
    <table>
      <tbody>
        <tr>
          <td>Sale Amount</td>
          <td>${formatMoney(breakdown.sale_amount)}</td>
        </tr>
        <tr>
          <td>Commission Rate</td>
          <td>${formatRate(breakdown.commission_rate)}</td>
        </tr>
        <tr>
          <td>Commission Amount</td>
          <td>${formatMoney(breakdown.commission_amount)}</td>
        </tr>
        <tr>
          <td><strong>Payout Amount</strong></td>
          <td><strong>${formatMoney(breakdown.payout_amount)}</strong></td>
        </tr>
      </tbody>
    </table>
    <h2 style="margin-top: 24px;">Shipping Address</h2>
    ${renderAddress(data.shipping_address)}
  `;

  return baseLayout({
    title: "New Supplier Order",
    preheader: "New supplier order received",
    body,
  });
};
