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

// Admin services
const mockGetDashboardSummary = jest.fn();

jest.mock("../../../src/services/adminDashboard.service", () => ({
  AdminDashboardService: {
    getDashboardSummary: mockGetDashboardSummary,
  },
}));

const mockApproveUser = jest.fn();
const mockRejectUser = jest.fn();

jest.mock("../../../src/services/adminUser.service", () => ({
  AdminUserService: {
    listUsers: jest
      .fn()
      .mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 }),
    getUserDetail: jest.fn(),
    approveUser: mockApproveUser,
    rejectUser: mockRejectUser,
    suspendUser: jest.fn(),
    reactivateUser: jest.fn(),
    getPendingCount: jest.fn().mockResolvedValue({ users: 0, suppliers: 0, products: 0 }),
  },
}));

const mockAdminProductReject = jest.fn();

jest.mock("../../../src/services/adminProduct.service", () => ({
  AdminProductService: {
    listPending: jest.fn(),
    getReviewDetail: jest.fn(),
    approve: jest.fn(),
    requestChanges: jest.fn(),
    reject: mockAdminProductReject,
    listProducts: jest.fn(),
    getProductDetail: jest.fn(),
    featureProduct: jest.fn(),
    unfeatureProduct: jest.fn(),
  },
}));

const mockVerifyVendor = jest.fn();

jest.mock("../../../src/services/aiVerification.service", () => ({
  AIVerificationService: {
    verifyVendor: mockVerifyVendor,
  },
}));

const mockGetRevenueMetrics = jest.fn();

jest.mock("../../../src/services/platformAnalytics.service", () => ({
  PlatformAnalyticsService: {
    getRevenueMetrics: mockGetRevenueMetrics,
    getRevenueBySupplier: jest.fn(),
    getRevenueByCategory: jest.fn(),
    getRevenueTrend: jest.fn(),
    getOrderMetrics: jest.fn(),
    getTopProducts: jest.fn(),
  },
}));

const mockGetAuditLogs = jest.fn();

