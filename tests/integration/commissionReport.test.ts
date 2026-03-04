import request from "supertest";

const mockVerifyToken = jest.fn();

jest.mock("../../src/services/auth.service", () => ({
  AuthService: {
    signUp: jest.fn(),
    verifyToken: mockVerifyToken,
  },
}));

const mockGetPlatformEarnings = jest.fn();
const mockGetCommissionBySupplierReport = jest.fn();
const mockGetCommissionTrend = jest.fn();

jest.mock("../../src/services/commissionReport.service", () => ({
  CommissionReportService: {
    getPlatformEarnings: mockGetPlatformEarnings,
    getCommissionBySupplierReport: mockGetCommissionBySupplierReport,
    getCommissionTrend: mockGetCommissionTrend,
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

describe("Commission Report API", () => {
  describe("Auth & RBAC", () => {
    it("returns 401 without auth token", async () => {
      const res = await request(app).get("/api/admin/commissions/earnings");
      expect(res.status).toBe(401);
    });

    it("returns 403 for non-admin", async () => {
      authAs(supplierUser);
      const res = await request(app)
        .get("/api/admin/commissions/earnings")
        .set("Authorization", "Bearer valid-token");
      expect(res.status).toBe(403);
    });
  });

  describe("GET /earnings", () => {
    it("returns platform earnings", async () => {
      authAs(adminUser);
      mockGetPlatformEarnings.mockResolvedValue({
        totalGrossSales: 10000,
        totalPlatformCommission: 1500,
        totalSupplierPayouts: 8500,
        commissionCount: 50,
        averageCommissionRate: 15,
        trend: [
          {
            date: "2026-01-06",
            grossSales: 1000,
            platformCommission: 150,
            supplierPayout: 850,
            orderCount: 5,
          },
        ],
      });

      const res = await request(app)
        .get("/api/admin/commissions/earnings?period=month")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body.totalGrossSales).toBe(10000);
      expect(res.body.commissionCount).toBe(50);
      expect(res.body.trend).toHaveLength(1);
    });
  });

  describe("GET /by-supplier", () => {
    it("returns paginated supplier commission report", async () => {
      authAs(adminUser);
      mockGetCommissionBySupplierReport.mockResolvedValue({
        data: [
          {
            supplierId: "s1",
            supplierName: "MedCo",
            totalSales: 5000,
            totalCommission: 750,
            totalOwed: 4250,
            currentBalance: 4250,
            commissionRate: 15,
            orderCount: 25,
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });

      const res = await request(app)
        .get("/api/admin/commissions/by-supplier?startDate=2026-01-01&endDate=2026-01-31")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body.data[0].supplierName).toBe("MedCo");
      expect(res.body.total).toBe(1);
    });

    it("returns 400 when startDate/endDate missing", async () => {
      authAs(adminUser);
      const res = await request(app)
        .get("/api/admin/commissions/by-supplier")
        .set("Authorization", "Bearer valid-token");
      expect(res.status).toBe(400);
    });
  });

  describe("GET /trend", () => {
    it("returns commission trend data", async () => {
      authAs(adminUser);
      mockGetCommissionTrend.mockResolvedValue([
        {
          date: "2026-01-06",
          grossSales: 1000,
          platformCommission: 150,
          supplierPayout: 850,
          orderCount: 5,
        },
      ]);

      const res = await request(app)
        .get("/api/admin/commissions/trend?granularity=weekly")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].date).toBe("2026-01-06");
    });
  });
});
