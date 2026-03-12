const mockFrom = jest.fn();

jest.mock("../../src/config/supabase", () => ({
  supabaseAdmin: {
    from: mockFrom,
  },
}));

import { PlatformAnalyticsService } from "../../src/services/platformAnalytics.service";

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
  chain.gte = jest.fn(self);
  chain.lte = jest.fn(self);
  chain.is = jest.fn(self);
  chain.in = jest.fn(self);
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

beforeEach(() => {
  jest.clearAllMocks();
});

// ── getRevenueMetrics ──────────────────────────────────────────────────

describe("PlatformAnalyticsService.getRevenueMetrics", () => {
  it("returns revenue comparison with current and previous period", async () => {
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 15).toISOString();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15).toISOString();

    const rows = [
      {
        sale_amount: "100.00",
        commission_amount: "15.00",
        supplier_payout: "85.00",
        order_id: "o1",
        created_at: thisMonth,
      },
      {
        sale_amount: "200.00",
        commission_amount: "30.00",
        supplier_payout: "170.00",
        order_id: "o2",
        created_at: thisMonth,
      },
      {
        sale_amount: "50.00",
        commission_amount: "7.50",
        supplier_payout: "42.50",
        order_id: "o3",
        created_at: lastMonth,
      },
    ];

    mockFrom.mockReturnValue(mockQuery({ data: rows }));

    const result = await PlatformAnalyticsService.getRevenueMetrics("month");

    expect(result.current.totalSales).toBe(300);
    expect(result.current.totalCommission).toBe(45);
    expect(result.current.netPlatformRevenue).toBe(45);
    expect(result.current.orderCount).toBe(2);
    expect(result.previous.totalSales).toBe(50);
    expect(result.changePercent.sales).toBe(500);
  });

  it("excludes reversed commissions (handled via query filter)", async () => {
    mockFrom.mockReturnValue(mockQuery({ data: [] }));

    await PlatformAnalyticsService.getRevenueMetrics("month");

    const q = mockFrom.mock.results[0].value;
    expect(q.neq).toHaveBeenCalledWith("status", "reversed");
  });

  it("returns zeros for empty data", async () => {
    mockFrom.mockReturnValue(mockQuery({ data: [] }));

    const result = await PlatformAnalyticsService.getRevenueMetrics("month");

    expect(result.current.totalSales).toBe(0);
    expect(result.current.orderCount).toBe(0);
    expect(result.changePercent.sales).toBe(0);
  });

  it("handles 'all' period without date filter", async () => {
    mockFrom.mockReturnValue(mockQuery({ data: [] }));

    const result = await PlatformAnalyticsService.getRevenueMetrics("all");

    expect(result.current).toBeDefined();
    expect(result.previous.totalSales).toBe(0);
  });
});

// ── getRevenueBySupplier ───────────────────────────────────────────────

describe("PlatformAnalyticsService.getRevenueBySupplier", () => {
  it("returns suppliers ordered by totalSales DESC", async () => {
    const rows = [
      {
        supplier_id: "s1",
        sale_amount: "100.00",
        commission_amount: "15.00",
        supplier_payout: "85.00",
        order_id: "o1",
        suppliers: { business_name: "SupA" },
      },
      {
        supplier_id: "s2",
        sale_amount: "500.00",
        commission_amount: "75.00",
        supplier_payout: "425.00",
        order_id: "o2",
        suppliers: { business_name: "SupB" },
      },
      {
        supplier_id: "s1",
        sale_amount: "200.00",
        commission_amount: "30.00",
        supplier_payout: "170.00",
        order_id: "o3",
        suppliers: { business_name: "SupA" },
      },
    ];
    mockFrom.mockReturnValue(mockQuery({ data: rows }));

    const result = await PlatformAnalyticsService.getRevenueBySupplier({ limit: 10 });

    expect(result).toHaveLength(2);
    expect(result[0].supplierName).toBe("SupB");
    expect(result[0].totalSales).toBe(500);
    expect(result[1].supplierName).toBe("SupA");
    expect(result[1].totalSales).toBe(300);
    expect(result[1].orderCount).toBe(2);
  });

  it("respects limit", async () => {
    const rows = [
      {
        supplier_id: "s1",
        sale_amount: "100.00",
        commission_amount: "15.00",
        supplier_payout: "85.00",
        order_id: "o1",
        suppliers: { business_name: "A" },
      },
      {
        supplier_id: "s2",
        sale_amount: "200.00",
        commission_amount: "30.00",
        supplier_payout: "170.00",
        order_id: "o2",
        suppliers: { business_name: "B" },
      },
    ];
    mockFrom.mockReturnValue(mockQuery({ data: rows }));

    const result = await PlatformAnalyticsService.getRevenueBySupplier({ limit: 1 });

    expect(result).toHaveLength(1);
    expect(result[0].supplierName).toBe("B");
  });
});

// ── getRevenueByCategory ───────────────────────────────────────────────

