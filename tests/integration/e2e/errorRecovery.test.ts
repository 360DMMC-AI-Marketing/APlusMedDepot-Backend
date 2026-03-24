import request from "supertest";
import type Stripe from "stripe";

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

// Stripe SDK mock
const mockPaymentIntentsCreate = jest.fn();
const mockPaymentIntentsRetrieve = jest.fn();
const mockPaymentIntentsCancel = jest.fn();
const mockRefundsCreate = jest.fn();
const mockConstructEvent = jest.fn();

jest.mock("../../../src/config/stripe", () => ({
  getStripe: () => ({
    paymentIntents: {
      create: mockPaymentIntentsCreate,
      retrieve: mockPaymentIntentsRetrieve,
      cancel: mockPaymentIntentsCancel,
    },
    refunds: {
      create: mockRefundsCreate,
    },
    webhooks: {
      constructEvent: mockConstructEvent,
    },
  }),
}));

jest.mock("../../../src/config/env", () => ({
  getEnv: () => ({
    STRIPE_WEBHOOK_SECRET: "whsec_test",
    STRIPE_WEBHOOK_TOLERANCE: 300,
  }),
}));

const mockFrom = jest.fn();

jest.mock("../../../src/config/supabase", () => ({
  supabaseAdmin: {
    from: mockFrom,
  },
}));

const mockOnPaymentSuccess = jest.fn().mockResolvedValue(undefined);
const mockOnPaymentRefunded = jest.fn().mockResolvedValue(undefined);

