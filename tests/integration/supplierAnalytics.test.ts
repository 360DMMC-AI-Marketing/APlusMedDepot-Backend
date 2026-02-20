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

jest.mock("../../src/services/supplierAnalytics.service", () => ({
  SupplierAnalyticsService: {
    getProductAnalytics: mockGetProductAnalytics,
    getAggregateAnalytics: mockGetAggregateAnalytics,
    getSupplierIdFromUserId: mockGetSupplierIdFromUserId,
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
});
