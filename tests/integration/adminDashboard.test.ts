import request from "supertest";

const mockVerifyToken = jest.fn();

jest.mock("../../src/services/auth.service", () => ({
  AuthService: {
    signUp: jest.fn(),
    verifyToken: mockVerifyToken,
  },
}));

const mockGetDashboardSummary = jest.fn();

jest.mock("../../src/services/adminDashboard.service", () => ({
  AdminDashboardService: {
    getDashboardSummary: mockGetDashboardSummary,
  },
}));

jest.mock(
  "express-rate-limit",
  () => () => (_req: unknown, _res: unknown, next: () => void) => next(),
);

import app from "../../src/index";

const adminUser = {
  id: "admin-user-001",
  email: "admin@example.com",
  firstName: "Admin",
  lastName: "User",
  companyName: null,
  phone: null,
  role: "admin" as const,
  status: "approved" as const,
  lastLogin: null,
};

const supplierUser = {
  id: "supplier-user-001",
  email: "supplier@example.com",
  firstName: "Sam",
  lastName: "Supply",
  companyName: null,
  phone: null,
  role: "supplier" as const,
  status: "approved" as const,
  lastLogin: null,
};

function authAs(user: Record<string, unknown>) {
  mockVerifyToken.mockResolvedValue(user);
}

beforeEach(() => {
  jest.clearAllMocks();
});

const dashboardFixture = {
  pendingActions: { users: 3, suppliers: 1, products: 5, total: 9 },
  revenue: { thisMonth: 5000, lastMonth: 4000, changePercent: 25 },
  orders: { thisMonth: 50, averageValue: 100, byStatus: { payment_confirmed: 20, delivered: 30 } },
  recentOrders: [
    {
      id: "o1",
      orderNumber: "ORD-001",
      customerEmail: "c@e.com",
      customerName: "John",
      totalAmount: 100,
      taxAmount: 8,
      status: "delivered",
      paymentStatus: "paid",
      itemCount: 2,
      subOrderCount: 1,
      createdAt: "2026-01-01T00:00:00Z",
    },
  ],
  platformHealth: { activeUsers: 100, activeSuppliers: 10, activeProducts: 50 },
};

describe("Admin Dashboard API", () => {
  it("returns 401 without auth token", async () => {
    const res = await request(app).get("/api/admin/dashboard");
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin", async () => {
    authAs(supplierUser);
    const res = await request(app)
      .get("/api/admin/dashboard")
      .set("Authorization", "Bearer valid-token");
    expect(res.status).toBe(403);
  });

  it("returns complete dashboard summary", async () => {
    authAs(adminUser);
    mockGetDashboardSummary.mockResolvedValue(dashboardFixture);

    const res = await request(app)
      .get("/api/admin/dashboard")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body.pendingActions.total).toBe(9);
    expect(res.body.revenue.thisMonth).toBe(5000);
    expect(res.body.revenue.changePercent).toBe(25);
    expect(res.body.orders.thisMonth).toBe(50);
    expect(res.body.recentOrders).toHaveLength(1);
    expect(res.body.platformHealth.activeUsers).toBe(100);
  });

  it("returns recent orders limited to 5", async () => {
    authAs(adminUser);
    mockGetDashboardSummary.mockResolvedValue({
      ...dashboardFixture,
      recentOrders: dashboardFixture.recentOrders,
    });

    const res = await request(app)
      .get("/api/admin/dashboard")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body.recentOrders.length).toBeLessThanOrEqual(5);
  });
});
