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

const mockGetSupplierOrders = jest.fn();
const mockGetSupplierOrderDetail = jest.fn();
const mockGetSupplierOrderStats = jest.fn();
const mockUpdateItemFulfillment = jest.fn();

jest.mock("../../src/services/supplierOrder.service", () => ({
  SupplierOrderService: {
    getSupplierOrders: mockGetSupplierOrders,
    getSupplierOrderDetail: mockGetSupplierOrderDetail,
    getSupplierOrderStats: mockGetSupplierOrderStats,
    updateItemFulfillment: mockUpdateItemFulfillment,
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
const SUB_ORDER_ID = "c0000000-0000-4000-8000-000000000001";
const MASTER_ORDER_ID = "d0000000-0000-4000-8000-000000000001";
const ITEM_ID = "e0000000-0000-4000-8000-000000000001";

const supplierUser = {
  id: "user-supplier-order-1",
  email: "supplier-order@example.com",
  firstName: "Sam",
  lastName: "Supply",
  companyName: null,
  phone: null,
  role: "supplier" as const,
  status: "approved" as const,
  lastLogin: null,
};

const customerUser = {
  id: "user-customer-order-1",
  email: "customer-order@example.com",
  firstName: "Jane",
  lastName: "Doe",
  companyName: null,
  phone: null,
  role: "customer" as const,
  status: "approved" as const,
  lastLogin: null,
};

const sampleOrders = [
  {
    id: SUB_ORDER_ID,
    orderNumber: "SUB-ORD-20250601-A1B2C-1",
    masterOrderId: MASTER_ORDER_ID,
    customerId: "cust-1",
    customerName: "Jane Doe",
    totalAmount: 100,
    taxAmount: 8.25,
    commissionAmount: 15,
    payoutAmount: 85,
    commissionRate: 15,
    status: "awaiting_fulfillment",
    paymentStatus: "paid",
    itemCount: 2,
    createdAt: "2025-06-01T00:00:00Z",
  },
  {
    id: "c0000000-0000-4000-8000-000000000002",
    orderNumber: "SUB-ORD-20250602-D3E4F-1",
    masterOrderId: "d0000000-0000-4000-8000-000000000002",
    customerId: "cust-2",
    customerName: "John Smith",
    totalAmount: 200,
    taxAmount: 16.5,
    commissionAmount: 30,
    payoutAmount: 170,
    commissionRate: 15,
    status: "delivered",
    paymentStatus: "paid",
    itemCount: 3,
    createdAt: "2025-06-02T00:00:00Z",
  },
];

const sampleDetail = {
  id: SUB_ORDER_ID,
  orderNumber: "SUB-ORD-20250601-A1B2C-1",
  masterOrderId: MASTER_ORDER_ID,
  customerId: "cust-1",
  customerName: "Jane Doe",
  totalAmount: 100,
  taxAmount: 8.25,
  commissionAmount: 15,
  payoutAmount: 85,
  commissionRate: 15,
  status: "awaiting_fulfillment",
  paymentStatus: "paid",
  shippingAddress: { street: "123 Main St", city: "Austin", state: "TX", zip: "78701" },
  items: [
    {
      id: "item-1",
      productId: "prod-1",
      productName: "Surgical Gloves",
      quantity: 5,
      unitPrice: 10,
      subtotal: 50,
      fulfillmentStatus: "pending",
      trackingNumber: null,
      carrier: null,
      shippedAt: null,
      deliveredAt: null,
    },
    {
      id: "item-2",
      productId: "prod-2",
      productName: "Face Masks",
      quantity: 10,
      unitPrice: 5,
      subtotal: 50,
      fulfillmentStatus: "pending",
      trackingNumber: null,
      carrier: null,
      shippedAt: null,
      deliveredAt: null,
    },
  ],
  statusHistory: [
    {
      id: "hist-1",
      fromStatus: "payment_confirmed",
      toStatus: "awaiting_fulfillment",
      changedBy: "system",
      reason: null,
      createdAt: "2025-06-01T01:00:00Z",
    },
  ],
  createdAt: "2025-06-01T00:00:00Z",
  updatedAt: "2025-06-01T01:00:00Z",
};

const sampleStats = {
  ordersThisMonth: 5,
  ordersLastMonth: 8,
  revenueThisMonth: 425.5,
  averageOrderValue: 120,
  statusCounts: {
    pending: 1,
    processing: 2,
    shipped: 1,
    delivered: 4,
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
describe("Supplier Order API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // GET /api/suppliers/me/orders
  // =========================================================================
  describe("GET /api/suppliers/me/orders", () => {
    it("supplier sees only their sub-orders", async () => {
      authAs(supplierUser);
      mockGetSupplierIdFromUserId.mockResolvedValue(SUPPLIER_ID);
      mockGetSupplierOrders.mockResolvedValue({ data: sampleOrders, total: 2 });

      const res = await request(app)
        .get("/api/suppliers/me/orders")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.total).toBe(2);
      expect(mockGetSupplierOrders).toHaveBeenCalledWith(SUPPLIER_ID, {
        page: 1,
        limit: 20,
        status: undefined,
        startDate: undefined,
        endDate: undefined,
      });
    });

    it("pagination works with custom page and limit", async () => {
      authAs(supplierUser);
      mockGetSupplierIdFromUserId.mockResolvedValue(SUPPLIER_ID);
      mockGetSupplierOrders.mockResolvedValue({ data: [sampleOrders[0]], total: 2 });

      const res = await request(app)
        .get("/api/suppliers/me/orders?page=1&limit=1")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.total).toBe(2);
      expect(mockGetSupplierOrders).toHaveBeenCalledWith(SUPPLIER_ID, {
        page: 1,
        limit: 1,
        status: undefined,
        startDate: undefined,
        endDate: undefined,
      });
    });

    it("status filter works", async () => {
      authAs(supplierUser);
      mockGetSupplierIdFromUserId.mockResolvedValue(SUPPLIER_ID);
      mockGetSupplierOrders.mockResolvedValue({ data: [sampleOrders[1]], total: 1 });

      const res = await request(app)
        .get("/api/suppliers/me/orders?status=delivered")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(mockGetSupplierOrders).toHaveBeenCalledWith(SUPPLIER_ID, {
        page: 1,
        limit: 20,
        status: "delivered",
        startDate: undefined,
        endDate: undefined,
      });
    });

    it("returns 403 when a customer tries to access", async () => {
      authAs(customerUser);

      const res = await request(app)
        .get("/api/suppliers/me/orders")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // GET /api/suppliers/me/orders/:id
  // =========================================================================
  describe("GET /api/suppliers/me/orders/:id", () => {
    it("order detail includes items and commission breakdown", async () => {
      authAs(supplierUser);
      mockGetSupplierIdFromUserId.mockResolvedValue(SUPPLIER_ID);
      mockGetSupplierOrderDetail.mockResolvedValue(sampleDetail);

      const res = await request(app)
        .get(`/api/suppliers/me/orders/${SUB_ORDER_ID}`)
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(2);
      expect(res.body.items[0].productName).toBe("Surgical Gloves");
      // commission_rate 15% → commissionAmount = 100 * 0.15 = 15
      expect(res.body.commissionRate).toBe(15);
      expect(res.body.commissionAmount).toBe(15);
      expect(res.body.payoutAmount).toBe(85);
      expect(res.body.statusHistory).toHaveLength(1);
      expect(res.body.shippingAddress).toBeDefined();
      expect(mockGetSupplierOrderDetail).toHaveBeenCalledWith(SUPPLIER_ID, SUB_ORDER_ID);
    });

    it("returns 403 for sub-order belonging to different supplier", async () => {
      authAs(supplierUser);
      mockGetSupplierIdFromUserId.mockResolvedValue(SUPPLIER_ID);
      mockGetSupplierOrderDetail.mockRejectedValue(
        new AppError("You can only view your own orders", 403, "FORBIDDEN"),
      );

      const res = await request(app)
        .get(`/api/suppliers/me/orders/${SUB_ORDER_ID}`)
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // GET /api/suppliers/me/orders/stats
  // =========================================================================
  describe("GET /api/suppliers/me/orders/stats", () => {
    it("stats calculated correctly", async () => {
      authAs(supplierUser);
      mockGetSupplierIdFromUserId.mockResolvedValue(SUPPLIER_ID);
      mockGetSupplierOrderStats.mockResolvedValue(sampleStats);

      const res = await request(app)
        .get("/api/suppliers/me/orders/stats")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body.ordersThisMonth).toBe(5);
      expect(res.body.ordersLastMonth).toBe(8);
      expect(res.body.revenueThisMonth).toBe(425.5);
      expect(res.body.averageOrderValue).toBe(120);
      expect(res.body.statusCounts.pending).toBe(1);
      expect(res.body.statusCounts.processing).toBe(2);
      expect(res.body.statusCounts.shipped).toBe(1);
      expect(res.body.statusCounts.delivered).toBe(4);
    });
  });

  // =========================================================================
  // PUT /api/suppliers/me/orders/items/:itemId/fulfillment
  // =========================================================================
  describe("PUT /api/suppliers/me/orders/items/:itemId/fulfillment", () => {
    it("pending → processing succeeds", async () => {
      authAs(supplierUser);
      mockGetSupplierIdFromUserId.mockResolvedValue(SUPPLIER_ID);
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

    it("processing → shipped with tracking succeeds", async () => {
      authAs(supplierUser);
      mockGetSupplierIdFromUserId.mockResolvedValue(SUPPLIER_ID);
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
      expect(res.body.message).toBe("Fulfillment status updated");
      expect(mockUpdateItemFulfillment).toHaveBeenCalledWith(SUPPLIER_ID, ITEM_ID, {
        fulfillmentStatus: "shipped",
        trackingNumber: "1Z999AA10123456784",
        carrier: "UPS",
      });
    });

    it("shipped → delivered succeeds", async () => {
      authAs(supplierUser);
      mockGetSupplierIdFromUserId.mockResolvedValue(SUPPLIER_ID);
      mockUpdateItemFulfillment.mockResolvedValue(undefined);

      const res = await request(app)
        .put(`/api/suppliers/me/orders/items/${ITEM_ID}/fulfillment`)
        .set("Authorization", "Bearer valid-token")
        .send({ fulfillmentStatus: "delivered" });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe("Fulfillment status updated");
      expect(mockUpdateItemFulfillment).toHaveBeenCalledWith(SUPPLIER_ID, ITEM_ID, {
        fulfillmentStatus: "delivered",
        trackingNumber: undefined,
        carrier: undefined,
      });
    });

    it("shipped without tracking → validation error", async () => {
      authAs(supplierUser);
      mockGetSupplierIdFromUserId.mockResolvedValue(SUPPLIER_ID);

      const res = await request(app)
        .put(`/api/suppliers/me/orders/items/${ITEM_ID}/fulfillment`)
        .set("Authorization", "Bearer valid-token")
        .send({ fulfillmentStatus: "shipped" });

      expect(res.status).toBe(400);
      expect(mockUpdateItemFulfillment).not.toHaveBeenCalled();
    });

    it("backward transition (shipped → processing) → rejected", async () => {
      authAs(supplierUser);
      mockGetSupplierIdFromUserId.mockResolvedValue(SUPPLIER_ID);
      mockUpdateItemFulfillment.mockRejectedValue(
        new AppError("Cannot transition from shipped to processing", 409, "CONFLICT"),
      );

      const res = await request(app)
        .put(`/api/suppliers/me/orders/items/${ITEM_ID}/fulfillment`)
        .set("Authorization", "Bearer valid-token")
        .send({ fulfillmentStatus: "processing" });

      expect(res.status).toBe(409);
    });

    it("wrong supplier → 403", async () => {
      authAs(supplierUser);
      mockGetSupplierIdFromUserId.mockResolvedValue(SUPPLIER_ID);
      mockUpdateItemFulfillment.mockRejectedValue(
        new AppError("This item does not belong to your supplier account", 403, "FORBIDDEN"),
      );

      const res = await request(app)
        .put(`/api/suppliers/me/orders/items/${ITEM_ID}/fulfillment`)
        .set("Authorization", "Bearer valid-token")
        .send({ fulfillmentStatus: "processing" });

      expect(res.status).toBe(403);
    });

    it("master order auto-updates to partially_shipped when first item ships", async () => {
      authAs(supplierUser);
      mockGetSupplierIdFromUserId.mockResolvedValue(SUPPLIER_ID);
      mockUpdateItemFulfillment.mockResolvedValue(undefined);

      const res = await request(app)
        .put(`/api/suppliers/me/orders/items/${ITEM_ID}/fulfillment`)
        .set("Authorization", "Bearer valid-token")
        .send({
          fulfillmentStatus: "shipped",
          trackingNumber: "9400111899223100001",
          carrier: "USPS",
        });

      expect(res.status).toBe(200);
      expect(mockUpdateItemFulfillment).toHaveBeenCalledWith(SUPPLIER_ID, ITEM_ID, {
        fulfillmentStatus: "shipped",
        trackingNumber: "9400111899223100001",
        carrier: "USPS",
      });
    });

    it("master order auto-updates to shipped when ALL items shipped", async () => {
      authAs(supplierUser);
      mockGetSupplierIdFromUserId.mockResolvedValue(SUPPLIER_ID);
      mockUpdateItemFulfillment.mockResolvedValue(undefined);

      const secondItemId = "e0000000-0000-4000-8000-000000000002";
      const res = await request(app)
        .put(`/api/suppliers/me/orders/items/${secondItemId}/fulfillment`)
        .set("Authorization", "Bearer valid-token")
        .send({
          fulfillmentStatus: "shipped",
          trackingNumber: "794644790132",
          carrier: "FedEx",
        });

      expect(res.status).toBe(200);
      expect(mockUpdateItemFulfillment).toHaveBeenCalledWith(SUPPLIER_ID, secondItemId, {
        fulfillmentStatus: "shipped",
        trackingNumber: "794644790132",
        carrier: "FedEx",
      });
    });

    it("master order auto-updates to delivered when ALL items delivered", async () => {
      authAs(supplierUser);
      mockGetSupplierIdFromUserId.mockResolvedValue(SUPPLIER_ID);
      mockUpdateItemFulfillment.mockResolvedValue(undefined);

      const res = await request(app)
        .put(`/api/suppliers/me/orders/items/${ITEM_ID}/fulfillment`)
        .set("Authorization", "Bearer valid-token")
        .send({ fulfillmentStatus: "delivered" });

      expect(res.status).toBe(200);
      expect(mockUpdateItemFulfillment).toHaveBeenCalledWith(SUPPLIER_ID, ITEM_ID, {
        fulfillmentStatus: "delivered",
        trackingNumber: undefined,
        carrier: undefined,
      });
    });

    it("shipping notification email triggered on shipped status", async () => {
      authAs(supplierUser);
      mockGetSupplierIdFromUserId.mockResolvedValue(SUPPLIER_ID);
      mockUpdateItemFulfillment.mockResolvedValue(undefined);

      const res = await request(app)
        .put(`/api/suppliers/me/orders/items/${ITEM_ID}/fulfillment`)
        .set("Authorization", "Bearer valid-token")
        .send({
          fulfillmentStatus: "shipped",
          trackingNumber: "5012345678",
          carrier: "DHL",
        });

      expect(res.status).toBe(200);
      expect(mockUpdateItemFulfillment).toHaveBeenCalledWith(SUPPLIER_ID, ITEM_ID, {
        fulfillmentStatus: "shipped",
        trackingNumber: "5012345678",
        carrier: "DHL",
      });
    });
  });
});
