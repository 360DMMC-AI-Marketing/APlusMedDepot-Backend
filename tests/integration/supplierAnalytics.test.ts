import request from "supertest";

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports that reference them
// ---------------------------------------------------------------------------
const mockVerifyToken = jest.fn();

jest.mock("../../src/services/auth.service", () => ({
  AuthService: {
    signUp: jest.fn(),
    verifyToken: mockVerifyToken,
  },
}));

const mockGetProductAnalytics = jest.fn();
const mockGetAggregateAnalytics = jest.fn();
const mockGetSupplierIdFromUserId = jest.fn();
const mockGetDashboardStats = jest.fn();
const mockGetTopProducts = jest.fn();
const mockGetRevenueTrend = jest.fn();
const mockGetOrderStatusBreakdown = jest.fn();

jest.mock("../../src/services/supplierAnalytics.service", () => ({
  SupplierAnalyticsService: {
    getProductAnalytics: mockGetProductAnalytics,
    getAggregateAnalytics: mockGetAggregateAnalytics,
    getSupplierIdFromUserId: mockGetSupplierIdFromUserId,
    getDashboardStats: mockGetDashboardStats,
    getTopProducts: mockGetTopProducts,
    getRevenueTrend: mockGetRevenueTrend,
    getOrderStatusBreakdown: mockGetOrderStatusBreakdown,
  },
}));

jest.mock(
  "express-rate-limit",
  () => () => (_req: unknown, _res: unknown, next: () => void) => next(),
);

import app from "../../src/index";
import { AppError } from "../../src/utils/errors";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const PRODUCT_ID = "a0000000-0000-4000-8000-000000000001";
const SUPPLIER_ID = "b0000000-0000-4000-8000-000000000001";

const supplierUser = {
  id: "user-supplier-analytics-1",
  email: "supplier-analytics@example.com",
  firstName: "Sam",
  lastName: "Supply",
  companyName: null,
  phone: null,
  role: "supplier" as const,
  status: "approved" as const,
  lastLogin: null,
};

const customerUser = {
  id: "user-customer-analytics-1",
  email: "customer-analytics@example.com",
  firstName: "Jane",
  lastName: "Doe",
  companyName: null,
  phone: null,
  role: "customer" as const,
  status: "approved" as const,
  lastLogin: null,
};

const productAnalyticsWithOrders = {
  product_id: PRODUCT_ID,
  total_sold: 150,
  total_revenue: 1499.5,
  order_count: 12,
  average_quantity_per_order: 12.5,
  period: "30d",
};

const productAnalyticsEmpty = {
  product_id: PRODUCT_ID,
  total_sold: 0,
  total_revenue: 0,
  order_count: 0,
  average_quantity_per_order: 0,
  period: "30d",
};

