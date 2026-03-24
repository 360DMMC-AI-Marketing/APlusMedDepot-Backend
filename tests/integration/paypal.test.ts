import request from "supertest";

const mockVerifyToken = jest.fn();

jest.mock("../../src/services/auth.service", () => ({
  AuthService: {
    signUp: jest.fn(),
    verifyToken: mockVerifyToken,
  },
}));

const mockCreateOrder = jest.fn();
const mockCaptureOrder = jest.fn();

jest.mock("../../src/services/paypal.service", () => ({
  PayPalService: {
    createOrder: mockCreateOrder,
    captureOrder: mockCaptureOrder,
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

jest.mock(
  "express-rate-limit",
  () => () => (_req: unknown, _res: unknown, next: () => void) => next(),
);

import app from "../../src/index";
import { AppError } from "../../src/utils/errors";

const ORDER_ID = "a0000000-0000-4000-8000-000000000001";

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

beforeEach(() => {
  jest.clearAllMocks();
});

describe("PayPal Payment Routes", () => {
  describe("POST /api/payments/paypal/create-order", () => {
    it("returns 201 with paypalOrderId for valid order", async () => {
      mockVerifyToken.mockResolvedValue(customerUser);
      mockCreateOrder.mockResolvedValue({
        paypalOrderId: "PAYPAL-ORDER-123",
        approvalUrl: "https://www.sandbox.paypal.com/checkoutnow?token=PAYPAL-ORDER-123",
      });

      const res = await request(app)
        .post("/api/payments/paypal/create-order")
        .set("Authorization", "Bearer valid-token")
        .send({ orderId: ORDER_ID });

      expect(res.status).toBe(201);
      expect(res.body.paypalOrderId).toBe("PAYPAL-ORDER-123");
      expect(res.body.approvalUrl).toContain("sandbox.paypal.com");
      expect(mockCreateOrder).toHaveBeenCalledWith(ORDER_ID, customerUser.id);
    });

    it("returns 401 for unauthenticated request", async () => {
      const res = await request(app)
        .post("/api/payments/paypal/create-order")
        .send({ orderId: ORDER_ID });

      expect(res.status).toBe(401);
    });

    it("returns 403 for supplier user", async () => {
      mockVerifyToken.mockResolvedValue(supplierUser);

      const res = await request(app)
        .post("/api/payments/paypal/create-order")
        .set("Authorization", "Bearer valid-token")
        .send({ orderId: ORDER_ID });

      expect(res.status).toBe(403);
    });

    it("returns 404 for non-existent order", async () => {
      mockVerifyToken.mockResolvedValue(customerUser);
      mockCreateOrder.mockRejectedValue(new AppError("Order not found", 404, "NOT_FOUND"));

      const res = await request(app)
        .post("/api/payments/paypal/create-order")
        .set("Authorization", "Bearer valid-token")
        .send({ orderId: ORDER_ID });

      expect(res.status).toBe(404);
    });

    it("returns 409 when Stripe already initiated", async () => {
      mockVerifyToken.mockResolvedValue(customerUser);
      mockCreateOrder.mockRejectedValue(
        new AppError("Payment already initiated via Stripe. Cannot use PayPal.", 409, "CONFLICT"),
      );

      const res = await request(app)
        .post("/api/payments/paypal/create-order")
        .set("Authorization", "Bearer valid-token")
        .send({ orderId: ORDER_ID });

      expect(res.status).toBe(409);
      expect(res.body.error.message).toContain("Stripe");
    });
  });

  describe("POST /api/payments/paypal/capture", () => {
    it("returns 200 with capture result", async () => {
      mockVerifyToken.mockResolvedValue(customerUser);
      mockCaptureOrder.mockResolvedValue({
        orderId: ORDER_ID,
        status: "paid",
        paidAt: "2026-03-11T00:00:00.000Z",
      });

      const res = await request(app)
        .post("/api/payments/paypal/capture")
        .set("Authorization", "Bearer valid-token")
        .send({ orderId: ORDER_ID });

      expect(res.status).toBe(200);
      expect(res.body.orderId).toBe(ORDER_ID);
      expect(res.body.status).toBe("paid");
      expect(res.body.paidAt).toBeTruthy();
      expect(mockCaptureOrder).toHaveBeenCalledWith(ORDER_ID, customerUser.id);
    });

    it("returns 401 for unauthenticated request", async () => {
      const res = await request(app)
        .post("/api/payments/paypal/capture")
        .send({ orderId: ORDER_ID });

      expect(res.status).toBe(401);
    });

    it("returns 403 for supplier user", async () => {
      mockVerifyToken.mockResolvedValue(supplierUser);

      const res = await request(app)
        .post("/api/payments/paypal/capture")
        .set("Authorization", "Bearer valid-token")
        .send({ orderId: ORDER_ID });

      expect(res.status).toBe(403);
    });
  });
});