describe("PlatformAnalyticsService.getRevenueByCategory", () => {
  it("returns categories ordered by totalSales DESC", async () => {
    const rows = [
      { quantity: 10, subtotal: "100.00", order_id: "o1", products: { category: "PPE" } },
      { quantity: 5, subtotal: "500.00", order_id: "o2", products: { category: "Equipment" } },
      { quantity: 3, subtotal: "50.00", order_id: "o3", products: { category: "PPE" } },
    ];
    mockFrom.mockReturnValue(mockQuery({ data: rows }));

    const result = await PlatformAnalyticsService.getRevenueByCategory();

    expect(result).toHaveLength(2);
    expect(result[0].category).toBe("Equipment");
    expect(result[0].totalSales).toBe(500);
    expect(result[1].category).toBe("PPE");
    expect(result[1].unitsSold).toBe(13);
  });
});

// ── getRevenueTrend ────────────────────────────────────────────────────

describe("PlatformAnalyticsService.getRevenueTrend", () => {
  it("returns daily trend data points", async () => {
    const rows = [
      {
        sale_amount: "100.00",
        commission_amount: "15.00",
        order_id: "o1",
        created_at: "2026-01-15T10:00:00Z",
      },
      {
        sale_amount: "200.00",
        commission_amount: "30.00",
        order_id: "o2",
        created_at: "2026-01-15T14:00:00Z",
      },
      {
        sale_amount: "50.00",
        commission_amount: "7.50",
        order_id: "o3",
        created_at: "2026-01-16T10:00:00Z",
      },
    ];
    mockFrom.mockReturnValue(mockQuery({ data: rows }));

    const result = await PlatformAnalyticsService.getRevenueTrend({ period: "daily" });

    expect(result).toHaveLength(2);
    expect(result[0].date).toBe("2026-01-15");
    expect(result[0].revenue).toBe(300);
    expect(result[0].orders).toBe(2);
    expect(result[1].date).toBe("2026-01-16");
    expect(result[1].revenue).toBe(50);
  });

  it("returns empty array for no data", async () => {
    mockFrom.mockReturnValue(mockQuery({ data: [] }));

    const result = await PlatformAnalyticsService.getRevenueTrend({ period: "daily" });

    expect(result).toEqual([]);
  });
});

// ── getOrderMetrics ────────────────────────────────────────────────────

describe("PlatformAnalyticsService.getOrderMetrics", () => {
  it("returns correct calculations", async () => {
    const rows = [
      { status: "payment_confirmed", payment_status: "paid", total_amount: "100.00" },
      { status: "payment_confirmed", payment_status: "paid", total_amount: "200.00" },
      { status: "cancelled", payment_status: "refunded", total_amount: "50.00" },
      { status: "pending_payment", payment_status: "pending", total_amount: "75.00" },
    ];
    mockFrom.mockReturnValue(mockQuery({ data: rows }));

    const result = await PlatformAnalyticsService.getOrderMetrics("month");

    expect(result.totalOrders).toBe(4);
    expect(result.paidOrders).toBe(2);
    expect(result.cancelledOrders).toBe(1);
    expect(result.averageOrderValue).toBe(150);
    expect(result.conversionRate).toBe(50);
  });

  it("returns zeros for empty data", async () => {
    mockFrom.mockReturnValue(mockQuery({ data: [] }));

    const result = await PlatformAnalyticsService.getOrderMetrics("month");

    expect(result.totalOrders).toBe(0);
    expect(result.averageOrderValue).toBe(0);
    expect(result.conversionRate).toBe(0);
  });
});

// ── getTopProducts ─────────────────────────────────────────────────────

describe("PlatformAnalyticsService.getTopProducts", () => {
  it("returns top products ordered by revenue DESC", async () => {
    const rows = [
      {
        product_id: "p1",
        quantity: 10,
        subtotal: "100.00",
        products: {
          name: "Gloves",
          category: "PPE",
          supplier_id: "s1",
          suppliers: { business_name: "MedCo" },
        },
      },
      {
        product_id: "p2",
        quantity: 5,
        subtotal: "500.00",
        products: {
          name: "Ventilator",
          category: "Equipment",
          supplier_id: "s1",
          suppliers: { business_name: "MedCo" },
        },
      },
      {
        product_id: "p1",
        quantity: 3,
        subtotal: "30.00",
        products: {
          name: "Gloves",
          category: "PPE",
          supplier_id: "s1",
          suppliers: { business_name: "MedCo" },
        },
      },
    ];
    mockFrom.mockReturnValue(mockQuery({ data: rows }));

    const result = await PlatformAnalyticsService.getTopProducts(10);

    expect(result).toHaveLength(2);
    expect(result[0].productName).toBe("Ventilator");
    expect(result[0].totalRevenue).toBe(500);
    expect(result[1].productName).toBe("Gloves");
    expect(result[1].totalSold).toBe(13);
    expect(result[1].totalRevenue).toBe(130);
  });

  it("respects limit", async () => {
    const rows = [
      {
        product_id: "p1",
        quantity: 10,
        subtotal: "100.00",
        products: {
          name: "A",
          category: "X",
          supplier_id: "s1",
          suppliers: { business_name: "S" },
        },
      },
      {
        product_id: "p2",
        quantity: 5,
        subtotal: "200.00",
        products: {
          name: "B",
          category: "X",
          supplier_id: "s1",
          suppliers: { business_name: "S" },
        },
      },
    ];
    mockFrom.mockReturnValue(mockQuery({ data: rows }));

    const result = await PlatformAnalyticsService.getTopProducts(1);

    expect(result).toHaveLength(1);
  });
});