jest.mock("../../../src/services/auditLog.service", () => ({
  AuditLogService: {
    log: jest.fn().mockResolvedValue(undefined),
    getAuditLogs: mockGetAuditLogs,
    getAuditLogsByResource: jest.fn(),
    getAdminActivity: jest.fn(),
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

const adminUser = {
  id: "admin-mgmt-001",
  email: "admin@example.com",
  firstName: "Admin",
  lastName: "User",
  companyName: null,
  phone: null,
  role: "admin" as const,
  status: "approved" as const,
  lastLogin: null,
};

const customerUser = {
  id: "cust-mgmt-001",
  email: "customer@example.com",
  firstName: "Jane",
  lastName: "Doe",
  companyName: null,
  phone: null,
  role: "customer" as const,
  status: "approved" as const,
  lastLogin: null,
};

const USER_ID = "a0000000-0000-4000-a000-000000000040";
const PRODUCT_ID = "a0000000-0000-4000-a000-000000000041";
const VENDOR_ID = "a0000000-0000-4000-a000-000000000042";

// ---------- Tests ----------

describe("Admin Management Flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("Step 1: Admin views dashboard", async () => {
    mockVerifyToken.mockResolvedValue(adminUser);

    mockGetDashboardSummary.mockResolvedValue({
      totalUsers: 150,
      totalSuppliers: 25,
      totalProducts: 500,
      totalOrders: 1200,
      totalRevenue: 125000,
      pendingApprovals: { users: 3, suppliers: 2, products: 5 },
      recentOrders: [],
    });

    const res = await request(app)
      .get("/api/admin/dashboard")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body.totalUsers).toBe(150);
    expect(res.body.pendingApprovals.users).toBe(3);
  });

  it("Step 2: Admin approves user with commission rate", async () => {
    mockVerifyToken.mockResolvedValue(adminUser);
    mockApproveUser.mockResolvedValue(undefined);

    const res = await request(app)
      .put(`/api/admin/users/${USER_ID}/approve`)
      .set("Authorization", "Bearer valid-token")
      .send({ commissionRate: 12 });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("User approved successfully");
    expect(mockApproveUser).toHaveBeenCalledWith(
      USER_ID,
      adminUser.id,
      expect.anything(), // auditContext
      { commissionRate: 12 },
    );
  });

  it("Step 3: Admin rejects product with reason", async () => {
    mockVerifyToken.mockResolvedValue(adminUser);

    mockAdminProductReject.mockResolvedValue({
      id: PRODUCT_ID,
      name: "Bad Product",
      status: "rejected",
      adminFeedback: "Incomplete documentation and poor quality images",
    });

    const res = await request(app)
      .put(`/api/admin/products/${PRODUCT_ID}/reject`)
      .set("Authorization", "Bearer valid-token")
      .send({ reason: "Incomplete documentation and poor quality images" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("rejected");
    expect(mockAdminProductReject).toHaveBeenCalledWith(
      PRODUCT_ID,
      adminUser.id,
      "Incomplete documentation and poor quality images",
      expect.anything(), // auditContext
    );
  });

  it("Step 4: Admin runs AI vendor verification", async () => {
    mockVerifyToken.mockResolvedValue(adminUser);

    mockVerifyVendor.mockResolvedValue({
      vendorId: VENDOR_ID,
      overallScore: 85,
      recommendation: "approve",
      checks: [
        { name: "Business Registration", passed: true, score: 90, details: "Valid registration" },
        { name: "Tax Compliance", passed: true, score: 80, details: "Tax ID verified" },
      ],
      completedAt: "2026-03-12T00:00:00Z",
    });

    const res = await request(app)
      .post(`/api/admin/vendors/${VENDOR_ID}/ai-verify`)
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body.overallScore).toBe(85);
    expect(res.body.recommendation).toBe("approve");
    expect(res.body.checks).toHaveLength(2);
    expect(mockVerifyVendor).toHaveBeenCalledWith(VENDOR_ID);
  });

  it("Step 5: Admin views platform analytics — revenue", async () => {
    mockVerifyToken.mockResolvedValue(adminUser);

    mockGetRevenueMetrics.mockResolvedValue({
      current: { revenue: 50000, orderCount: 200, averageOrderValue: 250 },
      previous: { revenue: 40000, orderCount: 180, averageOrderValue: 222.22 },
      changePercent: { revenue: 25, orderCount: 11.1, averageOrderValue: 12.5 },
      period: "month",
    });

    const res = await request(app)
      .get("/api/admin/analytics/revenue?period=month")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body.current.revenue).toBe(50000);
    expect(res.body.period).toBe("month");
  });

  it("Step 6: Admin views audit logs", async () => {
    mockVerifyToken.mockResolvedValue(adminUser);

    mockGetAuditLogs.mockResolvedValue({
      data: [
        {
          id: "audit-001",
          action: "user.approved",
          resourceType: "user",
          resourceId: USER_ID,
          adminId: adminUser.id,
          details: { commissionRate: 12 },
          createdAt: "2026-03-12T00:01:00Z",
        },
        {
          id: "audit-002",
          action: "product.rejected",
          resourceType: "product",
          resourceId: PRODUCT_ID,
          adminId: adminUser.id,
          details: { reason: "Incomplete documentation" },
          createdAt: "2026-03-12T00:02:00Z",
        },
      ],
      total: 2,
      page: 1,
      limit: 20,
      totalPages: 1,
    });

    const res = await request(app)
      .get("/api/admin/audit-logs")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].action).toBe("user.approved");
    expect(res.body.data[1].action).toBe("product.rejected");
  });

  it("Step 7: Customer cannot access admin endpoints", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);

    const res = await request(app)
      .get("/api/admin/dashboard")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(403);
  });

  it("Step 8: Admin rejects user with reasons array", async () => {
    mockVerifyToken.mockResolvedValue(adminUser);
    mockRejectUser.mockResolvedValue(undefined);

    const res = await request(app)
      .put(`/api/admin/users/${USER_ID}/reject`)
      .set("Authorization", "Bearer valid-token")
      .send({
        reasons: ["Incomplete documentation", "Invalid tax ID"],
        customReason: "Missing business license",
      });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("User rejected successfully");
    expect(mockRejectUser).toHaveBeenCalledWith(
      USER_ID,
      adminUser.id,
      expect.objectContaining({
        reasons: ["Incomplete documentation", "Invalid tax ID"],
        customReason: "Missing business license",
      }),
      expect.anything(), // auditContext
    );
  });
});
