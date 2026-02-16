import { baseLayout, escapeHtml } from "./baseLayout";

export type ShippingNotificationData = {
  order_id: string;
  item: {
    name?: string;
    quantity?: number;
  };
  carrier?: string;
  tracking_number?: string;
  supplier_name?: string;
};

const formatQuantity = (value?: number): string => {
  if (typeof value !== "number" || Number.isNaN(value)) return "N/A";
  return String(value);
};

const buildTrackingUrl = (carrier?: string, tracking?: string): string | null => {
  if (!carrier || !tracking) return null;
  const normalized = carrier.trim().toLowerCase();
  if (normalized === "usps") {
    return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(tracking)}`;
  }
  if (normalized === "ups") {
    return `https://www.ups.com/track?tracknum=${encodeURIComponent(tracking)}`;
  }
  if (normalized === "fedex" || normalized === "fedex express") {
    return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(tracking)}`;
  }
  return null;
};

export const generateShippingNotificationHtml = (data: ShippingNotificationData): string => {
  const carrier = data.carrier ?? "Carrier";
  const tracking = data.tracking_number ?? "N/A";
  const trackingUrl = buildTrackingUrl(data.carrier, data.tracking_number);
  const trackingLink = trackingUrl
    ? `<a href="${trackingUrl}">${escapeHtml(trackingUrl)}</a>`
    : "Unavailable";

  const body = `
    <p>Your item has shipped.</p>
    <p><strong>Order Number:</strong> ${escapeHtml(data.order_id)}</p>
    <table>
      <tbody>
        <tr>
          <td>Item</td>
          <td>${escapeHtml(data.item.name ?? "Item")}</td>
        </tr>
        <tr>
          <td>Quantity</td>
          <td>${formatQuantity(data.item.quantity)}</td>
        </tr>
        <tr>
          <td>Supplier</td>
          <td>${escapeHtml(data.supplier_name ?? "N/A")}</td>
        </tr>
        <tr>
          <td>Carrier</td>
          <td>${escapeHtml(carrier)}</td>
        </tr>
        <tr>
          <td>Tracking Number</td>
          <td>${escapeHtml(tracking)}</td>
        </tr>
        <tr>
          <td>Tracking Link</td>
          <td>${trackingLink}</td>
        </tr>
      </tbody>
    </table>
  `;

  return baseLayout({
    title: "Shipping Notification",
    preheader: `Shipment for order ${data.order_id}`,
    body,
  });
};
