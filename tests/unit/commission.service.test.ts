const mockFrom = jest.fn();
const mockRpc = jest.fn();

jest.mock("../../src/config/supabase", () => ({
  supabaseAdmin: {
    from: mockFrom,
    rpc: mockRpc,
  },
}));

import { CommissionService } from "../../src/services/commission.service";

function mockQuery(result: { data?: unknown; error?: unknown }) {
  const resolved = {
    data: result.data ?? null,
    error: result.error ?? null,
  };
  const chain: Record<string, jest.Mock> = {};
  const self = () => chain;
  chain.select = jest.fn(self);
  chain.insert = jest.fn(self);
  chain.update = jest.fn(self);
  chain.delete = jest.fn(self);
  chain.eq = jest.fn(self);
  chain.neq = jest.fn(self);
  chain.gte = jest.fn(self);
  chain.lte = jest.fn(self);
  chain.in = jest.fn(self);
  chain.is = jest.fn(self);
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
const SUPPLIER_1 = "sup-1";
const SUPPLIER_2 = "sup-2";

function makeOrderItemWithSupplier(overrides: Record<string, unknown> = {}) {
  return {
    id: "oi-1",
    supplier_id: SUPPLIER_1,
    subtotal: "100.00",
    suppliers: { commission_rate: "15.00", business_name: "MedSupply Co" },
    ...overrides,
  };
}

function makeCommissionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "comm-1",
    order_item_id: "oi-1",
    order_id: ORDER_ID,
    supplier_id: SUPPLIER_1,
    sale_amount: "100.00",
    commission_rate: "15.00",
    commission_amount: "15.00",
    platform_amount: "15.00",
    supplier_payout: "85.00",
    status: "pending",
    created_at: "2026-02-22T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRpc.mockResolvedValue({ data: null, error: null });
});

// ── calculateOrderCommissions ─────────────────────────────────────────

