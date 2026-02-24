const mockFrom = jest.fn();

jest.mock("../../src/config/supabase", () => ({
  supabaseAdmin: {
    from: mockFrom,
  },
}));

jest.mock("../../src/config/env", () => ({
  getEnv: () => ({
    RESEND_API_KEY: "",
    FROM_EMAIL: "",
  }),
}));

const mockSendOrderConfirmation = jest.fn();
const mockSendSupplierNewOrder = jest.fn();

jest.mock("../../src/services/email.service", () => ({
  sendOrderConfirmation: mockSendOrderConfirmation,
  sendSupplierNewOrder: mockSendSupplierNewOrder,
}));

import { OrderConfirmationService } from "../../src/services/orderConfirmation.service";

const ORDER_ID = "order-uuid-1";
const CUSTOMER_ID = "customer-uuid-1";

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    order_number: "ORD-20260222-ABC12",
    customer_id: CUSTOMER_ID,
    total_amount: "64.93",
    tax_amount: "5.36",
    shipping_address: {
      street: "123 Main",
      city: "Austin",
      state: "TX",
      zip_code: "78701",
      country: "US",
    },
    status: "confirmed",
    payment_status: "paid",
    created_at: "2026-02-22T00:00:00Z",
    ...overrides,
  };
}

function makeOrderItems() {
  return [
    {
      id: "item-1",
      product_id: "prod-1",
      supplier_id: "supplier-1",
      quantity: 2,
      unit_price: "19.99",
      subtotal: "39.98",
      products: { name: "Medical Gloves" },
      suppliers: {
        id: "supplier-1",
        business_name: "MedSupply Co",
        commission_rate: "15.00",
        user_id: "supplier-user-1",
      },
    },
    {
      id: "item-2",
      product_id: "prod-2",
      supplier_id: "supplier-2",
      quantity: 1,
      unit_price: "24.95",
      subtotal: "24.95",
      products: { name: "Surgical Masks" },
      suppliers: {
        id: "supplier-2",
        business_name: "SafeHealth Inc",
        commission_rate: "12.00",
        user_id: "supplier-user-2",
      },
    },
  ];
}

function mockSelectQuery(result: { data?: unknown; error?: unknown }) {
  const resolved = {
    data: result.data ?? null,
    error: result.error ?? null,
  };
  const chain: Record<string, jest.Mock> = {};
  const self = () => chain;
  chain.select = jest.fn(self);
  chain.eq = jest.fn(self);
  chain.single = jest.fn().mockResolvedValue(resolved);
  return chain;
}

