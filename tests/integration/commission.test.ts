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

const mockGetCommissionsBySupplier = jest.fn();
const mockGetCommissionSummary = jest.fn();
const mockGetCommissionsByOrder = jest.fn();

jest.mock("../../src/services/commission.service", () => ({
  CommissionService: {
    getCommissionsBySupplier: mockGetCommissionsBySupplier,
    getCommissionSummary: mockGetCommissionSummary,
    getCommissionsByOrder: mockGetCommissionsByOrder,
    calculateOrderCommissions: jest.fn(),
    reverseOrderCommissions: jest.fn(),
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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const ORDER_ID = "a0000000-0000-4000-8000-000000000001";
const SUPPLIER_ID = "b0000000-0000-4000-8000-000000000001";
const SUPPLIER_ID_2 = "b0000000-0000-4000-8000-000000000002";

const supplierUser = {
  id: "user-supplier-comm-1",
  email: "supplier-comm@example.com",
  firstName: "Sam",
  lastName: "Supply",
  companyName: null,
  phone: null,
  role: "supplier" as const,
  status: "approved" as const,
  lastLogin: null,
};

const adminUser = {
  id: "user-admin-comm-1",
  email: "admin-comm@example.com",
  firstName: "Admin",
  lastName: "User",
  companyName: null,
  phone: null,
  role: "admin" as const,
  status: "approved" as const,
  lastLogin: null,
};

const customerUser = {
  id: "user-customer-comm-1",
  email: "customer-comm@example.com",
  firstName: "Jane",
  lastName: "Doe",
  companyName: null,
  phone: null,
  role: "customer" as const,
  status: "approved" as const,
  lastLogin: null,
};

const sampleCommissions = [
  {
    id: "comm-001",
    orderItemId: "oi-001",
    orderId: ORDER_ID,
    supplierId: SUPPLIER_ID,
    supplierName: "MedSupply Co",
    productName: "Surgical Gloves",
    saleAmount: 100,
    commissionRate: 15,
    commissionAmount: 15,
    platformAmount: 15,
    supplierPayout: 85,
    status: "pending",
    createdAt: "2025-06-01T00:00:00Z",
  },
  {
    id: "comm-002",
    orderItemId: "oi-002",
    orderId: ORDER_ID,
    supplierId: SUPPLIER_ID,
    supplierName: "MedSupply Co",
    productName: "Face Masks",
    saleAmount: 50,
    commissionRate: 15,
    commissionAmount: 7.5,
    platformAmount: 7.5,
    supplierPayout: 42.5,
    status: "pending",
    createdAt: "2025-06-01T00:00:00Z",
  },
];

const sampleSummary = {
  totalSales: 150,
  totalCommission: 22.5,
  totalPayout: 127.5,
  currentBalance: 127.5,
  orderCount: 1,
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
describe("Commission API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // GET /api/commissions — supplier own commissions
  // =========================================================================
  describe("GET /api/commissions", () => {
    it("returns commissions scoped to the authenticated supplier", async () => {
      authAs(supplierUser);
      mockGetSupplierIdFromUserId.mockResolvedValue(SUPPLIER_ID);
      mockGetCommissionsBySupplier.mockResolvedValue(sampleCommissions);

      const res = await request(app)
        .get("/api/commissions")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body.commissions).toHaveLength(2);
      expect(res.body.commissions[0].supplierId).toBe(SUPPLIER_ID);
      expect(res.body.commissions[1].supplierId).toBe(SUPPLIER_ID);
      expect(mockGetCommissionsBySupplier).toHaveBeenCalledWith(SUPPLIER_ID, {
        startDate: undefined,
        endDate: undefined,
        status: undefined,
      });
    });

    it("passes date filters to service", async () => {
      authAs(supplierUser);
      mockGetSupplierIdFromUserId.mockResolvedValue(SUPPLIER_ID);
      mockGetCommissionsBySupplier.mockResolvedValue([]);

      const res = await request(app)
        .get("/api/commissions?startDate=2025-01-01T00:00:00Z&endDate=2025-12-31T23:59:59Z")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(mockGetCommissionsBySupplier).toHaveBeenCalledWith(SUPPLIER_ID, {
        startDate: "2025-01-01T00:00:00Z",
        endDate: "2025-12-31T23:59:59Z",
        status: undefined,
      });
    });

    it("returns 401 when no auth token is provided", async () => {
      const res = await request(app).get("/api/commissions");
      expect(res.status).toBe(401);
    });

    it("returns 403 when a customer tries to access", async () => {
      authAs(customerUser);

      const res = await request(app)
        .get("/api/commissions")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // GET /api/commissions/summary — supplier summary
  // =========================================================================
  describe("GET /api/commissions/summary", () => {
    it("returns correct totals for supplier summary", async () => {
      authAs(supplierUser);
      mockGetSupplierIdFromUserId.mockResolvedValue(SUPPLIER_ID);
      mockGetCommissionSummary.mockResolvedValue(sampleSummary);

      const res = await request(app)
        .get("/api/commissions/summary")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body.totalSales).toBe(150);
      expect(res.body.totalCommission).toBe(22.5);
      expect(res.body.totalPayout).toBe(127.5);
      expect(res.body.currentBalance).toBe(127.5);
      expect(res.body.orderCount).toBe(1);
    });

    it("returns 403 when an admin tries to access supplier endpoint", async () => {
      authAs(adminUser);

      const res = await request(app)
        .get("/api/commissions/summary")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // GET /api/commissions/order/:orderId — admin by order
  // =========================================================================
  describe("GET /api/commissions/order/:orderId", () => {
    it("admin can view commissions for a specific order", async () => {
      authAs(adminUser);
      mockGetCommissionsByOrder.mockResolvedValue(sampleCommissions);

      const res = await request(app)
        .get(`/api/commissions/order/${ORDER_ID}`)
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body.commissions).toHaveLength(2);
      expect(mockGetCommissionsByOrder).toHaveBeenCalledWith(ORDER_ID);
    });

    it("returns 403 when a supplier tries to access admin endpoint", async () => {
      authAs(supplierUser);

      const res = await request(app)
        .get(`/api/commissions/order/${ORDER_ID}`)
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // GET /api/commissions/supplier/:supplierId — admin by supplier
  // =========================================================================
  describe("GET /api/commissions/supplier/:supplierId", () => {
    it("admin can view commissions for any supplier", async () => {
      authAs(adminUser);
      mockGetCommissionsBySupplier.mockResolvedValue(sampleCommissions);

      const res = await request(app)
        .get(`/api/commissions/supplier/${SUPPLIER_ID_2}`)
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body.commissions).toHaveLength(2);
      expect(mockGetCommissionsBySupplier).toHaveBeenCalledWith(SUPPLIER_ID_2, {
        startDate: undefined,
        endDate: undefined,
        status: undefined,
      });
    });
  });
});