describe("CommissionService.calculateOrderCommissions", () => {
  it("single item, rate 15.00 (15%) → correct commission and supplier amount", async () => {
    const itemsChain = mockQuery({
      data: [makeOrderItemWithSupplier()],
    });
    const insertChain = mockQuery({
      data: [
        {
          id: "comm-1",
          order_item_id: "oi-1",
          supplier_id: SUPPLIER_1,
          sale_amount: "100.00",
          commission_amount: "15.00",
          supplier_amount: "85.00",
        },
      ],
    });

    mockFrom.mockReturnValueOnce(itemsChain).mockReturnValueOnce(insertChain);

    const result = await CommissionService.calculateOrderCommissions(ORDER_ID);

    expect(result).toHaveLength(1);
    expect(result[0].saleAmount).toBe(100);
    expect(result[0].commissionAmount).toBe(15);
    expect(result[0].supplierAmount).toBe(85);
    expect(result[0].commissionId).toBe("comm-1");
    expect(result[0].orderItemId).toBe("oi-1");
    expect(result[0].supplierId).toBe(SUPPLIER_1);
  });

  it("multiple items, same supplier → one commission per item", async () => {
    const items = [
      makeOrderItemWithSupplier({ id: "oi-1", subtotal: "50.00" }),
      makeOrderItemWithSupplier({ id: "oi-2", subtotal: "30.00" }),
      makeOrderItemWithSupplier({ id: "oi-3", subtotal: "20.00" }),
    ];

    const itemsChain = mockQuery({ data: items });
    const insertChain = mockQuery({
      data: [
        {
          id: "comm-1",
          order_item_id: "oi-1",
          supplier_id: SUPPLIER_1,
          sale_amount: "50.00",
          commission_amount: "7.50",
          supplier_amount: "42.50",
        },
        {
          id: "comm-2",
          order_item_id: "oi-2",
          supplier_id: SUPPLIER_1,
          sale_amount: "30.00",
          commission_amount: "4.50",
          supplier_amount: "25.50",
        },
        {
          id: "comm-3",
          order_item_id: "oi-3",
          supplier_id: SUPPLIER_1,
          sale_amount: "20.00",
          commission_amount: "3.00",
          supplier_amount: "17.00",
        },
      ],
    });

    mockFrom.mockReturnValueOnce(itemsChain).mockReturnValueOnce(insertChain);

    const result = await CommissionService.calculateOrderCommissions(ORDER_ID);

    expect(result).toHaveLength(3);
    expect(result[0].saleAmount).toBe(50);
    expect(result[0].commissionAmount).toBe(7.5);
    expect(result[0].supplierAmount).toBe(42.5);
    expect(result[1].saleAmount).toBe(30);
    expect(result[1].commissionAmount).toBe(4.5);
    expect(result[1].supplierAmount).toBe(25.5);
    expect(result[2].saleAmount).toBe(20);
    expect(result[2].commissionAmount).toBe(3);
    expect(result[2].supplierAmount).toBe(17);
  });

  it("multiple items, different suppliers → each uses their own rate", async () => {
    const items = [
      makeOrderItemWithSupplier({
        id: "oi-1",
        supplier_id: SUPPLIER_1,
        subtotal: "100.00",
        suppliers: { commission_rate: "15.00", business_name: "A" },
      }),
      makeOrderItemWithSupplier({
        id: "oi-2",
        supplier_id: SUPPLIER_2,
        subtotal: "100.00",
        suppliers: { commission_rate: "12.00", business_name: "B" },
      }),
    ];

    const itemsChain = mockQuery({ data: items });
    const insertChain = mockQuery({
      data: [
        {
          id: "comm-1",
          order_item_id: "oi-1",
          supplier_id: SUPPLIER_1,
          sale_amount: "100.00",
          commission_amount: "15.00",
          supplier_amount: "85.00",
        },
        {
          id: "comm-2",
          order_item_id: "oi-2",
          supplier_id: SUPPLIER_2,
          sale_amount: "100.00",
          commission_amount: "12.00",
          supplier_amount: "88.00",
        },
      ],
    });

    mockFrom.mockReturnValueOnce(itemsChain).mockReturnValueOnce(insertChain);

    const result = await CommissionService.calculateOrderCommissions(ORDER_ID);

    expect(result).toHaveLength(2);
    expect(result[0].commissionAmount).toBe(15);
    expect(result[0].supplierAmount).toBe(85);
    expect(result[1].commissionAmount).toBe(12);
    expect(result[1].supplierAmount).toBe(88);
  });

  it("rounding: $33.33 sale, 15% → commission $5.00, supplier $28.33, total = $33.33", async () => {
    const items = [makeOrderItemWithSupplier({ id: "oi-1", subtotal: "33.33" })];

    const itemsChain = mockQuery({ data: items });
    const insertChain = mockQuery({
      data: [
        {
          id: "comm-1",
          order_item_id: "oi-1",
          supplier_id: SUPPLIER_1,
          sale_amount: "33.33",
          commission_amount: "5.00",
          supplier_amount: "28.33",
        },
      ],
    });

    mockFrom.mockReturnValueOnce(itemsChain).mockReturnValueOnce(insertChain);

    const result = await CommissionService.calculateOrderCommissions(ORDER_ID);

    expect(result[0].commissionAmount).toBe(5);
    expect(result[0].supplierAmount).toBe(28.33);
    expect(result[0].commissionAmount + result[0].supplierAmount).toBe(33.33);
  });

  it("sale_amount ALWAYS = commission_amount + supplier_payout (no penny loss)", async () => {
    const items = [
      makeOrderItemWithSupplier({ id: "oi-1", subtotal: "99.99" }),
      makeOrderItemWithSupplier({ id: "oi-2", subtotal: "0.01" }),
      makeOrderItemWithSupplier({ id: "oi-3", subtotal: "33.33" }),
      makeOrderItemWithSupplier({ id: "oi-4", subtotal: "66.67" }),
    ];

    const itemsChain = mockQuery({ data: items });
    // 99.99*0.15=15.00, 0.01*0.15=0.00, 33.33*0.15=5.00, 66.67*0.15=10.00
    const insertChain = mockQuery({
      data: [
        {
          id: "comm-1",
          order_item_id: "oi-1",
          supplier_id: SUPPLIER_1,
          sale_amount: "99.99",
          commission_amount: "15.00",
          supplier_amount: "84.99",
        },
        {
          id: "comm-2",
          order_item_id: "oi-2",
          supplier_id: SUPPLIER_1,
          sale_amount: "0.01",
          commission_amount: "0.00",
          supplier_amount: "0.01",
        },
        {
          id: "comm-3",
          order_item_id: "oi-3",
          supplier_id: SUPPLIER_1,
          sale_amount: "33.33",
          commission_amount: "5.00",
          supplier_amount: "28.33",
        },
        {
          id: "comm-4",
          order_item_id: "oi-4",
          supplier_id: SUPPLIER_1,
          sale_amount: "66.67",
          commission_amount: "10.00",
          supplier_amount: "56.67",
        },
      ],
    });

    mockFrom.mockReturnValueOnce(itemsChain).mockReturnValueOnce(insertChain);

    const result = await CommissionService.calculateOrderCommissions(ORDER_ID);

    for (const r of result) {
      const sum = Math.round((r.commissionAmount + r.supplierAmount) * 100) / 100;
      expect(sum).toBe(r.saleAmount);
    }
  });

  it("zero-dollar item → zero commission, no division errors", async () => {
    const items = [makeOrderItemWithSupplier({ id: "oi-1", subtotal: "0.00" })];

    const itemsChain = mockQuery({ data: items });
    const insertChain = mockQuery({
      data: [
        {
          id: "comm-1",
          order_item_id: "oi-1",
          supplier_id: SUPPLIER_1,
          sale_amount: "0.00",
          commission_amount: "0.00",
          supplier_amount: "0.00",
        },
      ],
    });

    mockFrom.mockReturnValueOnce(itemsChain).mockReturnValueOnce(insertChain);

    const result = await CommissionService.calculateOrderCommissions(ORDER_ID);

    expect(result).toHaveLength(1);
    expect(result[0].saleAmount).toBe(0);
    expect(result[0].commissionAmount).toBe(0);
    expect(result[0].supplierAmount).toBe(0);
  });

  it("supplier with commission_rate = 0 (0%) → full amount to supplier", async () => {
    const items = [
      makeOrderItemWithSupplier({
        id: "oi-1",
        subtotal: "100.00",
        suppliers: { commission_rate: "0.00", business_name: "Free Supplier" },
      }),
    ];

    const itemsChain = mockQuery({ data: items });
    const insertChain = mockQuery({
      data: [
        {
          id: "comm-1",
          order_item_id: "oi-1",
          supplier_id: SUPPLIER_1,
          sale_amount: "100.00",
          commission_amount: "0.00",
          supplier_amount: "100.00",
        },
      ],
    });

    mockFrom.mockReturnValueOnce(itemsChain).mockReturnValueOnce(insertChain);

    const result = await CommissionService.calculateOrderCommissions(ORDER_ID);

    expect(result[0].commissionAmount).toBe(0);
    expect(result[0].supplierAmount).toBe(100);
  });

  it("supplier with custom rate 12.00 (12%) → uses 12%", async () => {
    const items = [
      makeOrderItemWithSupplier({
        id: "oi-1",
        subtotal: "200.00",
        suppliers: { commission_rate: "12.00", business_name: "High Volume" },
      }),
    ];

    const itemsChain = mockQuery({ data: items });
    const insertChain = mockQuery({
      data: [
        {
          id: "comm-1",
          order_item_id: "oi-1",
          supplier_id: SUPPLIER_1,
          sale_amount: "200.00",
          commission_amount: "24.00",
          supplier_amount: "176.00",
        },
      ],
    });

    mockFrom.mockReturnValueOnce(itemsChain).mockReturnValueOnce(insertChain);

    const result = await CommissionService.calculateOrderCommissions(ORDER_ID);

    expect(result[0].commissionAmount).toBe(24);
    expect(result[0].supplierAmount).toBe(176);
  });

  it("supplier without custom rate → uses default 15%", async () => {
    const items = [
      makeOrderItemWithSupplier({
        id: "oi-1",
        subtotal: "100.00",
        suppliers: { commission_rate: null, business_name: "Default Rate" },
      }),
    ];

    const itemsChain = mockQuery({ data: items });
    const insertChain = mockQuery({
      data: [
        {
          id: "comm-1",
          order_item_id: "oi-1",
          supplier_id: SUPPLIER_1,
          sale_amount: "100.00",
          commission_amount: "15.00",
          supplier_amount: "85.00",
        },
      ],
    });

    mockFrom.mockReturnValueOnce(itemsChain).mockReturnValueOnce(insertChain);

    const result = await CommissionService.calculateOrderCommissions(ORDER_ID);

    expect(result[0].commissionAmount).toBe(15);
    expect(result[0].supplierAmount).toBe(85);
  });

  it("supplier current_balance incremented by supplier_payout amount", async () => {
    const items = [makeOrderItemWithSupplier({ id: "oi-1", subtotal: "100.00" })];

    const itemsChain = mockQuery({ data: items });
    const insertChain = mockQuery({
      data: [
        {
          id: "comm-1",
          order_item_id: "oi-1",
          supplier_id: SUPPLIER_1,
          sale_amount: "100.00",
          commission_amount: "15.00",
          supplier_amount: "85.00",
        },
      ],
    });

    mockFrom.mockReturnValueOnce(itemsChain).mockReturnValueOnce(insertChain);

    await CommissionService.calculateOrderCommissions(ORDER_ID);

    expect(mockRpc).toHaveBeenCalledWith("increment_supplier_balance", {
      p_supplier_id: SUPPLIER_1,
      p_amount: 85,
    });
  });

  it("commission status set to 'pending'", async () => {
    const items = [makeOrderItemWithSupplier()];

    const itemsChain = mockQuery({ data: items });
    const insertChain = mockQuery({
      data: [
        {
          id: "comm-1",
          order_item_id: "oi-1",
          supplier_id: SUPPLIER_1,
          sale_amount: "100.00",
          commission_amount: "15.00",
          supplier_amount: "85.00",
        },
      ],
    });

    mockFrom.mockReturnValueOnce(itemsChain).mockReturnValueOnce(insertChain);

    await CommissionService.calculateOrderCommissions(ORDER_ID);

    const insertData = insertChain.insert.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(insertData[0].status).toBe("pending");
  });

  it("order_id populated on commission record", async () => {
    const items = [makeOrderItemWithSupplier()];

    const itemsChain = mockQuery({ data: items });
    const insertChain = mockQuery({
      data: [
        {
          id: "comm-1",
          order_item_id: "oi-1",
          supplier_id: SUPPLIER_1,
          sale_amount: "100.00",
          commission_amount: "15.00",
          supplier_amount: "85.00",
        },
      ],
    });

    mockFrom.mockReturnValueOnce(itemsChain).mockReturnValueOnce(insertChain);

    await CommissionService.calculateOrderCommissions(ORDER_ID);

    const insertData = insertChain.insert.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(insertData[0].order_id).toBe(ORDER_ID);
  });
});

