import request from "supertest";

const mockVerifyToken = jest.fn();

jest.mock("../../src/services/auth.service", () => ({
  AuthService: {
    signUp: jest.fn(),
    verifyToken: mockVerifyToken,
  },
}));

const mockGetRevenueMetrics = jest.fn();
const mockGetRevenueBySupplier = jest.fn();
const mockGetRevenueByCategory = jest.fn();
const mockGetRevenueTrend = jest.fn();
const mockGetOrderMetrics = jest.fn();
const mockGetTopProducts = jest.fn();

jest.mock("../../src/services/platformAnalytics.service", () => ({
  PlatformAnalyticsService: {
    getRevenueMetrics: mockGetRevenueMetrics,
    getRevenueBySupplier: mockGetRevenueBySupplier,
    getRevenueByCategory: mockGetRevenueByCategory,
    getRevenueTrend: mockGetRevenueTrend,
    getOrderMetrics: mockGetOrderMetrics,
    getTopProducts: mockGetTopProducts,
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

describe("Platform Analytics API", () => {
  describe("Auth & RBAC", () => {
    it("returns 401 without auth token", async () => {
      const res = await request(app).get("/api/admin/analytics/revenue");
      expect(res.status).toBe(401);
    });

    it("returns 403 for non-admin", async () => {
      authAs(supplierUser);
      const res = await request(app)
        .get("/api/admin/analytics/revenue")
        .set("Authorization", "Bearer valid-token");
      expect(res.status).toBe(403);
    });
  });

  describe("GET /revenue", () => {
    it("returns revenue metrics", async () => {
      authAs(adminUser);
      mockGetRevenueMetrics.mockResolvedValue({
        current: {
          totalSales: 1000,
          totalCommission: 150,
          totalSupplierPayouts: 850,
          netPlatformRevenue: 150,
          orderCount: 10,
        },
        previous: {
          totalSales: 800,
          totalCommission: 120,
          totalSupplierPayouts: 680,
          netPlatformRevenue: 120,
          orderCount: 8,
        },
        changePercent: { sales: 25, commission: 25, orders: 25 },
      });

      const res = await request(app)
        .get("/api/admin/analytics/revenue?period=month")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body.current.totalSales).toBe(1000);
      expect(res.body.changePercent.sales).toBe(25);
    });

    it("returns 400 for invalid period", async () => {
      authAs(adminUser);
      const res = await request(app)
        .get("/api/admin/analytics/revenue?period=invalid")
        .set("Authorization", "Bearer valid-token");
      expect(res.status).toBe(400);
    });
  });

  describe("GET /revenue/suppliers", () => {
    it("returns supplier revenue breakdown", async () => {
      authAs(adminUser);
      mockGetRevenueBySupplier.mockResolvedValue([
        {
          supplierId: "s1",
          supplierName: "MedCo",
          totalSales: 500,
          platformCommission: 75,
          supplierPayout: 425,
          orderCount: 5,
        },
      ]);

      const res = await request(app)
        .get("/api/admin/analytics/revenue/suppliers?limit=5")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].supplierName).toBe("MedCo");
    });
  });

  describe("GET /revenue/categories", () => {
    it("returns category revenue breakdown", async () => {
      authAs(adminUser);
      mockGetRevenueByCategory.mockResolvedValue([
        { category: "PPE", totalSales: 1000, orderCount: 20, unitsSold: 100 },
      ]);

      const res = await request(app)
        .get("/api/admin/analytics/revenue/categories")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body[0].category).toBe("PPE");
    });
  });

  describe("GET /revenue/trend", () => {
    it("returns trend data points", async () => {
      authAs(adminUser);
      mockGetRevenueTrend.mockResolvedValue([
        { date: "2026-01-15", revenue: 300, commission: 45, orders: 3 },
      ]);

      const res = await request(app)
        .get("/api/admin/analytics/revenue/trend?period=daily")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body[0].date).toBe("2026-01-15");
    });
  });

  describe("GET /orders", () => {
    it("returns order metrics", async () => {
      authAs(adminUser);
      mockGetOrderMetrics.mockResolvedValue({
        totalOrders: 100,
        paidOrders: 80,
        cancelledOrders: 5,
        averageOrderValue: 150,
        conversionRate: 80,
      });

      const res = await request(app)
        .get("/api/admin/analytics/orders?period=month")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body.totalOrders).toBe(100);
      expect(res.body.conversionRate).toBe(80);
    });
  });

  describe("GET /top-products", () => {
    it("returns top products", async () => {
      authAs(adminUser);
      mockGetTopProducts.mockResolvedValue([
        {
          productId: "p1",
          productName: "Gloves",
          category: "PPE",
          supplierName: "MedCo",
          totalSold: 100,
          totalRevenue: 999,
        },
      ]);

      const res = await request(app)
        .get("/api/admin/analytics/top-products?limit=5")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body[0].productName).toBe("Gloves");
    });
  });
});
