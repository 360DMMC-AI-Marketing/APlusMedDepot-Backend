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

const mockGetCreditInfo = jest.fn();

jest.mock("../../../src/services/credit.service", () => ({
  CreditService: {
    getCreditInfo: mockGetCreditInfo,
  },
}));

const mockPlaceNet30Order = jest.fn();

jest.mock("../../../src/services/net30.service", () => ({
  Net30Service: {
    placeNet30Order: mockPlaceNet30Order,
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
  id: "cust-n30-001",
  email: "net30customer@example.com",
  firstName: "Bob",
  lastName: "Builder",
  companyName: "MedCorp Inc",
  phone: null,
  role: "customer" as const,
  status: "approved" as const,
  lastLogin: null,
};

const ORDER_ID = "c0000000-0000-4000-a000-000000000020";

// ---------- Tests ----------

describe("Net30 Credit Purchase Flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("Step 1: Check credit eligibility — user has credit", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);

    mockGetCreditInfo.mockResolvedValue({
      eligible: true,
      limit: 50000,
      used: 0,
      available: 50000,
    });

    const res = await request(app)
      .get("/api/users/me/credit")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body.eligible).toBe(true);
    expect(res.body.available).toBe(50000);
    expect(res.body.used).toBe(0);
    expect(mockGetCreditInfo).toHaveBeenCalledWith(customerUser.id);
  });

  it("Step 2: Place Net30 order — confirms with invoice", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);

    mockPlaceNet30Order.mockResolvedValue({
      orderId: ORDER_ID,
      invoiceId: "inv-001",
      invoiceDueDate: dueDate.toISOString(),
      amount: 110.38,
      status: "confirmed",
    });

    const res = await request(app)
      .post("/api/payments/net30")
      .set("Authorization", "Bearer valid-token")
      .send({ orderId: ORDER_ID });

    expect(res.status).toBe(201);
    expect(res.body.orderId).toBe(ORDER_ID);
    expect(res.body.invoiceId).toBe("inv-001");
    expect(res.body.status).toBe("confirmed");
    expect(res.body.amount).toBe(110.38);
    expect(mockPlaceNet30Order).toHaveBeenCalledWith(ORDER_ID, customerUser.id);
  });

  it("Step 3: Verify credit deducted after Net30 order", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);

    mockGetCreditInfo.mockResolvedValue({
      eligible: true,
      limit: 50000,
      used: 110.38,
      available: 49889.62,
    });

    const res = await request(app)
      .get("/api/users/me/credit")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body.used).toBe(110.38);
    expect(res.body.available).toBe(49889.62);
  });

  it("Step 4: Net30 with insufficient credit — 403", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);

    const error = new Error("Insufficient credit: available $50.00, required $200.00");
    Object.assign(error, { statusCode: 403, code: "INSUFFICIENT_CREDIT" });
    mockPlaceNet30Order.mockRejectedValue(error);

    const res = await request(app)
      .post("/api/payments/net30")
      .set("Authorization", "Bearer valid-token")
      .send({ orderId: ORDER_ID });

    expect(res.status).toBe(403);
  });

  it("Step 5: Net30 for ineligible user — 403", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);

    const error = new Error("User is not eligible for Net30 credit");
    Object.assign(error, { statusCode: 403, code: "NOT_ELIGIBLE" });
    mockPlaceNet30Order.mockRejectedValue(error);

    const res = await request(app)
      .post("/api/payments/net30")
      .set("Authorization", "Bearer valid-token")
      .send({ orderId: ORDER_ID });

    expect(res.status).toBe(403);
  });

  it("Step 6: Net30 when payment already initiated — 409", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);

    const error = new Error("Payment already initiated for this order");
    Object.assign(error, { statusCode: 409, code: "CONFLICT" });
    mockPlaceNet30Order.mockRejectedValue(error);

    const res = await request(app)
      .post("/api/payments/net30")
      .set("Authorization", "Bearer valid-token")
      .send({ orderId: ORDER_ID });

    expect(res.status).toBe(409);
  });

  it("Step 7: Invalid orderId format rejected", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);

    const res = await request(app)
      .post("/api/payments/net30")
      .set("Authorization", "Bearer valid-token")
      .send({ orderId: "bad-id" });

    expect(res.status).toBe(400);
  });
});
