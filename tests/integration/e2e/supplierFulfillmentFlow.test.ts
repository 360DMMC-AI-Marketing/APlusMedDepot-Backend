import request from "supertest";

// ---------- Module-level mocks (must come before app import) ----------

const mockVerifyToken = jest.fn();

jest.mock("../../../src/services/auth.service", () => ({
  AuthService: {
    signUp: jest.fn(),
    verifyToken: mockVerifyToken,
  },
}));

jest.mock("../../../src/services/product.service", () => ({
  ProductService: {},
}));

jest.mock("../../../src/services/storage.service", () => ({
  StorageService: {},
}));

jest.mock("../../../src/services/cart.service", () => ({
  CartService: {},
}));

jest.mock("../../../src/services/checkout.service", () => ({
  CheckoutService: {},
}));

jest.mock("../../../src/services/order.service", () => ({
  OrderService: {},
}));

jest.mock("../../../src/utils/inventory", () => ({
  checkStock: jest.fn(),
  checkAndDecrementStock: jest.fn(),
  incrementStock: jest.fn(),
}));

const mockGetSupplierOrders = jest.fn();
const mockGetSupplierOrderDetail = jest.fn();
const mockGetSupplierOrderStats = jest.fn();
const mockUpdateItemFulfillment = jest.fn();

jest.mock("../../../src/services/supplierOrder.service", () => ({
  SupplierOrderService: {
    getSupplierOrders: mockGetSupplierOrders,
    getSupplierOrderDetail: mockGetSupplierOrderDetail,
    getSupplierOrderStats: mockGetSupplierOrderStats,
    updateItemFulfillment: mockUpdateItemFulfillment,
  },
}));

const mockGetSupplierIdFromUserId = jest.fn();

jest.mock("../../../src/services/supplierProduct.service", () => ({
  SupplierProductService: {
    getSupplierIdFromUserId: mockGetSupplierIdFromUserId,
  },
}));

const mockGetDashboardStats = jest.fn();

jest.mock("../../../src/services/supplierAnalytics.service", () => ({
  SupplierAnalyticsService: {
    getProductAnalytics: jest.fn(),
    getAggregateAnalytics: jest.fn(),
    getSupplierIdFromUserId: mockGetSupplierIdFromUserId,
    getDashboardStats: mockGetDashboardStats,
    getTopProducts: jest.fn(),
    getRevenueTrend: jest.fn(),
    getOrderStatusBreakdown: jest.fn(),
  },
}));

jest.mock("../../../src/config/stripe", () => ({
  getStripe: () => ({
    paymentIntents: {
      create: jest.fn(),
      retrieve: jest.fn(),
      cancel: jest.fn(),
    },
    refunds: { create: jest.fn() },
    webhooks: { constructEvent: jest.fn() },
  }),
}));

jest.mock("../../../src/config/env", () => ({
  getEnv: () => ({
    STRIPE_WEBHOOK_SECRET: "whsec_test",
    STRIPE_WEBHOOK_TOLERANCE: 300,
  }),
}));

jest.mock("../../../src/config/supabase", () => ({
  supabaseAdmin: { from: jest.fn() },
}));

jest.mock("../../../src/services/hooks/paymentHooks", () => ({
  onPaymentSuccess: jest.fn().mockResolvedValue(undefined),
  onPaymentRefunded: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../../src/services/email.service", () => ({
  sendOrderConfirmation: jest.fn(),
  sendOrderStatusUpdate: jest.fn(),
}));

