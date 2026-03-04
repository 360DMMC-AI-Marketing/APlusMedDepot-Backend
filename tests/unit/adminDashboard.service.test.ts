const mockFrom = jest.fn();

jest.mock("../../src/config/supabase", () => ({
  supabaseAdmin: {
    from: mockFrom,
  },
}));

jest.mock("../../src/services/email.service", () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../src/utils/securityLogger", () => ({
  logAdminAction: jest.fn(),
}));

import { AdminDashboardService } from "../../src/services/adminDashboard.service";

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
  chain.lt = jest.fn(self);
  chain.is = jest.fn(self);
  chain.not = jest.fn(self);
  chain.in = jest.fn(self);
  chain.or = jest.fn(self);
  chain.ilike = jest.fn(self);
  chain.order = jest.fn(self);
  chain.range = jest.fn(self);
  chain.limit = jest.fn(self);
  chain.single = jest.fn().mockResolvedValue(resolved);
  chain.maybeSingle = jest.fn().mockResolvedValue(resolved);
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

describe("AdminDashboardService.getDashboardSummary", () => {
  it("returns complete dashboard structure with all sections", async () => {
    // The dashboard calls many sub-services which all call supabaseAdmin.from()
    // We'll mock enough to not throw
    mockFrom.mockReturnValue(mockQuery({ data: [], count: 0 }));

    const result = await AdminDashboardService.getDashboardSummary();

    expect(result).toHaveProperty("pendingActions");
    expect(result).toHaveProperty("revenue");
    expect(result).toHaveProperty("orders");
    expect(result).toHaveProperty("recentOrders");
    expect(result).toHaveProperty("platformHealth");

    expect(result.pendingActions).toHaveProperty("users");
    expect(result.pendingActions).toHaveProperty("suppliers");
    expect(result.pendingActions).toHaveProperty("products");
    expect(result.pendingActions).toHaveProperty("total");

    expect(result.revenue).toHaveProperty("thisMonth");
    expect(result.revenue).toHaveProperty("lastMonth");
    expect(result.revenue).toHaveProperty("changePercent");

    expect(result.orders).toHaveProperty("thisMonth");
    expect(result.orders).toHaveProperty("averageValue");
    expect(result.orders).toHaveProperty("byStatus");

    expect(Array.isArray(result.recentOrders)).toBe(true);
    expect(result.recentOrders.length).toBeLessThanOrEqual(5);

    expect(result.platformHealth).toHaveProperty("activeUsers");
    expect(result.platformHealth).toHaveProperty("activeSuppliers");
    expect(result.platformHealth).toHaveProperty("activeProducts");
  });

  it("returns default zeros when sub-queries return empty data", async () => {
    mockFrom.mockReturnValue(mockQuery({ data: [], count: 0 }));

    const result = await AdminDashboardService.getDashboardSummary();

    expect(result.pendingActions.total).toBe(0);
    expect(result.revenue.thisMonth).toBe(0);
    expect(result.orders.thisMonth).toBe(0);
    expect(result.platformHealth.activeUsers).toBe(0);
  });

  it("graceful degradation — one sub-query failure doesn't crash dashboard", async () => {
    // First few calls succeed, then one fails
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 5) {
        return mockQuery({ error: { message: "DB error" } });
      }
      return mockQuery({ data: [], count: 0 });
    });

    // Should not throw
    const result = await AdminDashboardService.getDashboardSummary();

    expect(result).toHaveProperty("pendingActions");
    expect(result).toHaveProperty("platformHealth");
  });
});
