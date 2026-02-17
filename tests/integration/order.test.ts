import request from "supertest";

const mockVerifyToken = jest.fn();

jest.mock("../../src/services/auth.service", () => ({
  AuthService: {
    signUp: jest.fn(),
    verifyToken: mockVerifyToken,
  },
}));

jest.mock("../../src/services/product.service", () => ({
  ProductService: {},
}));

jest.mock("../../src/services/storage.service", () => ({
  StorageService: {},
}));

jest.mock("../../src/services/cart.service", () => ({
  CartService: {},
}));

jest.mock("../../src/services/checkout.service", () => ({
  CheckoutService: {},
}));

const mockCreateOrder = jest.fn();
const mockUpdateOrderStatus = jest.fn();
const mockGetOrderById = jest.fn();
const mockUpdateMasterOrderStatus = jest.fn();

jest.mock("../../src/services/order.service", () => ({
  OrderService: {
    createOrder: mockCreateOrder,
    updateOrderStatus: mockUpdateOrderStatus,
    getOrderById: mockGetOrderById,
    updateMasterOrderStatus: mockUpdateMasterOrderStatus,
  },
}));

jest.mock("../../src/utils/inventory", () => ({
  checkStock: jest.fn(),
}));

jest.mock(
  "express-rate-limit",
  () => () => (_req: unknown, _res: unknown, next: () => void) => next(),
);

import app from "../../src/index";

const customerUser = {
  id: "user-customer-1",
  email: "customer@example.com",
  firstName: "Jane",
  lastName: "Doe",
  companyName: null,
  phone: null,
  role: "customer" as const,
  status: "approved" as const,
  lastLogin: null,
};

const supplierUser = {
  id: "user-supplier-1",
  email: "supplier@example.com",
  firstName: "Sam",
  lastName: "Supply",
  companyName: null,
  phone: null,
  role: "supplier" as const,
  status: "approved" as const,
  lastLogin: null,
};

const adminUser = {
  id: "user-admin-1",
  email: "admin@example.com",
  firstName: "Admin",
  lastName: "User",
  companyName: null,
  phone: null,
  role: "admin" as const,
  status: "approved" as const,
  lastLogin: null,
};

const validBody = {
  shipping_address: {
    street: "123 Main St",
    city: "Austin",
    state: "TX",
    zip_code: "78701",
    country: "US",
  },
  notes: "Please deliver before 5pm",
};

const mockOrderResponse = {
  id: "order-uuid-1",
  order_number: "ORD-20260216-ABC12",
  customer_id: "user-customer-1",
  parent_order_id: null,
  supplier_id: null,
  total_amount: 32.48,
  tax_amount: 2.48,
  shipping_address: validBody.shipping_address,
  status: "pending_payment",
  payment_status: "pending",
  payment_intent_id: null,
  notes: "Please deliver before 5pm",
  items: [
    {
      id: "oi-uuid-1",
      order_id: "order-uuid-1",
      product_id: "prod-1",
      product_name: "Surgical Gloves",
      supplier_id: "sup-1",
      quantity: 2,
      unit_price: 15.0,
      subtotal: 30.0,
      fulfillment_status: "pending",
    },
  ],
  created_at: "2026-02-16T00:00:00Z",
  updated_at: "2026-02-16T00:00:00Z",
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("POST /api/orders — integration", () => {
  it("returns 201 with full order response", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);
    mockCreateOrder.mockResolvedValue(mockOrderResponse);

    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", "Bearer valid-token")
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.order.id).toBe("order-uuid-1");
    expect(res.body.order.status).toBe("pending_payment");
    expect(res.body.order.payment_status).toBe("pending");
    expect(res.body.order.items).toHaveLength(1);
    expect(res.body.order.total_amount).toBe(32.48);
    expect(res.body.order.shipping_address).toEqual(validBody.shipping_address);
  });

  it("returns 201 without optional notes", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);
    const orderWithoutNotes = { ...mockOrderResponse, notes: null };
    mockCreateOrder.mockResolvedValue(orderWithoutNotes);

    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", "Bearer valid-token")
      .send({ shipping_address: validBody.shipping_address });

    expect(res.status).toBe(201);
    expect(res.body.order.notes).toBeNull();
  });

  it("returns 400 for missing shipping_address", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);

    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", "Bearer valid-token")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(mockCreateOrder).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid zip_code", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);

    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", "Bearer valid-token")
      .send({
        shipping_address: {
          street: "123 Main St",
          city: "Austin",
          state: "TX",
          zip_code: "ABCDE",
          country: "US",
        },
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(mockCreateOrder).not.toHaveBeenCalled();
  });

  it("returns 400 when service throws badRequest (empty cart)", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);
    mockCreateOrder.mockRejectedValue(
      Object.assign(new Error("Cart is empty"), {
        statusCode: 400,
        code: "BAD_REQUEST",
      }),
    );

    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", "Bearer valid-token")
      .send(validBody);

    expect(res.status).toBe(400);
  });

  it("returns 400 when service throws badRequest (insufficient stock)", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);
    mockCreateOrder.mockRejectedValue(
      Object.assign(new Error("Insufficient stock for one or more items"), {
        statusCode: 400,
        code: "BAD_REQUEST",
      }),
    );

    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", "Bearer valid-token")
      .send(validBody);

    expect(res.status).toBe(400);
  });

  it("returns 401 without auth token", async () => {
    const res = await request(app).post("/api/orders").send(validBody);

    expect(res.status).toBe(401);
    expect(mockCreateOrder).not.toHaveBeenCalled();
  });

  it("returns 403 when supplier tries to create order", async () => {
    mockVerifyToken.mockResolvedValue(supplierUser);

    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", "Bearer valid-token")
      .send(validBody);

    expect(res.status).toBe(403);
    expect(mockCreateOrder).not.toHaveBeenCalled();
  });

  it("calls createOrder with correct arguments", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);
    mockCreateOrder.mockResolvedValue(mockOrderResponse);

    await request(app)
      .post("/api/orders")
      .set("Authorization", "Bearer valid-token")
      .send(validBody);

    expect(mockCreateOrder).toHaveBeenCalledWith(
      customerUser.id,
      validBody.shipping_address,
      validBody.notes,
    );
  });
});

