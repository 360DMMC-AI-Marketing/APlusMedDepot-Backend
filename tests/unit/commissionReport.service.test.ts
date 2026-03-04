const mockFrom = jest.fn();

jest.mock("../../src/config/supabase", () => ({
  supabaseAdmin: {
    from: mockFrom,
  },
}));

import { CommissionReportService } from "../../src/services/commissionReport.service";

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

// ── getPlatformEarnings ────────────────────────────────────────────────

describe("CommissionReportService.getPlatformEarnings", () => {
  it("returns correct totals and trend", async () => {
    const rows = [
      {
        sale_amount: "100.00",
        commission_amount: "15.00",
        commission_rate: "15.00",
        supplier_payout: "85.00",
        order_id: "o1",
        created_at: "2026-01-10T10:00:00Z",
      },
      {
        sale_amount: "200.00",
        commission_amount: "30.00",
        commission_rate: "15.00",
        supplier_payout: "170.00",
        order_id: "o2",
        created_at: "2026-01-10T14:00:00Z",
      },
      {
        sale_amount: "50.00",
        commission_amount: "10.00",
        commission_rate: "20.00",
        supplier_payout: "40.00",
        order_id: "o3",
        created_at: "2026-01-17T10:00:00Z",
      },
    ];
    mockFrom.mockReturnValue(mockQuery({ data: rows }));

    const result = await CommissionReportService.getPlatformEarnings({ period: "month" });

    expect(result.totalGrossSales).toBe(350);
    expect(result.totalPlatformCommission).toBe(55);
    expect(result.totalSupplierPayouts).toBe(295);
    expect(result.commissionCount).toBe(3);
    expect(result.averageCommissionRate).toBeCloseTo(16.67, 1);
    expect(result.trend.length).toBeGreaterThan(0);
  });

  it("excludes reversed commissions via query filter", async () => {
    mockFrom.mockReturnValue(mockQuery({ data: [] }));

    await CommissionReportService.getPlatformEarnings({ period: "month" });

    const q = mockFrom.mock.results[0].value;
    expect(q.neq).toHaveBeenCalledWith("status", "reversed");
  });

  it("returns zeros for empty data", async () => {
    mockFrom.mockReturnValue(mockQuery({ data: [] }));

    const result = await CommissionReportService.getPlatformEarnings({ period: "month" });

    expect(result.totalGrossSales).toBe(0);
    expect(result.commissionCount).toBe(0);
    expect(result.averageCommissionRate).toBe(0);
    expect(result.trend).toEqual([]);
  });
});

// ── getCommissionBySupplierReport ──────────────────────────────────────

describe("CommissionReportService.getCommissionBySupplierReport", () => {
  it("returns suppliers ordered by totalSales DESC with balances", async () => {
    const commissionRows = [
      {
        supplier_id: "s1",
        sale_amount: "500.00",
        commission_amount: "75.00",
        commission_rate: "15.00",
        supplier_payout: "425.00",
        order_id: "o1",
        suppliers: { business_name: "SupA" },
      },
      {
        supplier_id: "s2",
        sale_amount: "100.00",
        commission_amount: "15.00",
        commission_rate: "15.00",
        supplier_payout: "85.00",
        order_id: "o2",
        suppliers: { business_name: "SupB" },
      },
    ];
    const supplierBalances = [
      { id: "s1", current_balance: "425.00" },
      { id: "s2", current_balance: "85.00" },
    ];

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return mockQuery({ data: commissionRows });
      return mockQuery({ data: supplierBalances });
    });

    const result = await CommissionReportService.getCommissionBySupplierReport({
      startDate: "2026-01-01T00:00:00Z",
      endDate: "2026-01-31T23:59:59Z",
    });

    expect(result.data).toHaveLength(2);
    expect(result.data[0].supplierName).toBe("SupA");
    expect(result.data[0].totalSales).toBe(500);
    expect(result.data[0].currentBalance).toBe(425);
    expect(result.data[1].supplierName).toBe("SupB");
  });

  it("paginates results", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({
      supplier_id: `s${i}`,
      sale_amount: `${(5 - i) * 100}.00`,
      commission_amount: `${(5 - i) * 15}.00`,
      commission_rate: "15.00",
      supplier_payout: `${(5 - i) * 85}.00`,
      order_id: `o${i}`,
      suppliers: { business_name: `Sup${i}` },
    }));

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return mockQuery({ data: rows });
      return mockQuery({ data: [] });
    });

    const result = await CommissionReportService.getCommissionBySupplierReport({
      startDate: "2026-01-01T00:00:00Z",
      endDate: "2026-01-31T23:59:59Z",
      page: 1,
      limit: 2,
    });

    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(5);
    expect(result.totalPages).toBe(3);
  });
});

// ── getCommissionTrend ─────────────────────────────────────────────────

describe("CommissionReportService.getCommissionTrend", () => {
  it("returns daily trend data", async () => {
    const rows = [
      {
        sale_amount: "100.00",
        commission_amount: "15.00",
        supplier_payout: "85.00",
        order_id: "o1",
        created_at: "2026-01-15T10:00:00Z",
      },
      {
        sale_amount: "200.00",
        commission_amount: "30.00",
        supplier_payout: "170.00",
        order_id: "o2",
        created_at: "2026-01-16T10:00:00Z",
      },
    ];
    mockFrom.mockReturnValue(mockQuery({ data: rows }));

    const result = await CommissionReportService.getCommissionTrend({
      granularity: "daily",
    });

    expect(result).toHaveLength(2);
    expect(result[0].date).toBe("2026-01-15");
    expect(result[0].grossSales).toBe(100);
    expect(result[0].platformCommission).toBe(15);
    expect(result[1].date).toBe("2026-01-16");
  });

  it("returns empty array for no data", async () => {
    mockFrom.mockReturnValue(mockQuery({ data: [] }));

    const result = await CommissionReportService.getCommissionTrend({
      granularity: "weekly",
    });

    expect(result).toEqual([]);
  });

  it("applies date filter", async () => {
    mockFrom.mockReturnValue(mockQuery({ data: [] }));

    await CommissionReportService.getCommissionTrend({
      granularity: "monthly",
      startDate: "2026-01-01T00:00:00Z",
      endDate: "2026-03-31T23:59:59Z",
    });

    const q = mockFrom.mock.results[0].value;
    expect(q.gte).toHaveBeenCalledWith("created_at", "2026-01-01T00:00:00Z");
    expect(q.lte).toHaveBeenCalledWith("created_at", "2026-03-31T23:59:59Z");
  });
});