jest.mock("../../../src/services/orderConfirmation.service", () => ({
  OrderConfirmationService: {
    confirmOrder: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock("../../../src/utils/securityLogger", () => ({
  logSuspiciousActivity: jest.fn(),
  logWebhookVerificationFailure: jest.fn(),
  logWebhookProcessed: jest.fn(),
}));

jest.mock(
  "express-rate-limit",
  () => () => (_req: unknown, _res: unknown, next: () => void) => next(),
);

import app from "../../../src/index";

// ---------- Test data ----------

const supplierUser = {
  id: "user-supplier-ful-001",
  email: "supplier@example.com",
  firstName: "Sam",
  lastName: "Supply",
  companyName: "MedSupply Co",
  phone: null,
  role: "supplier" as const,
  status: "approved" as const,
  lastLogin: null,
};

const SUPPLIER_ID = "b0000000-0000-4000-a000-000000000030";
const SUB_ORDER_ID = "c0000000-0000-4000-a000-000000000031";
const ITEM_ID = "f0000000-0000-4000-a000-000000000031";

// ---------- Tests ----------

describe("Supplier Fulfillment Flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSupplierIdFromUserId.mockResolvedValue(SUPPLIER_ID);
  });

  it("Step 1: Supplier views their orders", async () => {
    mockVerifyToken.mockResolvedValue(supplierUser);

    mockGetSupplierOrders.mockResolvedValue({
      data: [
        {
          id: SUB_ORDER_ID,
          orderNumber: "ORD-20260312-0001",
          customerName: "Jane Doe",
          status: "confirmed",
          totalAmount: 56.97,
          commissionAmount: 8.55,
          supplierPayout: 48.42,
          itemCount: 2,
          createdAt: "2026-03-12T00:00:00Z",
        },
      ],
      total: 1,
    });

    const res = await request(app)
      .get("/api/suppliers/me/orders")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(SUB_ORDER_ID);
    expect(res.body.total).toBe(1);
    expect(mockGetSupplierOrders).toHaveBeenCalledWith(
      SUPPLIER_ID,
      expect.objectContaining({ page: 1, limit: 20 }),
    );
  });

  it("Step 2: Supplier marks item as processing", async () => {
    mockVerifyToken.mockResolvedValue(supplierUser);
    mockUpdateItemFulfillment.mockResolvedValue(undefined);

    const res = await request(app)
      .put(`/api/suppliers/me/orders/items/${ITEM_ID}/fulfillment`)
      .set("Authorization", "Bearer valid-token")
      .send({ fulfillmentStatus: "processing" });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Fulfillment status updated");
    expect(mockUpdateItemFulfillment).toHaveBeenCalledWith(SUPPLIER_ID, ITEM_ID, {
      fulfillmentStatus: "processing",
      trackingNumber: undefined,
      carrier: undefined,
    });
  });

  it("Step 3: Supplier marks item as shipped with tracking", async () => {
    mockVerifyToken.mockResolvedValue(supplierUser);
    mockUpdateItemFulfillment.mockResolvedValue(undefined);

    const res = await request(app)
      .put(`/api/suppliers/me/orders/items/${ITEM_ID}/fulfillment`)
      .set("Authorization", "Bearer valid-token")
      .send({
        fulfillmentStatus: "shipped",
        trackingNumber: "1Z999AA10123456784",
        carrier: "UPS",
      });

    expect(res.status).toBe(200);
    expect(mockUpdateItemFulfillment).toHaveBeenCalledWith(SUPPLIER_ID, ITEM_ID, {
      fulfillmentStatus: "shipped",
      trackingNumber: "1Z999AA10123456784",
      carrier: "UPS",
    });
  });

  it("Step 4: Shipped without tracking number — validation error", async () => {
    mockVerifyToken.mockResolvedValue(supplierUser);

    const res = await request(app)
      .put(`/api/suppliers/me/orders/items/${ITEM_ID}/fulfillment`)
      .set("Authorization", "Bearer valid-token")
      .send({ fulfillmentStatus: "shipped" });

    expect(res.status).toBe(400);
  });

  it("Step 5: Supplier views order stats", async () => {
    mockVerifyToken.mockResolvedValue(supplierUser);

    mockGetSupplierOrderStats.mockResolvedValue({
      totalOrders: 10,
      pendingOrders: 2,
      processingOrders: 3,
      shippedOrders: 4,
      deliveredOrders: 1,
      totalRevenue: 5000,
      totalCommission: 750,
      totalPayout: 4250,
    });

    const res = await request(app)
      .get("/api/suppliers/me/orders/stats")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body.totalOrders).toBe(10);
    expect(res.body.totalRevenue).toBe(5000);
  });

  it("Step 6: Supplier views analytics dashboard", async () => {
    mockVerifyToken.mockResolvedValue(supplierUser);

    mockGetDashboardStats.mockResolvedValue({
      revenueThisMonth: 5000,
      revenueLastMonth: 4000,
      revenueChangePercent: 25,
      ordersThisMonth: 15,
      ordersLastMonth: 12,
      averageOrderValue: 333.33,
      activeProducts: 8,
    });

    const res = await request(app)
      .get("/api/suppliers/analytics/dashboard")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body.revenueThisMonth).toBe(5000);
    expect(res.body.revenueChangePercent).toBe(25);
  });

  it("Step 7: Customer cannot access supplier orders", async () => {
    mockVerifyToken.mockResolvedValue({
      id: "customer-001",
      email: "cust@example.com",
      firstName: "Jane",
      lastName: "Doe",
      companyName: null,
      phone: null,
      role: "customer" as const,
      status: "approved" as const,
      lastLogin: null,
    });

    const res = await request(app)
      .get("/api/suppliers/me/orders")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(403);
  });
});
