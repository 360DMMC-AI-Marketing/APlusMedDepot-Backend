import { baseLayout, escapeHtml } from "./baseLayout";

export type OrderConfirmationItem = {
  name?: string;
  quantity?: number;
  unit_price?: number;
  subtotal?: number;
  supplier_name?: string;
};

export type OrderConfirmationData = {
  order: {
    id: string;
    created_at?: string;
    status?: string;
  };
  items?: OrderConfirmationItem[];
  totals?: {
    subtotal?: number;
    tax?: number;
    total?: number;
  };
  shipping_address?: string | ShippingAddress;
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

const formatDate = (value?: string): string => {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  return date.toISOString().split("T")[0];
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

export const generateOrderConfirmationHtml = (data: OrderConfirmationData): string => {
  const items = data.items ?? [];
  const rows =
    items.length === 0
      ? '<tr><td colspan="5" class="muted">No items</td></tr>'
      : items
          .map((item) => {
            const name = escapeHtml(item.name ?? "Item");
            const supplier = escapeHtml(item.supplier_name ?? "N/A");
            const quantity = formatQuantity(item.quantity);
            const unitPrice = formatMoney(item.unit_price);
            const subtotal = formatMoney(item.subtotal);
            return `<tr>
  <td>${name}</td>
  <td>${supplier}</td>
  <td>${quantity}</td>
  <td>${unitPrice}</td>
  <td>${subtotal}</td>
</tr>`;
          })
          .join("");

  const body = `
    <p>Thank you for your order.</p>
    <p><strong>Order Number:</strong> ${escapeHtml(data.order.id)}</p>
    <p><strong>Order Date:</strong> ${formatDate(data.order.created_at)}</p>
    <p><strong>Status:</strong> ${escapeHtml(data.order.status ?? "N/A")}</p>
    <h2 style="margin-top: 24px;">Items</h2>
    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th>Supplier</th>
          <th>Qty</th>
          <th>Unit Price</th>
          <th>Subtotal</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
    <h2 style="margin-top: 24px;">Totals</h2>
    <table>
      <tbody>
        <tr>
          <td>Subtotal</td>
          <td>${formatMoney(data.totals?.subtotal)}</td>
        </tr>
        <tr>
          <td>Tax</td>
          <td>${formatMoney(data.totals?.tax)}</td>
        </tr>
        <tr>
          <td><strong>Total</strong></td>
          <td><strong>${formatMoney(data.totals?.total)}</strong></td>
        </tr>
      </tbody>
    </table>
    <h2 style="margin-top: 24px;">Shipping Address</h2>
    ${renderAddress(data.shipping_address)}
  `;

  return baseLayout({
    title: "Order Confirmation",
    preheader: `Order ${data.order.id} confirmed`,
    body,
  });
};
