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

const mockPayPalCreateOrder = jest.fn();
const mockPayPalCaptureOrder = jest.fn();

jest.mock("../../../src/services/paypal.service", () => ({
  PayPalService: {
    createOrder: mockPayPalCreateOrder,
    captureOrder: mockPayPalCaptureOrder,
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

const customerUser = {
  id: "cust-pp-001",
  email: "customer@example.com",
  firstName: "Jane",
  lastName: "Doe",
  companyName: null,
  phone: null,
  role: "customer" as const,
  status: "approved" as const,
  lastLogin: null,
};

const ORDER_ID = "c0000000-0000-4000-a000-000000000010";

// ---------- Tests ----------

describe("PayPal Purchase Flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("Step 1: Create PayPal order", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);

    mockPayPalCreateOrder.mockResolvedValue({
      paypalOrderId: "PAYPAL-ORDER-123",
      approvalUrl: "https://sandbox.paypal.com/checkoutnow?token=PAYPAL-ORDER-123",
    });

    const res = await request(app)
      .post("/api/payments/paypal/create-order")
      .set("Authorization", "Bearer valid-token")
      .send({ orderId: ORDER_ID });

    expect(res.status).toBe(201);
    expect(res.body.paypalOrderId).toBe("PAYPAL-ORDER-123");
    expect(res.body.approvalUrl).toContain("paypal.com");
    expect(mockPayPalCreateOrder).toHaveBeenCalledWith(ORDER_ID, customerUser.id);
  });

  it("Step 2: Capture PayPal order — confirms payment", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);

    mockPayPalCaptureOrder.mockResolvedValue({
      orderId: ORDER_ID,
      status: "confirmed",
      paymentStatus: "paid",
      paymentMethod: "paypal",
      paypalOrderId: "PAYPAL-ORDER-123",
      captureId: "CAPTURE-456",
    });

    const res = await request(app)
      .post("/api/payments/paypal/capture")
      .set("Authorization", "Bearer valid-token")
      .send({ orderId: ORDER_ID });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("confirmed");
    expect(res.body.paymentStatus).toBe("paid");
    expect(res.body.paymentMethod).toBe("paypal");
    expect(mockPayPalCaptureOrder).toHaveBeenCalledWith(ORDER_ID, customerUser.id);
  });

  it("Step 3: PayPal create-order fails for non-existent order", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);

    const error = new Error("Order not found");
    Object.assign(error, { statusCode: 404, code: "NOT_FOUND" });
    mockPayPalCreateOrder.mockRejectedValue(error);

    const res = await request(app)
      .post("/api/payments/paypal/create-order")
      .set("Authorization", "Bearer valid-token")
      .send({ orderId: "a0000000-0000-4000-a000-000000000099" });

    expect(res.status).toBe(404);
  });

  it("Step 4: PayPal capture fails when payment already completed", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);

    const error = new Error("Payment already completed for this order");
    Object.assign(error, { statusCode: 409, code: "CONFLICT" });
    mockPayPalCaptureOrder.mockRejectedValue(error);

    const res = await request(app)
      .post("/api/payments/paypal/capture")
      .set("Authorization", "Bearer valid-token")
      .send({ orderId: ORDER_ID });

    expect(res.status).toBe(409);
  });

  it("Step 5: Unauthenticated request is rejected", async () => {
    const res = await request(app)
      .post("/api/payments/paypal/create-order")
      .send({ orderId: ORDER_ID });

    expect(res.status).toBe(401);
  });

  it("Step 6: Invalid orderId format is rejected", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);

    const res = await request(app)
      .post("/api/payments/paypal/create-order")
      .set("Authorization", "Bearer valid-token")
      .send({ orderId: "not-a-uuid" });

    expect(res.status).toBe(400);
  });
});
