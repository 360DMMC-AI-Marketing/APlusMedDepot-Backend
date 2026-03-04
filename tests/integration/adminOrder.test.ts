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

const mockListOrders = jest.fn();
const mockGetOrderDetail = jest.fn();
const mockSearchOrders = jest.fn();
const mockGetOrdersByStatus = jest.fn();

jest.mock("../../src/services/adminOrder.service", () => ({
  AdminOrderService: {
    listOrders: mockListOrders,
    getOrderDetail: mockGetOrderDetail,
    searchOrders: mockSearchOrders,
    getOrdersByStatus: mockGetOrdersByStatus,
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
const ORDER_ID = "a0000000-0000-4000-8000-000000000001";
const ADMIN_USER_ID = "admin-user-001";

const adminUser = {
  id: ADMIN_USER_ID,
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

const customerUser = {
  id: "customer-user-001",
  email: "customer@example.com",
  firstName: "Jane",
  lastName: "Doe",
  companyName: null,
  phone: null,
  role: "customer" as const,
  status: "approved" as const,
  lastLogin: null,
};

const orderListResponse = {
  data: [
    {
      id: ORDER_ID,
      orderNumber: "ORD-20260101-ABC12",
      customerEmail: "customer@example.com",
      customerName: "John Doe",
      totalAmount: 350.0,
      taxAmount: 28.88,
      status: "payment_confirmed",
      paymentStatus: "paid",
      itemCount: 3,
      subOrderCount: 2,
      createdAt: "2026-01-01T00:00:00Z",
    },
  ],
  total: 1,
  page: 1,
  limit: 20,
  totalPages: 1,
};

const orderDetailResponse = {
  id: ORDER_ID,
  orderNumber: "ORD-20260101-ABC12",
  customer: {
    id: "customer-uuid-1",
    email: "customer@example.com",
    firstName: "John",
    lastName: "Doe",
    phone: "+1234567890",
  },
  totalAmount: 350.0,
  taxAmount: 28.88,
  shippingAddress: {
    street: "123 Main",
    city: "Test",
    state: "TX",
    zip_code: "75001",
    country: "US",
  },
  status: "payment_confirmed",
  paymentStatus: "paid",
  paymentIntentId: "pi_test123",
  items: [
    {
      id: "item-1",
      productId: "prod-1",
      productName: "Gloves",
      productSku: "GL-001",
      supplierId: "sup-1",
      supplierName: "MedCo",
      quantity: 2,
      unitPrice: 100.0,
      subtotal: 200.0,
      fulfillmentStatus: "shipped",
      trackingNumber: "TRK123",
      carrier: "UPS",
    },
  ],
  subOrders: [],
  payments: [],
  commissions: [],
  statusHistory: [],
  summary: {
    totalItems: 1,
    totalPlatformCommission: 30.0,
    totalSupplierPayouts: 170.0,
  },
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
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
describe("Admin Order Management API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // Auth / RBAC
  // =========================================================================
  describe("Auth & RBAC", () => {
    it("returns 401 when no auth token is provided", async () => {
      const res = await request(app).get("/api/admin/orders");
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHORIZED");
    });

    it("returns 403 when a supplier tries to access admin order routes", async () => {
      authAs(supplierUser);
      const res = await request(app)
        .get("/api/admin/orders")
        .set("Authorization", "Bearer valid-token");
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("returns 403 when a customer tries to access admin order routes", async () => {
      authAs(customerUser);
      const res = await request(app)
        .get(`/api/admin/orders/${ORDER_ID}`)
        .set("Authorization", "Bearer valid-token");
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });
  });

  // =========================================================================
  // GET /api/admin/orders
  // =========================================================================
  describe("GET /api/admin/orders", () => {
    it("admin sees all orders", async () => {
      authAs(adminUser);
      mockListOrders.mockResolvedValue(orderListResponse);

      const res = await request(app)
        .get("/api/admin/orders")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.total).toBe(1);
      expect(mockListOrders).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 20 }));
    });

    it("pagination works across requests", async () => {
      authAs(adminUser);
      mockListOrders.mockResolvedValue({
        data: [],
        total: 50,
        page: 3,
        limit: 10,
        totalPages: 5,
      });

      const res = await request(app)
        .get("/api/admin/orders?page=3&limit=10")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body.totalPages).toBe(5);
      expect(mockListOrders).toHaveBeenCalledWith(expect.objectContaining({ page: 3, limit: 10 }));
    });

    it("passes status and payment filters", async () => {
      authAs(adminUser);
      mockListOrders.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });

      const res = await request(app)
        .get("/api/admin/orders?status=delivered&paymentStatus=paid")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(mockListOrders).toHaveBeenCalledWith(
        expect.objectContaining({ status: "delivered", paymentStatus: "paid" }),
      );
    });

    it("returns 400 for invalid status", async () => {
      authAs(adminUser);

      const res = await request(app)
        .get("/api/admin/orders?status=bad_status")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid payment status", async () => {
      authAs(adminUser);

      const res = await request(app)
        .get("/api/admin/orders?paymentStatus=invalid")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(400);
    });

    it("returns 400 for limit > 100", async () => {
      authAs(adminUser);

      const res = await request(app)
        .get("/api/admin/orders?limit=999")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(400);
    });
  });

  // =========================================================================
  // GET /api/admin/orders/:id
  // =========================================================================
  describe("GET /api/admin/orders/:id", () => {
    it("returns full order detail", async () => {
      authAs(adminUser);
      mockGetOrderDetail.mockResolvedValue(orderDetailResponse);

      const res = await request(app)
        .get(`/api/admin/orders/${ORDER_ID}`)
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(ORDER_ID);
      expect(res.body.customer.email).toBe("customer@example.com");
      expect(res.body.items).toHaveLength(1);
      expect(mockGetOrderDetail).toHaveBeenCalledWith(ORDER_ID);
    });

    it("returns 404 for non-existent order", async () => {
      authAs(adminUser);
      mockGetOrderDetail.mockRejectedValue(new AppError("Order not found", 404, "NOT_FOUND"));

      const res = await request(app)
        .get(`/api/admin/orders/${ORDER_ID}`)
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(404);
    });

    it("returns 400 for invalid UUID", async () => {
      authAs(adminUser);

      const res = await request(app)
        .get("/api/admin/orders/not-a-uuid")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(400);
    });
  });

  // =========================================================================
  // GET /api/admin/orders/search
  // =========================================================================
  describe("GET /api/admin/orders/search", () => {
    it("searches orders by query", async () => {
      authAs(adminUser);
      mockSearchOrders.mockResolvedValue([orderListResponse.data[0]]);

      const res = await request(app)
        .get("/api/admin/orders/search?q=ORD-2026")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(mockSearchOrders).toHaveBeenCalledWith("ORD-2026");
    });

    it("returns 400 when search query is missing", async () => {
      authAs(adminUser);

      const res = await request(app)
        .get("/api/admin/orders/search")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(400);
    });
  });

  // =========================================================================
  // GET /api/admin/orders/status-counts
  // =========================================================================
  describe("GET /api/admin/orders/status-counts", () => {
    it("returns status counts", async () => {
      authAs(adminUser);
      mockGetOrdersByStatus.mockResolvedValue({
        pending_payment: 5,
        payment_confirmed: 12,
        delivered: 20,
      });

      const res = await request(app)
        .get("/api/admin/orders/status-counts")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body.pending_payment).toBe(5);
      expect(res.body.delivered).toBe(20);
    });
  });
});
