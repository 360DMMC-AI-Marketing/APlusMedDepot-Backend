const mockFrom = jest.fn();

jest.mock("../../src/config/supabase", () => ({
  supabaseAdmin: {
    from: mockFrom,
  },
}));

import { AdminOrderService } from "../../src/services/adminOrder.service";

function mockQuery(result: { data?: unknown; error?: unknown; count?: number | null }) {
  const resolved = {
    data: result.data ?? null,
    error: result.error ?? null,
    count: result.count ?? null,
  };
  const chain: Record<string, jest.Mock> = {};
  const self = () => chain;
  chain.select = jest.fn(self);
  chain.insert = jest.fn(self);
  chain.update = jest.fn(self);
  chain.delete = jest.fn(self);
  chain.eq = jest.fn(self);
  chain.neq = jest.fn(self);
  chain.or = jest.fn(self);
  chain.is = jest.fn(self);
  chain.in = jest.fn(self);
  chain.not = jest.fn(self);
  chain.gte = jest.fn(self);
  chain.lte = jest.fn(self);
  chain.order = jest.fn(self);
  chain.range = jest.fn(self);
  chain.limit = jest.fn(self);
  chain.single = jest.fn().mockResolvedValue(resolved);
  chain.then = jest
    .fn()
    .mockImplementation((resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(resolved).then(resolve, reject),
    );
  return chain;
}

const ORDER_ID = "order-uuid-1";

function makeOrderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    order_number: "ORD-20260101-ABC12",
    customer_id: "customer-uuid-1",
    parent_order_id: null,
    supplier_id: null,
    total_amount: "350.00",
    tax_amount: "28.88",
    shipping_address: {
      street: "123 Main",
      city: "Test",
      state: "TX",
      zip_code: "75001",
      country: "US",
    },
    status: "payment_confirmed",
    payment_status: "paid",
    payment_intent_id: "pi_test123",
    notes: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    users: { email: "customer@example.com", first_name: "John", last_name: "Doe" },
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ── listOrders ─────────────────────────────────────────────────────────

describe("AdminOrderService.listOrders", () => {
  it("returns paginated results with correct total", async () => {
    const orders = [makeOrderRow()];
    const listQ = mockQuery({ data: orders, count: 1 });
    const itemCountQ = mockQuery({ count: 3 });
    const subCountQ = mockQuery({ count: 2 });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return listQ;
      if (callCount === 2) return itemCountQ;
      return subCountQ;
    });

    const result = await AdminOrderService.listOrders();

    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.data[0].orderNumber).toBe("ORD-20260101-ABC12");
    expect(result.data[0].customerEmail).toBe("customer@example.com");
    expect(result.data[0].customerName).toBe("John Doe");
    expect(result.data[0].itemCount).toBe(3);
    expect(result.data[0].subOrderCount).toBe(2);
  });

  it("master-only filter excludes sub-orders by default", async () => {
    const listQ = mockQuery({ data: [], count: 0 });
    mockFrom.mockReturnValue(listQ);

    await AdminOrderService.listOrders();

    expect(listQ.is).toHaveBeenCalledWith("parent_order_id", null);
  });

  it("includes sub-orders when masterOnly is false", async () => {
    const listQ = mockQuery({ data: [], count: 0 });
    mockFrom.mockReturnValue(listQ);

    await AdminOrderService.listOrders({ masterOnly: false });

    expect(listQ.is).not.toHaveBeenCalled();
  });

  it("applies status filter", async () => {
    const listQ = mockQuery({ data: [], count: 0 });
    mockFrom.mockReturnValue(listQ);

    await AdminOrderService.listOrders({ status: "delivered" });

    expect(listQ.eq).toHaveBeenCalledWith("status", "delivered");
  });

  it("applies payment status filter", async () => {
    const listQ = mockQuery({ data: [], count: 0 });
    mockFrom.mockReturnValue(listQ);

    await AdminOrderService.listOrders({ paymentStatus: "paid" });

    expect(listQ.eq).toHaveBeenCalledWith("payment_status", "paid");
  });

  it("applies date range filter", async () => {
    const listQ = mockQuery({ data: [], count: 0 });
    mockFrom.mockReturnValue(listQ);

    await AdminOrderService.listOrders({
      startDate: "2026-01-01T00:00:00Z",
      endDate: "2026-01-31T23:59:59Z",
    });

    expect(listQ.gte).toHaveBeenCalledWith("created_at", "2026-01-01T00:00:00Z");
    expect(listQ.lte).toHaveBeenCalledWith("created_at", "2026-01-31T23:59:59Z");
  });

  it("applies search by order number", async () => {
    const listQ = mockQuery({ data: [], count: 0 });
    mockFrom.mockReturnValue(listQ);

    await AdminOrderService.listOrders({ search: "ORD-2026" });

    expect(listQ.or).toHaveBeenCalledWith("order_number.ilike.%ORD-2026%");
  });

  it("applies combined filters", async () => {
    const listQ = mockQuery({ data: [], count: 0 });
    mockFrom.mockReturnValue(listQ);

    await AdminOrderService.listOrders({
      status: "delivered",
      startDate: "2026-01-01T00:00:00Z",
      search: "ORD",
    });

    expect(listQ.eq).toHaveBeenCalledWith("status", "delivered");
    expect(listQ.gte).toHaveBeenCalledWith("created_at", "2026-01-01T00:00:00Z");
    expect(listQ.or).toHaveBeenCalledWith("order_number.ilike.%ORD%");
  });

  it("throws on database error", async () => {
    const listQ = mockQuery({ error: { message: "DB error" } });
    mockFrom.mockReturnValue(listQ);

    await expect(AdminOrderService.listOrders()).rejects.toThrow("Failed to list orders: DB error");
  });
});