const aggregateAnalytics = {
  top_products: [
    { product_id: PRODUCT_ID, name: "Surgical Gloves", total_sold: 150, total_revenue: 1499.5 },
    {
      product_id: "a0000000-0000-4000-8000-000000000002",
      name: "Face Masks",
      total_sold: 80,
      total_revenue: 799.2,
    },
  ],
  summary: {
    total_revenue: 2298.7,
    total_orders: 20,
    average_order_value: 114.94,
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function authAs(user: Record<string, unknown>) {
  mockVerifyToken.mockResolvedValue(user);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("Supplier Analytics API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // GET /api/suppliers/products/:id/analytics
  // =========================================================================
  describe("GET /suppliers/products/:id/analytics", () => {
    it("returns correct totals for a product with orders", async () => {
      authAs(supplierUser);
      mockGetSupplierIdFromUserId.mockResolvedValue(SUPPLIER_ID);
      mockGetProductAnalytics.mockResolvedValue(productAnalyticsWithOrders);

      const res = await request(app)
        .get(`/api/suppliers/products/${PRODUCT_ID}/analytics`)
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body.product_id).toBe(PRODUCT_ID);
      expect(res.body.total_sold).toBe(150);
      expect(res.body.total_revenue).toBe(1499.5);
      expect(res.body.order_count).toBe(12);
      expect(res.body.average_quantity_per_order).toBe(12.5);
      expect(res.body.period).toBe("30d");
      expect(mockGetProductAnalytics).toHaveBeenCalledWith(SUPPLIER_ID, PRODUCT_ID, "30d");
    });

    it("returns all zeros for a product with no orders", async () => {
      authAs(supplierUser);
      mockGetSupplierIdFromUserId.mockResolvedValue(SUPPLIER_ID);
      mockGetProductAnalytics.mockResolvedValue(productAnalyticsEmpty);

      const res = await request(app)
        .get(`/api/suppliers/products/${PRODUCT_ID}/analytics`)
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body.total_sold).toBe(0);
      expect(res.body.total_revenue).toBe(0);
      expect(res.body.order_count).toBe(0);
      expect(res.body.average_quantity_per_order).toBe(0);
    });

    it("passes period query param to service", async () => {
      authAs(supplierUser);
      mockGetSupplierIdFromUserId.mockResolvedValue(SUPPLIER_ID);
      mockGetProductAnalytics.mockResolvedValue({ ...productAnalyticsWithOrders, period: "7d" });

      const res = await request(app)
        .get(`/api/suppliers/products/${PRODUCT_ID}/analytics?period=7d`)
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(mockGetProductAnalytics).toHaveBeenCalledWith(SUPPLIER_ID, PRODUCT_ID, "7d");
    });

    it("returns 403 when product belongs to another supplier", async () => {
      authAs(supplierUser);
      mockGetSupplierIdFromUserId.mockResolvedValue(SUPPLIER_ID);
      mockGetProductAnalytics.mockRejectedValue(
        new AppError("Not authorized to view analytics for this product", 403, "FORBIDDEN"),
      );

      const res = await request(app)
        .get(`/api/suppliers/products/${PRODUCT_ID}/analytics`)
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(403);
    });

    it("returns 401 when no auth token is provided", async () => {
      const res = await request(app).get(`/api/suppliers/products/${PRODUCT_ID}/analytics`);
      expect(res.status).toBe(401);
    });

    it("returns 403 when a customer tries to access", async () => {
      authAs(customerUser);

      const res = await request(app)
        .get(`/api/suppliers/products/${PRODUCT_ID}/analytics`)
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // GET /api/suppliers/analytics/products
  // =========================================================================
  describe("GET /suppliers/analytics/products", () => {
    it("returns aggregate analytics with top products and summary", async () => {
      authAs(supplierUser);
      mockGetSupplierIdFromUserId.mockResolvedValue(SUPPLIER_ID);
      mockGetAggregateAnalytics.mockResolvedValue(aggregateAnalytics);

      const res = await request(app)
        .get("/api/suppliers/analytics/products")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body.top_products).toHaveLength(2);
      expect(res.body.top_products[0].name).toBe("Surgical Gloves");
      expect(res.body.top_products[0].total_sold).toBe(150);
      expect(res.body.summary.total_revenue).toBe(2298.7);
      expect(res.body.summary.total_orders).toBe(20);
      expect(res.body.summary.average_order_value).toBe(114.94);
    });

    it("returns empty top_products and zero summary when no orders exist", async () => {
      authAs(supplierUser);
      mockGetSupplierIdFromUserId.mockResolvedValue(SUPPLIER_ID);
      mockGetAggregateAnalytics.mockResolvedValue({
        top_products: [],
        summary: { total_revenue: 0, total_orders: 0, average_order_value: 0 },
      });

      const res = await request(app)
        .get("/api/suppliers/analytics/products")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body.top_products).toHaveLength(0);
      expect(res.body.summary.total_revenue).toBe(0);
      expect(res.body.summary.total_orders).toBe(0);
    });

    it("returns 401 when no auth token is provided", async () => {
      const res = await request(app).get("/api/suppliers/analytics/products");
      expect(res.status).toBe(401);
    });

    it("returns 403 when a customer tries to access", async () => {
      authAs(customerUser);

      const res = await request(app)
        .get("/api/suppliers/analytics/products")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // GET /api/suppliers/analytics/dashboard
  // =========================================================================
  describe("GET /suppliers/analytics/dashboard", () => {
    it("dashboard stats return correct structure with numeric values", async () => {
      authAs(supplierUser);
      mockGetSupplierIdFromUserId.mockResolvedValue(SUPPLIER_ID);
      mockGetDashboardStats.mockResolvedValue({
        revenueThisMonth: 2500.0,
        revenueLastMonth: 2000.0,
        revenueChangePercent: 25,
        ordersThisMonth: 15,
        ordersLastMonth: 12,
        averageOrderValue: 166.67,
        activeProducts: 8,
      });

      const res = await request(app)
        .get("/api/suppliers/analytics/dashboard")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(typeof res.body.revenueThisMonth).toBe("number");
      expect(typeof res.body.revenueLastMonth).toBe("number");
      expect(typeof res.body.revenueChangePercent).toBe("number");
      expect(typeof res.body.ordersThisMonth).toBe("number");
      expect(typeof res.body.ordersLastMonth).toBe("number");
      expect(typeof res.body.averageOrderValue).toBe("number");
      expect(typeof res.body.activeProducts).toBe("number");
      expect(res.body.revenueThisMonth).toBe(2500);
      expect(res.body.revenueChangePercent).toBe(25);
      expect(res.body.activeProducts).toBe(8);
    });
  });

  // =========================================================================
  // GET /api/suppliers/analytics/top-products
  // =========================================================================
  describe("GET /suppliers/analytics/top-products", () => {
    it("top products ordered by revenue DESC", async () => {
      authAs(supplierUser);
      mockGetSupplierIdFromUserId.mockResolvedValue(SUPPLIER_ID);
      mockGetTopProducts.mockResolvedValue([
        { productId: PRODUCT_ID, name: "Surgical Gloves", totalSold: 50, totalRevenue: 1500 },
        {
          productId: "a0000000-0000-4000-8000-000000000002",
          name: "Face Masks",
          totalSold: 200,
          totalRevenue: 800,
        },
      ]);

      const res = await request(app)
        .get("/api/suppliers/analytics/top-products")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      // First product has higher revenue despite fewer units sold
      expect(res.body[0].name).toBe("Surgical Gloves");
      expect(res.body[0].totalRevenue).toBe(1500);
      expect(res.body[1].name).toBe("Face Masks");
      expect(res.body[1].totalRevenue).toBe(800);
      expect(mockGetTopProducts).toHaveBeenCalledWith(SUPPLIER_ID, 5);
    });
  });

  // =========================================================================
  // GET /api/suppliers/analytics/revenue-trend
  // =========================================================================
  describe("GET /suppliers/analytics/revenue-trend", () => {
    it("revenue trend returns data points for requested period", async () => {
      authAs(supplierUser);
      mockGetSupplierIdFromUserId.mockResolvedValue(SUPPLIER_ID);
      mockGetRevenueTrend.mockResolvedValue([
        { date: "2025-06-01", revenue: 350.0, orderCount: 3 },
        { date: "2025-06-02", revenue: 125.5, orderCount: 1 },
        { date: "2025-06-03", revenue: 500.0, orderCount: 4 },
      ]);

      const res = await request(app)
        .get("/api/suppliers/analytics/revenue-trend?period=week")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(3);
      expect(res.body[0]).toHaveProperty("date");
      expect(res.body[0]).toHaveProperty("revenue");
      expect(res.body[0]).toHaveProperty("orderCount");
      expect(typeof res.body[0].revenue).toBe("number");
      expect(typeof res.body[0].orderCount).toBe("number");
      expect(mockGetRevenueTrend).toHaveBeenCalledWith(SUPPLIER_ID, "week");
    });
  });

  // =========================================================================
  // Supplier-scoped access control
  // =========================================================================
  describe("Supplier-scoped access", () => {
    it("supplier only sees their own analytics (filtered by supplier_id)", async () => {
      authAs(customerUser);

      const endpoints = [
        "/api/suppliers/analytics/dashboard",
        "/api/suppliers/analytics/top-products",
        "/api/suppliers/analytics/revenue-trend",
        "/api/suppliers/analytics/order-status",
      ];

      for (const url of endpoints) {
        const res = await request(app).get(url).set("Authorization", "Bearer valid-token");

        expect(res.status).toBe(403);
      }
    });
  });
});