// For queries that don't use .single() (e.g. order_items list)
function mockSelectListQuery(result: { data?: unknown; error?: unknown }) {
  const resolved = {
    data: result.data ?? null,
    error: result.error ?? null,
  };
  const chain: Record<string, jest.Mock> = {};
  const self = () => chain;
  chain.select = jest.fn(self);
  chain.eq = jest.fn(self);
  chain.then = jest
    .fn()
    .mockImplementation((resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(resolved).then(resolve, reject),
    );
  return chain;
}

function mockInsertQuery() {
  const chain: Record<string, jest.Mock> = {};
  chain.insert = jest.fn().mockResolvedValue({ data: null, error: null });
  return chain;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("OrderConfirmationService", () => {
  describe("confirmOrder", () => {
    it("sends customer confirmation email", async () => {
      const orderChain = mockSelectQuery({ data: makeOrder() });
      const itemsChain = mockSelectListQuery({ data: makeOrderItems() });
      const customerChain = mockSelectQuery({ data: { email: "customer@test.com" } });
      const supplier1Chain = mockSelectQuery({ data: { email: "supplier1@test.com" } });
      const supplier2Chain = mockSelectQuery({ data: { email: "supplier2@test.com" } });
      const historyChain = mockInsertQuery();

      let callCount = 0;
      mockFrom.mockImplementation((table: string) => {
        callCount++;
        if (table === "orders") return orderChain;
        if (table === "order_items") return itemsChain;
        if (table === "order_status_history") return historyChain;
        if (table === "users") {
          // First user call = customer, then supplier1, then supplier2
          if (callCount === 3) return customerChain;
          if (callCount === 4) return supplier1Chain;
          return supplier2Chain;
        }
        return mockSelectQuery({ data: null });
      });

      await OrderConfirmationService.confirmOrder(ORDER_ID);

      expect(mockSendOrderConfirmation).toHaveBeenCalledTimes(1);
      expect(mockSendOrderConfirmation).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "ORD-20260222-ABC12",
          status: "confirmed",
          total: 64.93,
          items: expect.arrayContaining([
            expect.objectContaining({ name: "Medical Gloves", quantity: 2 }),
            expect.objectContaining({ name: "Surgical Masks", quantity: 1 }),
          ]),
        }),
        "customer@test.com",
      );
    });

    it("sends one email per supplier with commission breakdown", async () => {
      const orderChain = mockSelectQuery({ data: makeOrder() });
      const itemsChain = mockSelectListQuery({ data: makeOrderItems() });
      const customerChain = mockSelectQuery({ data: { email: "customer@test.com" } });
      const supplier1Chain = mockSelectQuery({ data: { email: "supplier1@test.com" } });
      const supplier2Chain = mockSelectQuery({ data: { email: "supplier2@test.com" } });
      const historyChain = mockInsertQuery();

      let callCount = 0;
      mockFrom.mockImplementation((table: string) => {
        callCount++;
        if (table === "orders") return orderChain;
        if (table === "order_items") return itemsChain;
        if (table === "order_status_history") return historyChain;
        if (table === "users") {
          if (callCount === 3) return customerChain;
          if (callCount === 4) return supplier1Chain;
          return supplier2Chain;
        }
        return mockSelectQuery({ data: null });
      });

      await OrderConfirmationService.confirmOrder(ORDER_ID);

      expect(mockSendSupplierNewOrder).toHaveBeenCalledTimes(2);

      // Supplier 1: MedSupply Co — commission_rate 15%, subtotal 39.98
      expect(mockSendSupplierNewOrder).toHaveBeenCalledWith(
        "supplier1@test.com",
        expect.arrayContaining([
          expect.objectContaining({
            name: "Medical Gloves",
            quantity: 2,
            commissionRate: 0.15,
            commissionAmount: 39.98 * 0.15,
            supplierPayout: 39.98 - 39.98 * 0.15,
          }),
        ]),
        expect.anything(),
      );

      // Supplier 2: SafeHealth Inc — commission_rate 12%, subtotal 24.95
      expect(mockSendSupplierNewOrder).toHaveBeenCalledWith(
        "supplier2@test.com",
        expect.arrayContaining([
          expect.objectContaining({
            name: "Surgical Masks",
            quantity: 1,
            commissionRate: 0.12,
            commissionAmount: 24.95 * 0.12,
            supplierPayout: 24.95 - 24.95 * 0.12,
          }),
        ]),
        expect.anything(),
      );
    });

    it("calculates commission using rate / 100", async () => {
      // Supplier with 18% commission rate
      const items = [
        {
          id: "item-1",
          product_id: "prod-1",
          supplier_id: "supplier-1",
          quantity: 1,
          unit_price: "100.00",
          subtotal: "100.00",
          products: { name: "Premium Mask" },
          suppliers: {
            id: "supplier-1",
            business_name: "Premium Co",
            commission_rate: "18.00",
            user_id: "supplier-user-1",
          },
        },
      ];

      const orderChain = mockSelectQuery({ data: makeOrder() });
      const itemsChain = mockSelectListQuery({ data: items });
      const customerChain = mockSelectQuery({ data: { email: "cust@test.com" } });
      const supplierChain = mockSelectQuery({ data: { email: "sup@test.com" } });
      const historyChain = mockInsertQuery();

      let callCount = 0;
      mockFrom.mockImplementation((table: string) => {
        callCount++;
        if (table === "orders") return orderChain;
        if (table === "order_items") return itemsChain;
        if (table === "order_status_history") return historyChain;
        if (table === "users") {
          if (callCount === 3) return customerChain;
          return supplierChain;
        }
        return mockSelectQuery({ data: null });
      });

      await OrderConfirmationService.confirmOrder(ORDER_ID);

      expect(mockSendSupplierNewOrder).toHaveBeenCalledWith(
        "sup@test.com",
        [
          expect.objectContaining({
            commissionRate: 0.18,
            commissionAmount: 18.0,
            supplierPayout: 82.0,
          }),
        ],
        expect.anything(),
      );
    });

    it("inserts order_status_history record", async () => {
      const orderChain = mockSelectQuery({ data: makeOrder() });
      const itemsChain = mockSelectListQuery({ data: makeOrderItems() });
      const customerChain = mockSelectQuery({ data: { email: "customer@test.com" } });
      const supplier1Chain = mockSelectQuery({ data: { email: "s1@test.com" } });
      const supplier2Chain = mockSelectQuery({ data: { email: "s2@test.com" } });
      const historyChain = mockInsertQuery();

      let callCount = 0;
      mockFrom.mockImplementation((table: string) => {
        callCount++;
        if (table === "orders") return orderChain;
        if (table === "order_items") return itemsChain;
        if (table === "order_status_history") return historyChain;
        if (table === "users") {
          if (callCount === 3) return customerChain;
          if (callCount === 4) return supplier1Chain;
          return supplier2Chain;
        }
        return mockSelectQuery({ data: null });
      });

      await OrderConfirmationService.confirmOrder(ORDER_ID);

      expect(mockFrom).toHaveBeenCalledWith("order_status_history");
      expect(historyChain.insert).toHaveBeenCalledWith({
        order_id: ORDER_ID,
        from_status: "pending_payment",
        to_status: "confirmed",
        changed_by: CUSTOMER_ID,
        reason: "Payment confirmed via Stripe webhook",
      });
    });

    it("returns early when order not found", async () => {
      const orderChain = mockSelectQuery({ data: null, error: { message: "not found" } });
      mockFrom.mockReturnValue(orderChain);

      await OrderConfirmationService.confirmOrder(ORDER_ID);

      expect(mockSendOrderConfirmation).not.toHaveBeenCalled();
      expect(mockSendSupplierNewOrder).not.toHaveBeenCalled();
    });

    it("skips customer email when no email found", async () => {
      const orderChain = mockSelectQuery({ data: makeOrder() });
      const itemsChain = mockSelectListQuery({ data: makeOrderItems() });
      const customerChain = mockSelectQuery({ data: null });
      const supplier1Chain = mockSelectQuery({ data: { email: "s1@test.com" } });
      const supplier2Chain = mockSelectQuery({ data: { email: "s2@test.com" } });
      const historyChain = mockInsertQuery();

      let callCount = 0;
      mockFrom.mockImplementation((table: string) => {
        callCount++;
        if (table === "orders") return orderChain;
        if (table === "order_items") return itemsChain;
        if (table === "order_status_history") return historyChain;
        if (table === "users") {
          if (callCount === 3) return customerChain;
          if (callCount === 4) return supplier1Chain;
          return supplier2Chain;
        }
        return mockSelectQuery({ data: null });
      });

      await OrderConfirmationService.confirmOrder(ORDER_ID);

      expect(mockSendOrderConfirmation).not.toHaveBeenCalled();
      // Supplier emails should still be sent
      expect(mockSendSupplierNewOrder).toHaveBeenCalledTimes(2);
    });

    it("groups multiple items from same supplier into one email", async () => {
      const items = [
        {
          id: "item-1",
          product_id: "prod-1",
          supplier_id: "supplier-1",
          quantity: 2,
          unit_price: "10.00",
          subtotal: "20.00",
          products: { name: "Item A" },
          suppliers: {
            id: "supplier-1",
            business_name: "SupCo",
            commission_rate: "15.00",
            user_id: "supplier-user-1",
          },
        },
        {
          id: "item-2",
          product_id: "prod-2",
          supplier_id: "supplier-1",
          quantity: 3,
          unit_price: "5.00",
          subtotal: "15.00",
          products: { name: "Item B" },
          suppliers: {
            id: "supplier-1",
            business_name: "SupCo",
            commission_rate: "15.00",
            user_id: "supplier-user-1",
          },
        },
      ];

      const orderChain = mockSelectQuery({ data: makeOrder() });
      const itemsChain = mockSelectListQuery({ data: items });
      const customerChain = mockSelectQuery({ data: { email: "cust@test.com" } });
      const supplierChain = mockSelectQuery({ data: { email: "sup@test.com" } });
      const historyChain = mockInsertQuery();

      let callCount = 0;
      mockFrom.mockImplementation((table: string) => {
        callCount++;
        if (table === "orders") return orderChain;
        if (table === "order_items") return itemsChain;
        if (table === "order_status_history") return historyChain;
        if (table === "users") {
          if (callCount === 3) return customerChain;
          return supplierChain;
        }
        return mockSelectQuery({ data: null });
      });

      await OrderConfirmationService.confirmOrder(ORDER_ID);

      // Should be 1 email for the single supplier, not 2
      expect(mockSendSupplierNewOrder).toHaveBeenCalledTimes(1);
      expect(mockSendSupplierNewOrder).toHaveBeenCalledWith(
        "sup@test.com",
        expect.arrayContaining([
          expect.objectContaining({ name: "Item A" }),
          expect.objectContaining({ name: "Item B" }),
        ]),
        expect.anything(),
      );
    });
  });

  describe("getOrderConfirmation", () => {
    it("returns order confirmation details for the owner", async () => {
      const orderChain = mockSelectQuery({ data: makeOrder() });
      const itemsChain = mockSelectListQuery({
        data: [
          {
            id: "item-1",
            product_id: "prod-1",
            supplier_id: "supplier-1",
            quantity: 2,
            unit_price: "19.99",
            subtotal: "39.98",
            products: { name: "Medical Gloves" },
            suppliers: { business_name: "MedSupply Co" },
          },
        ],
      });

      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return orderChain;
        return itemsChain;
      });

      const result = await OrderConfirmationService.getOrderConfirmation(ORDER_ID, CUSTOMER_ID);

      expect(result.order.id).toBe(ORDER_ID);
      expect(result.order.order_number).toBe("ORD-20260222-ABC12");
      expect(result.order.total_amount).toBe(64.93);
      expect(result.order.tax_amount).toBe(5.36);
      expect(result.order.items).toHaveLength(1);
      expect(result.order.items[0]).toEqual({
        product_name: "Medical Gloves",
        quantity: 2,
        unit_price: 19.99,
        subtotal: 39.98,
        supplier_name: "MedSupply Co",
      });
    });

    it("throws 403 when customer_id does not match", async () => {
      const orderChain = mockSelectQuery({ data: makeOrder() });
      mockFrom.mockReturnValue(orderChain);

      await expect(
        OrderConfirmationService.getOrderConfirmation(ORDER_ID, "wrong-customer"),
      ).rejects.toThrow("You can only view your own order confirmations");
    });

    it("throws 404 when order not found", async () => {
      const orderChain = mockSelectQuery({ data: null, error: { message: "not found" } });
      mockFrom.mockReturnValue(orderChain);

      await expect(
        OrderConfirmationService.getOrderConfirmation(ORDER_ID, CUSTOMER_ID),
      ).rejects.toThrow();
    });
  });
});