// ── getOrderDetail ─────────────────────────────────────────────────────

describe("AdminOrderService.getOrderDetail", () => {
  it("returns full order with items, sub-orders, payments, commissions, history", async () => {
    const orderRow = makeOrderRow();
    const customerRow = {
      id: "customer-uuid-1",
      email: "customer@example.com",
      first_name: "John",
      last_name: "Doe",
      phone: "+1234567890",
    };
    const itemRows = [
      {
        id: "item-1",
        product_id: "prod-1",
        supplier_id: "sup-1",
        quantity: 2,
        unit_price: "100.00",
        subtotal: "200.00",
        fulfillment_status: "shipped",
        tracking_number: "TRK123",
        carrier: "UPS",
        products: { name: "Gloves", sku: "GL-001" },
        suppliers: { business_name: "MedCo" },
      },
    ];
    const subOrderRows = [
      {
        id: "sub-1",
        order_number: "ORD-20260101-SUB01",
        supplier_id: "sup-1",
        total_amount: "200.00",
        status: "awaiting_fulfillment",
        suppliers: { business_name: "MedCo" },
        order_items: [{ id: "si-1" }],
      },
    ];
    const paymentRows = [
      {
        id: "pay-1",
        amount: "350.00",
        currency: "usd",
        status: "succeeded",
        payment_method: "card",
        failure_reason: null,
        paid_at: "2026-01-01T01:00:00Z",
        created_at: "2026-01-01T00:00:00Z",
      },
    ];
    const commissionRows = [
      {
        id: "comm-1",
        order_item_id: "item-1",
        supplier_id: "sup-1",
        sale_amount: "200.00",
        commission_rate: "15.00",
        commission_amount: "30.00",
        platform_amount: "30.00",
        supplier_payout: "170.00",
        status: "pending",
        order_items: { products: { name: "Gloves" } },
        suppliers: { business_name: "MedCo" },
      },
    ];
    const historyRows = [
      {
        from_status: "pending_payment",
        to_status: "payment_confirmed",
        created_at: "2026-01-01T01:00:00Z",
        reason: null,
      },
    ];

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return mockQuery({ data: orderRow }); // order
      if (callCount === 2) return mockQuery({ data: customerRow }); // customer
      if (callCount === 3) return mockQuery({ data: itemRows }); // items
      if (callCount === 4) return mockQuery({ data: subOrderRows }); // sub-orders
      if (callCount === 5) return mockQuery({ data: paymentRows }); // payments
      if (callCount === 6) return mockQuery({ data: commissionRows }); // commissions
      return mockQuery({ data: historyRows }); // history
    });

    const result = await AdminOrderService.getOrderDetail(ORDER_ID);

    expect(result.id).toBe(ORDER_ID);
    expect(result.orderNumber).toBe("ORD-20260101-ABC12");
    expect(result.customer.email).toBe("customer@example.com");
    expect(result.items).toHaveLength(1);
    expect(result.items[0].productName).toBe("Gloves");
    expect(result.items[0].productSku).toBe("GL-001");
    expect(result.items[0].supplierName).toBe("MedCo");
    expect(result.subOrders).toHaveLength(1);
    expect(result.subOrders[0].supplierName).toBe("MedCo");
    expect(result.subOrders[0].status).toBe("awaiting_fulfillment");
    expect(result.subOrders[0].itemCount).toBe(1);
    expect(result.payments).toHaveLength(1);
    expect(result.payments[0].amount).toBe(350);
    expect(result.commissions).toHaveLength(1);
    expect(result.commissions[0].commissionAmount).toBe(30);
    expect(result.statusHistory).toHaveLength(1);
    expect(result.summary.totalItems).toBe(1);
    expect(result.summary.totalPlatformCommission).toBe(30);
    expect(result.summary.totalSupplierPayouts).toBe(170);
  });

  it("throws 404 for non-existent order", async () => {
    mockFrom.mockReturnValue(mockQuery({ error: { message: "not found" } }));

    await expect(AdminOrderService.getOrderDetail("nonexistent")).rejects.toThrow(
      "Order not found",
    );
  });

  it("excludes reversed commissions from summary totals", async () => {
    const orderRow = makeOrderRow();
    const customerRow = {
      id: "customer-uuid-1",
      email: "c@example.com",
      first_name: "A",
      last_name: "B",
      phone: null,
    };
    const commissionRows = [
      {
        id: "c1",
        order_item_id: "i1",
        supplier_id: "s1",
        sale_amount: "100.00",
        commission_rate: "15.00",
        commission_amount: "15.00",
        platform_amount: "15.00",
        supplier_payout: "85.00",
        status: "pending",
        order_items: { products: { name: "A" } },
        suppliers: { business_name: "S" },
      },
      {
        id: "c2",
        order_item_id: "i2",
        supplier_id: "s1",
        sale_amount: "50.00",
        commission_rate: "15.00",
        commission_amount: "7.50",
        platform_amount: "7.50",
        supplier_payout: "42.50",
        status: "reversed",
        order_items: { products: { name: "B" } },
        suppliers: { business_name: "S" },
      },
    ];

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return mockQuery({ data: orderRow }); // order
      if (callCount === 2) return mockQuery({ data: customerRow }); // customer
      if (callCount === 3) return mockQuery({ data: [] }); // items
      if (callCount === 4) return mockQuery({ data: [] }); // sub-orders
      if (callCount === 5) return mockQuery({ data: [] }); // payments
      if (callCount === 6) return mockQuery({ data: commissionRows }); // commissions
      return mockQuery({ data: [] }); // history
    });

    const result = await AdminOrderService.getOrderDetail(ORDER_ID);

    // Only non-reversed commission counted
    expect(result.summary.totalPlatformCommission).toBe(15);
    expect(result.summary.totalSupplierPayouts).toBe(85);
  });
});

