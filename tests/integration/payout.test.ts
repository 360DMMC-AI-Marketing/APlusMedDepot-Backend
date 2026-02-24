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

const mockGetSupplierBalance = jest.fn();
const mockGetPayoutHistory = jest.fn();
const mockCreatePayoutRecord = jest.fn();
const mockGetPayoutSummary = jest.fn();
const mockGeneratePayoutReport = jest.fn();

jest.mock("../../src/services/payout.service", () => ({
  PayoutService: {
    getSupplierBalance: mockGetSupplierBalance,
    getPayoutHistory: mockGetPayoutHistory,
    createPayoutRecord: mockCreatePayoutRecord,
    getPayoutSummary: mockGetPayoutSummary,
    generatePayoutReport: mockGeneratePayoutReport,
  },
}));

const mockGetSupplierIdFromUserId = jest.fn();

jest.mock("../../src/services/supplierProduct.service", () => ({
  SupplierProductService: {
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
const SUPPLIER_ID = "b0000000-0000-4000-8000-000000000001";

const supplierUser = {
  id: "user-supplier-payout-1",
  email: "supplier-payout@example.com",
  firstName: "Sam",
  lastName: "Supply",
  companyName: null,
  phone: null,
  role: "supplier" as const,
  status: "approved" as const,
  lastLogin: null,
};

const adminUser = {
  id: "user-admin-payout-1",
  email: "admin-payout@example.com",
  firstName: "Admin",
  lastName: "User",
  companyName: null,
  phone: null,
  role: "admin" as const,
  status: "approved" as const,
  lastLogin: null,
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
describe("Payout API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // GET /api/suppliers/me/payouts/balance
  // =========================================================================
  describe("GET /api/suppliers/me/payouts/balance", () => {
    it("returns balance reflecting current_balance from suppliers table", async () => {
      authAs(supplierUser);
      mockGetSupplierIdFromUserId.mockResolvedValue(SUPPLIER_ID);
      mockGetSupplierBalance.mockResolvedValue({
        currentBalance: 127.5,
        pendingCommissions: 85,
        totalPaidOut: 500,
        availableForPayout: 127.5,
      });

      const res = await request(app)
        .get("/api/suppliers/me/payouts/balance")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body.currentBalance).toBe(127.5);
      expect(res.body.pendingCommissions).toBe(85);
      expect(res.body.totalPaidOut).toBe(500);
      expect(res.body.availableForPayout).toBe(127.5);
      expect(mockGetSupplierBalance).toHaveBeenCalledWith(SUPPLIER_ID);
    });

    it("minimum threshold check: balance $49 → availableForPayout is 0", async () => {
      authAs(supplierUser);
      mockGetSupplierIdFromUserId.mockResolvedValue(SUPPLIER_ID);
      mockGetSupplierBalance.mockResolvedValue({
        currentBalance: 49,
        pendingCommissions: 0,
        totalPaidOut: 0,
        availableForPayout: 0,
      });

      const res = await request(app)
        .get("/api/suppliers/me/payouts/balance")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body.currentBalance).toBe(49);
      expect(res.body.availableForPayout).toBe(0);
    });
  });

  // =========================================================================
  // GET /api/suppliers/me/payouts/history
  // =========================================================================
  describe("GET /api/suppliers/me/payouts/history", () => {
    it("returns paginated results in DESC order", async () => {
      authAs(supplierUser);
      mockGetSupplierIdFromUserId.mockResolvedValue(SUPPLIER_ID);
      mockGetPayoutHistory.mockResolvedValue({
        data: [
          {
            id: "pay-002",
            supplierId: SUPPLIER_ID,
            amount: 200,
            commissionTotal: 30,
            status: "completed",
            periodStart: "2025-06-01",
            periodEnd: "2025-06-30",
            payoutDate: "2025-07-15",
            transactionRef: "TXN-002",
            createdAt: "2025-07-15T00:00:00Z",
          },
          {
            id: "pay-001",
            supplierId: SUPPLIER_ID,
            amount: 150,
            commissionTotal: 22.5,
            status: "completed",
            periodStart: "2025-05-01",
            periodEnd: "2025-05-31",
            payoutDate: "2025-06-15",
            transactionRef: "TXN-001",
            createdAt: "2025-06-15T00:00:00Z",
          },
        ],
        total: 2,
      });

      const res = await request(app)
        .get("/api/suppliers/me/payouts/history?page=1&limit=10")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.total).toBe(2);
      // DESC order: pay-002 before pay-001
      expect(res.body.data[0].id).toBe("pay-002");
      expect(res.body.data[1].id).toBe("pay-001");
      expect(mockGetPayoutHistory).toHaveBeenCalledWith(SUPPLIER_ID, { page: 1, limit: 10 });
    });
  });

  // =========================================================================
  // POST /api/admin/payouts
  // =========================================================================
  describe("POST /api/admin/payouts", () => {
    it("createPayout deducts from supplier balance atomically", async () => {
      authAs(adminUser);
      mockCreatePayoutRecord.mockResolvedValue({
        id: "pay-003",
        supplierId: SUPPLIER_ID,
        amount: 100,
        commissionTotal: 15,
        status: "pending",
        periodStart: "2025-07-01",
        periodEnd: "2025-07-31",
        payoutDate: null,
        transactionRef: null,
        createdAt: "2025-08-01T00:00:00Z",
      });

      const res = await request(app)
        .post("/api/admin/payouts")
        .set("Authorization", "Bearer valid-token")
        .send({
          supplierId: SUPPLIER_ID,
          amount: 100,
          periodStart: "2025-07-01",
          periodEnd: "2025-07-31",
          commissionTotal: 15,
          itemsCount: 5,
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe("pay-003");
      expect(res.body.amount).toBe(100);
      expect(res.body.status).toBe("pending");
      expect(mockCreatePayoutRecord).toHaveBeenCalledWith(SUPPLIER_ID, {
        amount: 100,
        periodStart: "2025-07-01",
        periodEnd: "2025-07-31",
        commissionTotal: 15,
        itemsCount: 5,
      });
    });

    it("createPayout fails if amount > current balance", async () => {
      authAs(adminUser);
      mockCreatePayoutRecord.mockRejectedValue(
        new AppError("Insufficient balance for payout", 409, "CONFLICT"),
      );

      const res = await request(app)
        .post("/api/admin/payouts")
        .set("Authorization", "Bearer valid-token")
        .send({
          supplierId: SUPPLIER_ID,
          amount: 10000,
          periodStart: "2025-07-01",
          periodEnd: "2025-07-31",
          commissionTotal: 1500,
          itemsCount: 50,
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("CONFLICT");
    });

    it("returns 403 when a supplier tries to create a payout", async () => {
      authAs(supplierUser);

      const res = await request(app)
        .post("/api/admin/payouts")
        .set("Authorization", "Bearer valid-token")
        .send({
          supplierId: SUPPLIER_ID,
          amount: 100,
          periodStart: "2025-07-01",
          periodEnd: "2025-07-31",
          commissionTotal: 15,
          itemsCount: 5,
        });

      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // GET /api/suppliers/me/payouts/summary
  // =========================================================================
  describe("GET /api/suppliers/me/payouts/summary", () => {
    it("shows correct month-over-month earnings and threshold status", async () => {
      authAs(supplierUser);
      mockGetSupplierIdFromUserId.mockResolvedValue(SUPPLIER_ID);
      mockGetPayoutSummary.mockResolvedValue({
        currentMonthEarnings: 250,
        lastMonthEarnings: 180,
        nextPayoutDate: "2025-09-15",
        meetsMinimumThreshold: true,
        minimumThreshold: 50,
      });

      const res = await request(app)
        .get("/api/suppliers/me/payouts/summary")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body.currentMonthEarnings).toBe(250);
      expect(res.body.lastMonthEarnings).toBe(180);
      expect(res.body.nextPayoutDate).toBe("2025-09-15");
      expect(res.body.meetsMinimumThreshold).toBe(true);
      expect(res.body.minimumThreshold).toBe(50);
    });

    it("returns 401 when no auth token is provided", async () => {
      const res = await request(app).get("/api/suppliers/me/payouts/summary");
      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // GET /api/suppliers/me/payouts/report
  // =========================================================================
  describe("GET /api/suppliers/me/payouts/report", () => {
    it("report contains correct period dates", async () => {
      authAs(supplierUser);
      mockGetSupplierIdFromUserId.mockResolvedValue(SUPPLIER_ID);
      mockGeneratePayoutReport.mockResolvedValue({
        supplier: { id: SUPPLIER_ID, businessName: "MedSupply Co" },
        period: { start: "2026-02-01", end: "2026-02-28" },
        orders: [
          {
            orderNumber: "ORD-20260205-XYZ-1",
            orderDate: "2026-02-05T10:00:00Z",
            items: [
              {
                productName: "Surgical Gloves",
                quantity: 5,
                saleAmount: 50,
                commissionRate: 15,
                commissionAmount: 7.5,
                supplierPayout: 42.5,
              },
            ],
            orderTotal: 50,
            orderCommission: 7.5,
            orderPayout: 42.5,
          },
        ],
        summary: { totalSales: 50, totalCommission: 7.5, totalPayout: 42.5, orderCount: 1 },
      });

      const res = await request(app)
        .get("/api/suppliers/me/payouts/report?start=2026-02-01&end=2026-02-28")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body.period.start).toBe("2026-02-01");
      expect(res.body.period.end).toBe("2026-02-28");
      expect(mockGeneratePayoutReport).toHaveBeenCalledWith(
        SUPPLIER_ID,
        "2026-02-01",
        "2026-02-28",
      );
    });

    it("report totals match sum of commission records", async () => {
      authAs(supplierUser);
      mockGetSupplierIdFromUserId.mockResolvedValue(SUPPLIER_ID);
      mockGeneratePayoutReport.mockResolvedValue({
        supplier: { id: SUPPLIER_ID, businessName: "MedSupply Co" },
        period: { start: "2026-01-01", end: "2026-01-31" },
        orders: [
          {
            orderNumber: "ORD-001",
            orderDate: "2026-01-10T00:00:00Z",
            items: [
              {
                productName: "Gloves",
                quantity: 10,
                saleAmount: 100,
                commissionRate: 15,
                commissionAmount: 15,
                supplierPayout: 85,
              },
              {
                productName: "Masks",
                quantity: 20,
                saleAmount: 200,
                commissionRate: 15,
                commissionAmount: 30,
                supplierPayout: 170,
              },
            ],
            orderTotal: 300,
            orderCommission: 45,
            orderPayout: 255,
          },
        ],
        summary: { totalSales: 300, totalCommission: 45, totalPayout: 255, orderCount: 1 },
      });

      const res = await request(app)
        .get("/api/suppliers/me/payouts/report?start=2026-01-01&end=2026-01-31")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      // Verify totals match item sums
      const order = res.body.orders[0];
      const itemSaleSum = order.items.reduce(
        (sum: number, i: { saleAmount: number }) => sum + i.saleAmount,
        0,
      );
      const itemCommissionSum = order.items.reduce(
        (sum: number, i: { commissionAmount: number }) => sum + i.commissionAmount,
        0,
      );
      const itemPayoutSum = order.items.reduce(
        (sum: number, i: { supplierPayout: number }) => sum + i.supplierPayout,
        0,
      );
      expect(order.orderTotal).toBe(itemSaleSum);
      expect(order.orderCommission).toBe(itemCommissionSum);
      expect(order.orderPayout).toBe(itemPayoutSum);
      expect(res.body.summary.totalSales).toBe(300);
      expect(res.body.summary.totalCommission).toBe(45);
      expect(res.body.summary.totalPayout).toBe(255);
      expect(res.body.summary.orderCount).toBe(1);
    });

    it("empty period returns empty orders array (not error)", async () => {
      authAs(supplierUser);
      mockGetSupplierIdFromUserId.mockResolvedValue(SUPPLIER_ID);
      mockGeneratePayoutReport.mockResolvedValue({
        supplier: { id: SUPPLIER_ID, businessName: "MedSupply Co" },
        period: { start: "2020-01-01", end: "2020-01-31" },
        orders: [],
        summary: { totalSales: 0, totalCommission: 0, totalPayout: 0, orderCount: 0 },
      });

      const res = await request(app)
        .get("/api/suppliers/me/payouts/report?start=2020-01-01&end=2020-01-31")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body.orders).toHaveLength(0);
      expect(res.body.summary.orderCount).toBe(0);
      expect(res.body.summary.totalSales).toBe(0);
      expect(res.body.summary.totalPayout).toBe(0);
    });
  });
});
