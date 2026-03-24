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

jest.mock(
  "express-rate-limit",
  () => () => (_req: unknown, _res: unknown, next: () => void) => next(),
);

import app from "../../../src/index";
import { WebhookService } from "../../../src/services/webhook.service";

// ---------- Test data ----------

const customerUser = {
  id: "cust-refund-001",
  email: "customer@example.com",
  firstName: "Jane",
  lastName: "Doe",
  companyName: null,
  phone: null,
  role: "customer" as const,
  status: "approved" as const,
  lastLogin: null,
};

const ORDER_ID = "c0000000-0000-4000-a000-000000000050";
const PI_ID = "pi_refund_test";

// ---------- Helpers ----------

/**
 * Creates a universal Supabase chain mock that handles any query pattern:
 * from().select().eq().single(), from().update().eq(), from().insert(), etc.
 */
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

function makeStripeEvent(
  type: string,
  dataObject: unknown,
  eventId = "evt_refund_1",
): Stripe.Event {
  return { id: eventId, type, data: { object: dataObject } } as unknown as Stripe.Event;
}

// ---------- Tests ----------

describe("Refund and Cancellation Flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    WebhookService.clearProcessedEvents();
  });

  it("Step 1: Customer requests refund on paid order", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);

    // refundPayment does ~6 from() calls:
    // 1. orders.select.eq.single (order lookup)
    // 2. orders.update.eq (set cancelled/refunded)
    // 3. order_items.select.eq (for stock restore)
    // 4. payments.insert (audit log)
    // 5. order_status_history.insert
    // 6. users.select.eq.single (email lookup)
    const orderLookup = mockUniversalChain({
      data: {
        id: ORDER_ID,
        customer_id: customerUser.id,
        status: "confirmed",
        payment_status: "paid",
        payment_intent_id: PI_ID,
        total_amount: "110.38",
        order_number: "ORD-20260312-REF1",
      },
    });

    const orderItemsLookup = mockUniversalChain({
      data: [
        { product_id: "prod-1", quantity: 2 },
        { product_id: "prod-2", quantity: 1 },
      ],
    });

    const userLookup = mockUniversalChain({
      data: { email: "customer@example.com" },
    });

    const genericChain = mockUniversalChain();

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return orderLookup; // order lookup
      if (callCount === 2) return genericChain; // order update
      if (callCount === 3) return orderItemsLookup; // order_items lookup
      if (callCount === 4) return genericChain; // payment audit insert
      if (callCount === 5) return genericChain; // status_history insert
      return userLookup; // user email lookup
    });

    mockRefundsCreate.mockResolvedValue({
      id: "re_test_123",
      amount: 11038,
      status: "succeeded",
    });

    const res = await request(app)
      .post("/api/payments/refund")
      .set("Authorization", "Bearer valid-token")
      .send({ orderId: ORDER_ID });

    expect(res.status).toBe(200);
    expect(mockRefundsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_intent: PI_ID,
      }),
    );
  });

  it("Step 2: Webhook — charge.refunded triggers commission reversal", async () => {
    // charge.refunded uses Stripe.Charge shape with payment_intent, amount, amount_refunded
    const charge = {
      id: "ch_test_123",
      payment_intent: PI_ID,
      amount: 11038,
      amount_refunded: 11038, // full refund
    };
    const event = makeStripeEvent("charge.refunded", charge);
    mockConstructEvent.mockReturnValue(event);

    // handleRefund: 1. orders.select.eq(payment_intent_id).single, 2. orders.update.eq
    const orderLookup = mockUniversalChain({
      data: { id: ORDER_ID, payment_status: "paid" },
    });
    const updateChain = mockUniversalChain();

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return orderLookup;
      return updateChain;
    });

    const res = await request(app)
      .post("/api/payments/webhook")
      .set("stripe-signature", "valid_sig")
      .set("Content-Type", "application/json")
      .send(Buffer.from(JSON.stringify(charge)));

    expect(res.status).toBe(200);
    expect(mockOnPaymentRefunded).toHaveBeenCalledWith(ORDER_ID);
  });

  it("Step 3: Refund on already refunded order — 409", async () => {
    mockVerifyToken.mockResolvedValue(customerUser);

    const orderLookup = mockUniversalChain({
      data: {
        id: ORDER_ID,
        customer_id: customerUser.id,
        status: "cancelled",
        payment_status: "refunded",
        payment_intent_id: PI_ID,
        total_amount: "110.38",
        order_number: "ORD-REF2",
      },
    });

    mockFrom.mockImplementation(() => orderLookup);

    const res = await request(app)
      .post("/api/payments/refund")
      .set("Authorization", "Bearer valid-token")
      .send({ orderId: ORDER_ID });

    // Should reject — order is already cancelled/refunded
    expect([400, 409]).toContain(res.status);
  });

  it("Step 4: Invalid webhook signature — 400", async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error("Invalid signature");
    });

    const res = await request(app)
      .post("/api/payments/webhook")
      .set("stripe-signature", "invalid_sig")
      .set("Content-Type", "application/json")
      .send(Buffer.from("{}"));

    expect(res.status).toBe(400);
  });

  it("Step 5: Duplicate webhook event — idempotent", async () => {
    const pi = {
      id: PI_ID,
      amount: 11038,
      metadata: { order_id: ORDER_ID },
    };
    const event = makeStripeEvent("payment_intent.succeeded", pi, "evt_dup_001");
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

    // First call succeeds
    const res1 = await request(app)
      .post("/api/payments/webhook")
      .set("stripe-signature", "valid_sig")
      .set("Content-Type", "application/json")
      .send(Buffer.from(JSON.stringify(pi)));

    expect(res1.status).toBe(200);

    // Second call with same event — should be deduplicated
    const res2 = await request(app)
      .post("/api/payments/webhook")
      .set("stripe-signature", "valid_sig")
      .set("Content-Type", "application/json")
      .send(Buffer.from(JSON.stringify(pi)));

    expect(res2.status).toBe(200);
    // onPaymentSuccess should only be called once (dedup)
    expect(mockOnPaymentSuccess).toHaveBeenCalledTimes(1);
  });

  it("Step 6: Unauthenticated refund request — 401", async () => {
    const res = await request(app).post("/api/payments/refund").send({ orderId: ORDER_ID });

    expect(res.status).toBe(401);
  });
});