// ── PUT /api/orders/:id/status ──────────────────────────────────────

const ORDER_ID = "order-uuid-1";

const mockUpdatedOrder = {
  id: ORDER_ID,
  order_number: "ORD-20260216-ABC12",
  customer_id: "user-customer-1",
  parent_order_id: null,
  supplier_id: null,
  total_amount: 32.48,
  tax_amount: 2.48,
  shipping_address: validBody.shipping_address,
  status: "payment_processing",
  payment_status: "pending",
  payment_intent_id: null,
  notes: null,
  items: [],
  created_at: "2026-02-16T00:00:00Z",
  updated_at: "2026-02-16T00:00:00Z",
};

describe("PUT /api/orders/:id/status — integration", () => {
  it("returns 200 on valid status update (admin)", async () => {
    mockVerifyToken.mockResolvedValue(adminUser);
    mockUpdateOrderStatus.mockResolvedValue(mockUpdatedOrder);

    const res = await request(app)
      .put(`/api/orders/${ORDER_ID}/status`)
      .set("Authorization", "Bearer valid-token")
      .send({ status: "payment_processing" });

    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe("payment_processing");
    expect(mockUpdateOrderStatus).toHaveBeenCalledWith(
      ORDER_ID,
      "payment_processing",
      adminUser.id,
      undefined,
    );
  });

  it("returns 400 for invalid status value (Zod rejects)", async () => {
    mockVerifyToken.mockResolvedValue(adminUser);

    const res = await request(app)
      .put(`/api/orders/${ORDER_ID}/status`)
      .set("Authorization", "Bearer valid-token")
      .send({ status: "invalid_status" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(mockUpdateOrderStatus).not.toHaveBeenCalled();
  });

  it("returns 400 when service throws badRequest (invalid transition)", async () => {
    mockVerifyToken.mockResolvedValue(adminUser);
    mockUpdateOrderStatus.mockRejectedValue(
      Object.assign(new Error("Invalid status transition"), {
        statusCode: 400,
        code: "BAD_REQUEST",
      }),
    );

    const res = await request(app)
      .put(`/api/orders/${ORDER_ID}/status`)
      .set("Authorization", "Bearer valid-token")
      .send({ status: "payment_processing" });

    expect(res.status).toBe(400);
  });

  it("returns 401 without auth token", async () => {
    const res = await request(app)
      .put(`/api/orders/${ORDER_ID}/status`)
      .send({ status: "payment_processing" });

    expect(res.status).toBe(401);
    expect(mockUpdateOrderStatus).not.toHaveBeenCalled();
  });

  it("returns 403 when customer tries to update status", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);

    const res = await request(app)
      .put(`/api/orders/${ORDER_ID}/status`)
      .set("Authorization", "Bearer valid-token")
      .send({ status: "payment_processing" });

    expect(res.status).toBe(403);
    expect(mockUpdateOrderStatus).not.toHaveBeenCalled();
  });
});

// ── GET /api/orders/:id ─────────────────────────────────────────────

const mockFullOrder = {
  ...mockOrderResponse,
  status_history: [
    {
      id: "hist-1",
      order_id: ORDER_ID,
      from_status: "pending_payment",
      to_status: "payment_processing",
      changed_by: "user-admin-1",
      reason: "Payment initiated",
      created_at: "2026-02-16T01:00:00Z",
    },
  ],
};

describe("GET /api/orders/:id — integration", () => {
  it("returns 200 with order, items, and status_history (customer)", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);
    mockGetOrderById.mockResolvedValue(mockFullOrder);

    const res = await request(app)
      .get(`/api/orders/${ORDER_ID}`)
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body.order.id).toBe(ORDER_ID);
    expect(res.body.order.items).toHaveLength(1);
    expect(res.body.order.status_history).toHaveLength(1);
  });

  it("returns 200 when admin views any order", async () => {
    mockVerifyToken.mockResolvedValue(adminUser);
    mockGetOrderById.mockResolvedValue(mockFullOrder);

    const res = await request(app)
      .get(`/api/orders/${ORDER_ID}`)
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(mockGetOrderById).toHaveBeenCalledWith(ORDER_ID, adminUser.id, "admin");
  });

  it("returns 403 when customer views another's order", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);
    mockGetOrderById.mockRejectedValue(
      Object.assign(new Error("You can only view your own orders"), {
        statusCode: 403,
        code: "FORBIDDEN",
      }),
    );

    const res = await request(app)
      .get(`/api/orders/${ORDER_ID}`)
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(403);
  });

  it("returns 401 without auth token", async () => {
    const res = await request(app).get(`/api/orders/${ORDER_ID}`);

    expect(res.status).toBe(401);
    expect(mockGetOrderById).not.toHaveBeenCalled();
  });
});