jest.mock("../../../src/services/hooks/paymentHooks", () => ({
  onPaymentSuccess: mockOnPaymentSuccess,
  onPaymentRefunded: mockOnPaymentRefunded,
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

// PayPal mock
const mockPayPalCreateOrder = jest.fn();
const mockPayPalCaptureOrder = jest.fn();

jest.mock("../../../src/services/paypal.service", () => ({
  PayPalService: {
    createOrder: mockPayPalCreateOrder,
    captureOrder: mockPayPalCaptureOrder,
  },
}));

// Net30 mock
const mockPlaceNet30Order = jest.fn();

jest.mock("../../../src/services/net30.service", () => ({
  Net30Service: {
    placeNet30Order: mockPlaceNet30Order,
  },
}));

jest.mock("../../../src/services/credit.service", () => ({
  CreditService: {
    getCreditInfo: jest.fn(),
  },
}));

jest.mock(
  "express-rate-limit",
  () => () => (_req: unknown, _res: unknown, next: () => void) => next(),
);

import app from "../../../src/index";
import { WebhookService } from "../../../src/services/webhook.service";

// ---------- Test data ----------

const customerUser = {
  id: "cust-err-001",
  email: "customer@example.com",
  firstName: "Jane",
  lastName: "Doe",
  companyName: null,
  phone: null,
  role: "customer" as const,
  status: "approved" as const,
  lastLogin: null,
};

const ORDER_ID = "c0000000-0000-4000-a000-000000000070";
const PI_ID = "pi_err_test";

// ---------- Helpers ----------

function mockUniversalChain(singleResult?: { data?: unknown; error?: unknown }) {
  const resolved = singleResult
    ? { data: singleResult.data ?? null, error: singleResult.error ?? null }
    : { data: null, error: null };

  const chain: Record<string, jest.Mock> = {};
  const self = () => chain;
  chain.select = jest.fn(self);
  chain.eq = jest.fn(self);
  chain.not = jest.fn(self);
  chain.order = jest.fn(self);
  chain.limit = jest.fn(self);
  chain.update = jest.fn(self);
  chain.insert = jest.fn().mockResolvedValue({ data: null, error: null });
  chain.single = jest.fn().mockResolvedValue(resolved);
  chain.then = jest
    .fn()
    .mockImplementation((resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(resolved).then(resolve, reject),
    );
  return chain;
}

function makeStripeEvent(type: string, dataObject: unknown, eventId = "evt_err_1"): Stripe.Event {
  return { id: eventId, type, data: { object: dataObject } } as unknown as Stripe.Event;
}

// ---------- Tests ----------

describe("Error Recovery Flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    WebhookService.clearProcessedEvents();
  });

  it("Step 1: Stripe payment failure — creates failed payment record", async () => {
    const pi = {
      id: PI_ID,
      amount: 11038,
      currency: "usd",
      metadata: { order_id: ORDER_ID },
      last_payment_error: { message: "Card declined" },
    };
    const event = makeStripeEvent("payment_intent.payment_failed", pi, "evt_fail_1");
    mockConstructEvent.mockReturnValue(event);

    const orderLookup = mockUniversalChain({
      data: { id: ORDER_ID, payment_status: "processing" },
    });
    const genericChain = mockUniversalChain();

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return orderLookup;
      return genericChain;
    });

    const res = await request(app)
      .post("/api/payments/webhook")
      .set("stripe-signature", "valid_sig")
      .set("Content-Type", "application/json")
      .send(Buffer.from(JSON.stringify(pi)));

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);
  });

  it("Step 2: Retry after failure — new PaymentIntent", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);

    // retryPayment does: 1. orders.select (lookup), 2. payments.select (attempt count),
    // 3. paymentIntents.cancel (old PI), 4. paymentIntents.create (new PI),
    // 5. orders.update (new PI id), 6. payments.insert (audit log)
    const orderLookup = mockUniversalChain({
      data: {
        id: ORDER_ID,
        customer_id: customerUser.id,
        status: "pending_payment",
        payment_status: "failed",
        payment_intent_id: PI_ID,
        total_amount: "110.38",
        order_number: "ORD-ERR-001",
      },
    });

    // Payments lookup returns 1 prior attempt (under limit of 3)
    const paymentsLookup = mockUniversalChain({ data: [{ id: "pay-1" }] });
    const genericChain = mockUniversalChain();

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return orderLookup; // order lookup
      if (callCount === 2) return paymentsLookup; // payment attempt count
      return genericChain; // order update + audit insert
    });

    mockPaymentIntentsCancel.mockResolvedValue({ id: PI_ID, status: "canceled" });
    mockPaymentIntentsCreate.mockResolvedValue({
      id: "pi_retry_1",
      client_secret: "pi_retry_1_secret",
    });

    const res = await request(app)
      .post("/api/payments/retry")
      .set("Authorization", "Bearer valid-token")
      .send({ orderId: ORDER_ID });

    expect(res.status).toBe(201);
    expect(res.body.paymentIntentId).toBe("pi_retry_1");
  });

  it("Step 3: PayPal create-order when order not awaiting payment — 409", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);

    const error = new Error("Payment already initiated via another method");
    Object.assign(error, { statusCode: 409, code: "CONFLICT" });
    mockPayPalCreateOrder.mockRejectedValue(error);

    const res = await request(app)
      .post("/api/payments/paypal/create-order")
      .set("Authorization", "Bearer valid-token")
      .send({ orderId: ORDER_ID });

    expect(res.status).toBe(409);
  });

  it("Step 4: Net30 when payment already initiated — 409", async () => {
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

  it("Step 5: Webhook idempotency — same event twice, no double processing", async () => {
    const pi = {
      id: PI_ID,
      amount: 11038,
      metadata: { order_id: ORDER_ID },
    };
    const event = makeStripeEvent("payment_intent.succeeded", pi, "evt_idem_001");
    mockConstructEvent.mockReturnValue(event);

    const orderLookup = mockUniversalChain({
      data: { id: ORDER_ID, payment_status: "processing" },
    });
    const genericChain = mockUniversalChain();

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return orderLookup;
      return genericChain;
    });

    // First call
    await request(app)
      .post("/api/payments/webhook")
      .set("stripe-signature", "valid_sig")
      .set("Content-Type", "application/json")
      .send(Buffer.from(JSON.stringify(pi)));

    // Second call — same event
    await request(app)
      .post("/api/payments/webhook")
      .set("stripe-signature", "valid_sig")
      .set("Content-Type", "application/json")
      .send(Buffer.from(JSON.stringify(pi)));

    // onPaymentSuccess called only once due to dedup
    expect(mockOnPaymentSuccess).toHaveBeenCalledTimes(1);
  });

  it("Step 6: Invalid webhook signature — 400", async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error("Webhook signature verification failed");
    });

    const res = await request(app)
      .post("/api/payments/webhook")
      .set("stripe-signature", "bad_sig")
      .set("Content-Type", "application/json")
      .send(Buffer.from("{}"));

    expect(res.status).toBe(400);
  });

  it("Step 7: Net30 with insufficient credit — 403 with details", async () => {
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

  it("Step 8: Stripe unreachable during payment creation", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);

    const orderLookup = mockUniversalChain({
      data: {
        id: ORDER_ID,
        customer_id: customerUser.id,
        status: "pending_payment",
        payment_status: "pending",
        payment_intent_id: null,
        total_amount: "110.38",
        order_number: "ORD-ERR-003",
      },
    });

    mockFrom.mockImplementation(() => orderLookup);
    mockPaymentIntentsCreate.mockRejectedValue(new Error("Stripe connection failed"));

    const res = await request(app)
      .post("/api/payments/intent")
      .set("Authorization", "Bearer valid-token")
      .send({ orderId: ORDER_ID });

    expect(res.status).toBe(500);
  });
});