// ── searchOrders ───────────────────────────────────────────────────────

describe("AdminOrderService.searchOrders", () => {
  it("searches by order number and returns results", async () => {
    const orders = [makeOrderRow()];
    const q = mockQuery({ data: orders });
    mockFrom.mockReturnValue(q);

    const result = await AdminOrderService.searchOrders("ORD-2026");

    expect(q.or).toHaveBeenCalledWith("order_number.ilike.%ORD-2026%");
    expect(q.limit).toHaveBeenCalledWith(20);
    expect(result).toHaveLength(1);
    expect(result[0].orderNumber).toBe("ORD-20260101-ABC12");
  });

  it("returns empty array when no results", async () => {
    const q = mockQuery({ data: [] });
    mockFrom.mockReturnValue(q);

    const result = await AdminOrderService.searchOrders("NONEXIST");

    expect(result).toHaveLength(0);
  });

  it("only searches master orders", async () => {
    const q = mockQuery({ data: [] });
    mockFrom.mockReturnValue(q);

    await AdminOrderService.searchOrders("ORD");

    expect(q.is).toHaveBeenCalledWith("parent_order_id", null);
  });
});

// ── getOrdersByStatus ──────────────────────────────────────────────────

describe("AdminOrderService.getOrdersByStatus", () => {
  it("returns correct counts per status", async () => {
    const rows = [
      { status: "pending_payment" },
      { status: "pending_payment" },
      { status: "payment_confirmed" },
      { status: "delivered" },
      { status: "delivered" },
      { status: "delivered" },
    ];
    const q = mockQuery({ data: rows });
    mockFrom.mockReturnValue(q);

    const result = await AdminOrderService.getOrdersByStatus();

    expect(result).toEqual({
      pending_payment: 2,
      payment_confirmed: 1,
      delivered: 3,
    });
  });

  it("only counts master orders", async () => {
    const q = mockQuery({ data: [] });
    mockFrom.mockReturnValue(q);

    await AdminOrderService.getOrdersByStatus();

    expect(q.is).toHaveBeenCalledWith("parent_order_id", null);
  });

  it("returns empty object when no orders exist", async () => {
    const q = mockQuery({ data: [] });
    mockFrom.mockReturnValue(q);

    const result = await AdminOrderService.getOrdersByStatus();

    expect(result).toEqual({});
  });

  it("throws on database error", async () => {
    const q = mockQuery({ error: { message: "DB down" } });
    mockFrom.mockReturnValue(q);

    await expect(AdminOrderService.getOrdersByStatus()).rejects.toThrow(
      "Failed to get order status counts: DB down",
    );
  });
});