// ── reverseOrderCommissions ───────────────────────────────────────────

describe("CommissionService.reverseOrderCommissions", () => {
  it("all commissions for order get status = 'reversed'", async () => {
    const commissions = [
      makeCommissionRow({ id: "comm-1", supplier_payout: "85.00" }),
      makeCommissionRow({ id: "comm-2", supplier_payout: "42.50" }),
    ];

    const fetchChain = mockQuery({ data: commissions });
    const updateChain = mockQuery({ data: null });

    mockFrom.mockReturnValueOnce(fetchChain).mockReturnValueOnce(updateChain);

    await CommissionService.reverseOrderCommissions(ORDER_ID);

    expect(updateChain.update).toHaveBeenCalledWith({ status: "reversed" });
    expect(updateChain.in).toHaveBeenCalledWith("id", ["comm-1", "comm-2"]);
  });

  it("supplier balances decremented", async () => {
    const commissions = [
      makeCommissionRow({
        id: "comm-1",
        supplier_id: SUPPLIER_1,
        supplier_payout: "85.00",
      }),
    ];

    const fetchChain = mockQuery({ data: commissions });
    const updateChain = mockQuery({ data: null });

    mockFrom.mockReturnValueOnce(fetchChain).mockReturnValueOnce(updateChain);

    await CommissionService.reverseOrderCommissions(ORDER_ID);

    expect(mockRpc).toHaveBeenCalledWith("increment_supplier_balance", {
      p_supplier_id: SUPPLIER_1,
      p_amount: -85,
    });
  });

  it("balance doesn't go below 0 (GREATEST check via RPC)", async () => {
    const commissions = [
      makeCommissionRow({
        id: "comm-1",
        supplier_id: SUPPLIER_1,
        supplier_payout: "1000.00",
      }),
    ];

    const fetchChain = mockQuery({ data: commissions });
    const updateChain = mockQuery({ data: null });

    mockFrom.mockReturnValueOnce(fetchChain).mockReturnValueOnce(updateChain);

    await CommissionService.reverseOrderCommissions(ORDER_ID);

    expect(mockRpc).toHaveBeenCalledWith("increment_supplier_balance", {
      p_supplier_id: SUPPLIER_1,
      p_amount: -1000,
    });
  });

  it("already reversed commissions → not reversed again (idempotent)", async () => {
    const fetchChain = mockQuery({ data: [] });

    mockFrom.mockReturnValueOnce(fetchChain);

    await CommissionService.reverseOrderCommissions(ORDER_ID);

    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("filters with neq to exclude reversed commissions", async () => {
    const fetchChain = mockQuery({ data: [] });

    mockFrom.mockReturnValueOnce(fetchChain);

    await CommissionService.reverseOrderCommissions(ORDER_ID);

    expect(fetchChain.neq).toHaveBeenCalledWith("status", "reversed");
  });
});

// ── getCommissionsByOrder ─────────────────────────────────────────────

describe("CommissionService.getCommissionsByOrder", () => {
  it("returns commissions with product and supplier details", async () => {
    const commissionsData = [
      {
        ...makeCommissionRow(),
        order_items: { product_id: "prod-1", products: { name: "Surgical Gloves" } },
        suppliers: { business_name: "MedSupply Co" },
      },
    ];

    const fetchChain = mockQuery({ data: commissionsData });

    mockFrom.mockReturnValueOnce(fetchChain);

    const result = await CommissionService.getCommissionsByOrder(ORDER_ID);

    expect(result).toHaveLength(1);
    expect(result[0].productName).toBe("Surgical Gloves");
    expect(result[0].supplierName).toBe("MedSupply Co");
    expect(result[0].saleAmount).toBe(100);
    expect(result[0].commissionRate).toBe(15);
    expect(result[0].commissionAmount).toBe(15);
    expect(result[0].supplierPayout).toBe(85);
    expect(result[0].status).toBe("pending");
  });

  it("excludes reversed commissions", async () => {
    const fetchChain = mockQuery({ data: [] });

    mockFrom.mockReturnValueOnce(fetchChain);

    await CommissionService.getCommissionsByOrder(ORDER_ID);

    expect(fetchChain.neq).toHaveBeenCalledWith("status", "reversed");
  });

  it("empty for order with no commissions", async () => {
    const fetchChain = mockQuery({ data: [] });

    mockFrom.mockReturnValueOnce(fetchChain);

    const result = await CommissionService.getCommissionsByOrder(ORDER_ID);

    expect(result).toEqual([]);
  });
});

// ── getCommissionsBySupplier ──────────────────────────────────────────

describe("CommissionService.getCommissionsBySupplier", () => {
  it("filters by date range", async () => {
    const fetchChain = mockQuery({ data: [] });

    mockFrom.mockReturnValueOnce(fetchChain);

    await CommissionService.getCommissionsBySupplier(SUPPLIER_1, {
      startDate: "2026-01-01T00:00:00Z",
      endDate: "2026-02-01T00:00:00Z",
    });

    expect(fetchChain.gte).toHaveBeenCalledWith("created_at", "2026-01-01T00:00:00Z");
    expect(fetchChain.lte).toHaveBeenCalledWith("created_at", "2026-02-01T00:00:00Z");
  });

  it("filters by status", async () => {
    const fetchChain = mockQuery({ data: [] });

    mockFrom.mockReturnValueOnce(fetchChain);

    await CommissionService.getCommissionsBySupplier(SUPPLIER_1, {
      status: "confirmed",
    });

    const eqCalls = fetchChain.eq.mock.calls as Array<[string, string]>;
    expect(eqCalls).toContainEqual(["supplier_id", SUPPLIER_1]);
    expect(eqCalls).toContainEqual(["status", "confirmed"]);
  });
});

// ── getCommissionSummary ──────────────────────────────────────────────

describe("CommissionService.getCommissionSummary", () => {
  it("aggregates totals and returns current balance", async () => {
    const commissionsData = [
      {
        sale_amount: "100.00",
        commission_amount: "15.00",
        supplier_payout: "85.00",
        order_id: "order-1",
      },
      {
        sale_amount: "200.00",
        commission_amount: "30.00",
        supplier_payout: "170.00",
        order_id: "order-2",
      },
      {
        sale_amount: "50.00",
        commission_amount: "7.50",
        supplier_payout: "42.50",
        order_id: "order-1", // same order as first
      },
    ];

    const commissionsChain = mockQuery({ data: commissionsData });
    const supplierChain = mockQuery({
      data: { current_balance: "297.50" },
    });

    mockFrom.mockReturnValueOnce(commissionsChain).mockReturnValueOnce(supplierChain);

    const result = await CommissionService.getCommissionSummary(SUPPLIER_1);

    expect(result.totalSales).toBe(350);
    expect(result.totalCommission).toBe(52.5);
    expect(result.totalPayout).toBe(297.5);
    expect(result.currentBalance).toBe(297.5);
    expect(result.orderCount).toBe(2); // 2 distinct orders
  });
});
