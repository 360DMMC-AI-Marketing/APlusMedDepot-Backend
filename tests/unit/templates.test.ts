import { generateOrderConfirmationHtml } from "../../src/templates/orderConfirmation";
import { generateShippingNotificationHtml } from "../../src/templates/shippingNotification";
import { generateSupplierNewOrderHtml } from "../../src/templates/supplierNewOrder";

const assertEscaped = (html: string, raw: string, escaped: string): void => {
  expect(html).toContain(escaped);
  expect(html).not.toContain(raw);
};

describe("email templates", () => {
  describe("generateOrderConfirmationHtml", () => {
    it("returns non-empty string", () => {
      const html = generateOrderConfirmationHtml({
        order: { id: "order_123", created_at: "2026-02-16T00:00:00.000Z", status: "paid" },
        items: [
          {
            name: "Gauze Pads",
            quantity: 2,
            unit_price: 4.5,
            subtotal: 9,
            supplier_name: "MedSupply Co",
          },
        ],
        totals: { subtotal: 9, tax: 0.9, total: 9.9 },
        shipping_address: "123 Main St, Austin, TX 78701",
      });

      expect(html.length).toBeGreaterThan(0);
    });

    it("does not throw with valid data", () => {
      expect(() =>
        generateOrderConfirmationHtml({
          order: { id: "order_124", created_at: "2026-02-16T00:00:00.000Z", status: "paid" },
          items: [
            {
              name: "Syringes",
              quantity: 1,
              unit_price: 12,
              subtotal: 12,
              supplier_name: "Supply House",
            },
          ],
          totals: { subtotal: 12, tax: 1.2, total: 13.2 },
          shipping_address: {
            line1: "500 5th Ave",
            city: "New York",
            state: "NY",
            postal_code: "10018",
            country: "US",
          },
        }),
      ).not.toThrow();
    });

    it("does not throw with minimal data", () => {
      expect(() =>
        generateOrderConfirmationHtml({
          order: { id: "order_min" },
          items: [],
        }),
      ).not.toThrow();
    });

    it("escapes special characters", () => {
      const html = generateOrderConfirmationHtml({
        order: { id: "order_xss" },
        items: [
          {
            name: '<Bandage & "Tape"\'>',
            quantity: 1,
            unit_price: 1,
            subtotal: 1,
            supplier_name: "ACME <Supplies>",
          },
        ],
      });

      assertEscaped(html, "<Bandage", "&lt;Bandage &amp; &quot;Tape&quot;&#39;&gt;");
      assertEscaped(html, "ACME <Supplies>", "ACME &lt;Supplies&gt;");
    });
  });

  describe("generateShippingNotificationHtml", () => {
    it("returns non-empty string", () => {
      const html = generateShippingNotificationHtml({
        order_id: "order_200",
        item: { name: "Gloves", quantity: 3 },
        carrier: "UPS",
        tracking_number: "1Z999AA10123456784",
        supplier_name: "Glove Co",
      });

      expect(html.length).toBeGreaterThan(0);
    });

    it("does not throw with valid data", () => {
      expect(() =>
        generateShippingNotificationHtml({
          order_id: "order_201",
          item: { name: "Masks", quantity: 5 },
          carrier: "USPS",
          tracking_number: "9400111202500000000000",
          supplier_name: "Mask Depot",
        }),
      ).not.toThrow();
    });

    it("does not throw with minimal data", () => {
      expect(() =>
        generateShippingNotificationHtml({
          order_id: "order_min_ship",
          item: {},
        }),
      ).not.toThrow();
    });

    it("escapes special characters", () => {
      const html = generateShippingNotificationHtml({
        order_id: "order_<xss>",
        item: { name: "Glove <Set>", quantity: 1 },
        carrier: "FedEx",
        tracking_number: "12345",
        supplier_name: "Supplier & Co",
      });

      assertEscaped(html, "order_<xss>", "order_&lt;xss&gt;");
      assertEscaped(html, "Glove <Set>", "Glove &lt;Set&gt;");
      assertEscaped(html, "Supplier & Co", "Supplier &amp; Co");
    });
  });

  describe("generateSupplierNewOrderHtml", () => {
    it("returns non-empty string", () => {
      const html = generateSupplierNewOrderHtml({
        items: [
          { name: "Thermometer", quantity: 1, unit_price: 15, subtotal: 15 },
          { name: "Sanitizer", quantity: 2, unit_price: 4, subtotal: 8 },
        ],
        shipping_address: "742 Evergreen Terrace",
        commission_breakdown: {
          sale_amount: 23,
          commission_rate: 0.15,
          commission_amount: 3.45,
          payout_amount: 19.55,
        },
      });

      expect(html.length).toBeGreaterThan(0);
    });

    it("does not throw with valid data", () => {
      expect(() =>
        generateSupplierNewOrderHtml({
          items: [{ name: "Bandage Roll", quantity: 10, unit_price: 2, subtotal: 20 }],
          shipping_address: {
            line1: "10 Market St",
            city: "San Francisco",
            state: "CA",
            postal_code: "94105",
            country: "US",
          },
          commission_breakdown: {
            sale_amount: 20,
            commission_rate: 0.12,
            commission_amount: 2.4,
            payout_amount: 17.6,
          },
        }),
      ).not.toThrow();
    });

    it("does not throw with minimal data", () => {
      expect(() =>
        generateSupplierNewOrderHtml({
          items: [],
        }),
      ).not.toThrow();
    });

    it("escapes special characters", () => {
      const html = generateSupplierNewOrderHtml({
        items: [{ name: "<Gauze> & Co", quantity: 1, unit_price: 1, subtotal: 1 }],
        commission_breakdown: {
          sale_amount: 1,
          commission_rate: 0.1,
          commission_amount: 0.1,
          payout_amount: 0.9,
        },
      });

      assertEscaped(html, "<Gauze> & Co", "&lt;Gauze&gt; &amp; Co");
    });
  });
});
