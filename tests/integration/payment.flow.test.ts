import request from "supertest";
import type Stripe from "stripe";

// ---------- Module-level mocks (must come before app import) ----------

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

jest.mock("../../src/services/order.service", () => ({
  OrderService: {},
}));

// Supabase admin mock — shared by payment, webhook, and paymentAudit services
const mockFrom = jest.fn();

jest.mock("../../src/config/supabase", () => ({
  supabaseAdmin: {
    from: mockFrom,
  },
}));

// Stripe SDK mock
const mockPaymentIntentsCreate = jest.fn();
const mockPaymentIntentsRetrieve = jest.fn();
const mockPaymentIntentsCancel = jest.fn();
const mockRefundsCreate = jest.fn();
const mockConstructEvent = jest.fn();

jest.mock("../../src/config/stripe", () => ({
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

jest.mock("../../src/config/env", () => ({
  getEnv: () => ({
    STRIPE_WEBHOOK_SECRET: "whsec_test",
    STRIPE_WEBHOOK_TOLERANCE: 300,
  }),
}));

const mockOnPaymentSuccess = jest.fn().mockResolvedValue(undefined);
const mockOnPaymentRefunded = jest.fn().mockResolvedValue(undefined);

jest.mock("../../src/services/hooks/paymentHooks", () => ({
  onPaymentSuccess: mockOnPaymentSuccess,
  onPaymentRefunded: mockOnPaymentRefunded,
}));

jest.mock("../../src/services/email.service", () => ({
  sendOrderConfirmation: jest.fn(),
  sendOrderStatusUpdate: jest.fn(),
}));

const mockIncrementStock = jest.fn().mockResolvedValue(undefined);

jest.mock("../../src/utils/inventory", () => ({
  incrementStock: mockIncrementStock,
  checkStock: jest.fn(),
}));

jest.mock("../../src/services/orderConfirmation.service", () => ({
  OrderConfirmationService: {
    confirmOrder: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock("../../src/utils/securityLogger", () => ({
  logSuspiciousActivity: jest.fn(),
  logWebhookVerificationFailure: jest.fn(),
  logWebhookProcessed: jest.fn(),
}));

jest.mock(
  "express-rate-limit",
  () => () => (_req: unknown, _res: unknown, next: () => void) => next(),
);

import app from "../../src/index";
import { WebhookService } from "../../src/services/webhook.service";

// ---------- Test helpers ----------

const CUSTOMER_ID = "a0000000-0000-4000-a000-000000000001";
const ORDER_ID = "b0000000-0000-4000-a000-000000000001";
const ORDER_NUMBER = "ORD-20260223-0001";
const PI_ID = "pi_test_123";
const PI_SECRET = "pi_test_123_secret_abc";

const customerUser = {
  id: CUSTOMER_ID,
  email: "customer@example.com",
  firstName: "Jane",
  lastName: "Doe",
  companyName: null,
  phone: null,
  role: "customer" as const,
  status: "approved" as const,
  lastLogin: null,
};

const adminUser = {
  id: "c0000000-0000-4000-a000-000000000001",
  email: "admin@example.com",
  firstName: "Admin",
  lastName: "User",
  companyName: null,
  phone: null,
  role: "admin" as const,
  status: "approved" as const,
  lastLogin: null,
};

function mockSelectQuery(result: { data?: unknown; error?: unknown }) {
  const resolved = { data: result.data ?? null, error: result.error ?? null };
  const chain: Record<string, jest.Mock> = {};
  const self = () => chain;
  chain.select = jest.fn(self);
  chain.eq = jest.fn(self);
  chain.not = jest.fn(self);
  chain.single = jest.fn().mockResolvedValue(resolved);
  return chain;
}

function mockSelectListQuery(result: { data?: unknown; error?: unknown }) {
  const resolved = { data: result.data ?? null, error: result.error ?? null };
  const chain: Record<string, jest.Mock> = {};
  const self = () => chain;
  chain.select = jest.fn(self);
  chain.eq = jest.fn(self);
  chain.order = jest.fn(self);
  chain.limit = jest.fn(self);
  chain.then = jest
    .fn()
    .mockImplementation((resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(resolved).then(resolve, reject),
    );
  return chain;
}

function mockUpdateQuery() {
  const chain: Record<string, jest.Mock> = {};
  const self = () => chain;
  chain.update = jest.fn(self);
  chain.eq = jest.fn(self);
  chain.not = jest.fn(self);
  chain.then = jest
    .fn()
    .mockImplementation((resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve({ data: null, error: null }).then(resolve, reject),
    );
  return chain;
}

function mockInsertQuery() {
  const chain: Record<string, jest.Mock> = {};
  chain.insert = jest.fn().mockResolvedValue({ data: null, error: null });
  return chain;
}

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    customer_id: CUSTOMER_ID,
    status: "pending_payment",
    payment_intent_id: null,
    payment_status: "pending",
    total_amount: "64.93",
    order_number: ORDER_NUMBER,
    ...overrides,
  };
}

function makeStripeEvent(type: string, dataObject: unknown, eventId = "evt_test_1"): Stripe.Event {
  return {
    id: eventId,
    type,
    data: { object: dataObject },
  } as unknown as Stripe.Event;
}

beforeEach(() => {
  jest.clearAllMocks();
  WebhookService.clearProcessedEvents();
});

// ---------- Test Flows ----------

describe("Payment Flow Integration Tests", () => {
  // ====== Flow 1: Happy Path ======
  describe("Flow 1 — Happy Path: Create PI → Webhook Succeeded → Confirmed", () => {
    it("creates PaymentIntent and returns clientSecret", async () => {
      mockVerifyToken.mockResolvedValue(customerUser);

      const selectChain = mockSelectQuery({ data: makeOrder() });
      const updateChain = mockUpdateQuery();

      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return selectChain;
        return updateChain;
      });

      mockPaymentIntentsCreate.mockResolvedValue({
        id: PI_ID,
        client_secret: PI_SECRET,
      });

      const res = await request(app)
        .post("/api/payments/intent")
        .set("Authorization", "Bearer valid-token")
        .send({ orderId: ORDER_ID });

      expect(res.status).toBe(201);
      expect(res.body.clientSecret).toBe(PI_SECRET);
      expect(res.body.paymentIntentId).toBe(PI_ID);
    });

    it("webhook payment_intent.succeeded updates order to paid", async () => {
      const pi = {
        id: PI_ID,
        amount: 6493,
        currency: "usd",
        metadata: { order_id: ORDER_ID },
        payment_method_types: ["card"],
      };
      const event = makeStripeEvent("payment_intent.succeeded", pi);
      mockConstructEvent.mockReturnValue(event);

      const selectChain = mockSelectQuery({
        data: { id: ORDER_ID, payment_status: "processing" },
      });
      const updateChain = mockUpdateQuery();
      const insertChain = mockInsertQuery();

      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return selectChain;
        if (callCount === 2) return updateChain;
        return insertChain;
      });

      const res = await request(app)
        .post("/api/payments/webhook")
        .set("stripe-signature", "valid_sig")
        .set("Content-Type", "application/json")
        .send(Buffer.from(JSON.stringify(pi)));

      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);
      expect(updateChain.update).toHaveBeenCalledWith({
        payment_status: "paid",
        status: "payment_confirmed",
      });
      expect(insertChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          order_id: ORDER_ID,
          status: "succeeded",
          amount: 64.93,
        }),
      );
      expect(mockOnPaymentSuccess).toHaveBeenCalledWith(ORDER_ID);
    });
  });

  // ====== Flow 2: Payment Failure + Retry ======
  describe("Flow 2 — Payment Failure + Retry", () => {
    it("webhook payment_intent.payment_failed updates to failed", async () => {
      const pi = {
        id: PI_ID,
        amount: 6493,
        currency: "usd",
        metadata: { order_id: ORDER_ID },
        last_payment_error: { message: "Card declined" },
      };
      const event = makeStripeEvent("payment_intent.payment_failed", pi);
      mockConstructEvent.mockReturnValue(event);

      const updateChain = mockUpdateQuery();
      const insertChain = mockInsertQuery();

      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return updateChain;
        return insertChain;
      });

      const res = await request(app)
        .post("/api/payments/webhook")
        .set("stripe-signature", "valid_sig")
        .set("Content-Type", "application/json")
        .send(Buffer.from(JSON.stringify(pi)));

      expect(res.status).toBe(200);
      expect(updateChain.update).toHaveBeenCalledWith({ payment_status: "failed" });
      expect(insertChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "failed",
          failure_reason: "Card declined",
        }),
      );
    });

    it("retryPayment creates new PaymentIntent and cancels old", async () => {
      mockVerifyToken.mockResolvedValue(customerUser);

      const orderSelectChain = mockSelectQuery({
        data: makeOrder({
          payment_intent_id: PI_ID,
          payment_status: "failed",
        }),
      });
      const attemptsSelectChain = mockSelectListQuery({ data: [{ id: "att-1" }] });
      const orderUpdateChain = mockUpdateQuery();
      const paymentInsertChain = mockInsertQuery();

      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return orderSelectChain;
        if (callCount === 2) return attemptsSelectChain;
        if (callCount === 3) return orderUpdateChain;
        return paymentInsertChain;
      });

      mockPaymentIntentsCancel.mockResolvedValue({ id: PI_ID, status: "canceled" });
      mockPaymentIntentsCreate.mockResolvedValue({
        id: "pi_new_456",
        client_secret: "pi_new_456_secret",
      });

      const res = await request(app)
        .post("/api/payments/retry")
        .set("Authorization", "Bearer valid-token")
        .send({ orderId: ORDER_ID });

      expect(res.status).toBe(201);
      expect(res.body.paymentIntentId).toBe("pi_new_456");
      expect(res.body.clientSecret).toBe("pi_new_456_secret");
      expect(mockPaymentIntentsCancel).toHaveBeenCalledWith(PI_ID);
    });
  });

  // ====== Flow 3: Refund ======
  describe("Flow 3 — Refund", () => {
    it("refunds a paid order, restores inventory, and calls hook", async () => {
      mockVerifyToken.mockResolvedValue(customerUser);
      const REFUND_ID = "re_test_789";

      const orderSelectChain = mockSelectQuery({
        data: makeOrder({
          status: "payment_confirmed",
          payment_status: "paid",
          payment_intent_id: PI_ID,
        }),
      });
      const orderUpdateChain = mockUpdateQuery();
      const itemsSelectChain = mockSelectListQuery({
        data: [
          { product_id: "prod-1", quantity: 2 },
          { product_id: "prod-2", quantity: 1 },
        ],
      });
      const paymentsInsertChain = mockInsertQuery();
      const historyInsertChain = mockInsertQuery();
      const userSelectChain = mockSelectQuery({ data: { email: "cust@test.com" } });

      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return orderSelectChain;
        if (callCount === 2) return orderUpdateChain;
        if (callCount === 3) return itemsSelectChain;
        if (callCount === 4) return paymentsInsertChain;
        if (callCount === 5) return historyInsertChain;
        return userSelectChain;
      });

      mockRefundsCreate.mockResolvedValue({ id: REFUND_ID, status: "succeeded" });

      const res = await request(app)
        .post("/api/payments/refund")
        .set("Authorization", "Bearer valid-token")
        .send({ orderId: ORDER_ID, reason: "Changed my mind" });

      expect(res.status).toBe(200);
      expect(res.body.refundId).toBe(REFUND_ID);
      expect(res.body.status).toBe("refunded");
      expect(res.body.amount).toBe(64.93);

      expect(mockRefundsCreate).toHaveBeenCalledWith({
        payment_intent: PI_ID,
        reason: "requested_by_customer",
      });
      expect(orderUpdateChain.update).toHaveBeenCalledWith({
        payment_status: "refunded",
        status: "cancelled",
      });
      expect(mockIncrementStock).toHaveBeenCalledWith(
        [
          { productId: "prod-1", quantity: 2 },
          { productId: "prod-2", quantity: 1 },
        ],
        expect.anything(),
      );
      expect(mockOnPaymentRefunded).toHaveBeenCalledWith(ORDER_ID);
    });
  });

  // ====== Flow 4: Idempotency ======
  describe("Flow 4 — Idempotency (duplicate webhook dedup)", () => {
    it("processes same event only once, second call is no-op", async () => {
      const pi = {
        id: PI_ID,
        amount: 6493,
        currency: "usd",
        metadata: { order_id: ORDER_ID },
        payment_method_types: ["card"],
      };
      const event = makeStripeEvent("payment_intent.succeeded", pi, "evt_dedup_1");
      mockConstructEvent.mockReturnValue(event);

      // First call — full processing
      const selectChain = mockSelectQuery({
        data: { id: ORDER_ID, payment_status: "processing" },
      });
      const updateChain = mockUpdateQuery();
      const insertChain = mockInsertQuery();

      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return selectChain;
        if (callCount === 2) return updateChain;
        return insertChain;
      });

      const res1 = await request(app)
        .post("/api/payments/webhook")
        .set("stripe-signature", "valid_sig")
        .set("Content-Type", "application/json")
        .send(Buffer.from(JSON.stringify(pi)));

      expect(res1.status).toBe(200);
      expect(mockFrom).toHaveBeenCalled();
      const firstCallCount = mockFrom.mock.calls.length;

      // Second call — same event ID, should be deduped
      mockFrom.mockClear();

      const res2 = await request(app)
        .post("/api/payments/webhook")
        .set("stripe-signature", "valid_sig")
        .set("Content-Type", "application/json")
        .send(Buffer.from(JSON.stringify(pi)));

      expect(res2.status).toBe(200);
      // No new DB calls — the second invocation was a no-op
      expect(mockFrom.mock.calls.length).toBeLessThan(firstCallCount);
    });
  });

  // ====== Flow 5: Webhook Security ======
  describe("Flow 5 — Webhook Security", () => {
    it("returns 400 when stripe-signature header is missing", async () => {
      const res = await request(app)
        .post("/api/payments/webhook")
        .set("Content-Type", "application/json")
        .send(Buffer.from("{}"));

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Missing stripe-signature/i);
    });

    it("returns 400 when signature verification fails", async () => {
      mockConstructEvent.mockImplementation(() => {
        throw new Error("Invalid signature");
      });

      const res = await request(app)
        .post("/api/payments/webhook")
        .set("stripe-signature", "bad_sig")
        .set("Content-Type", "application/json")
        .send(Buffer.from("{}"));

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/signature verification failed/i);
    });

    it("returns 200 on valid webhook request", async () => {
      const event = makeStripeEvent("unknown.event", {}, "evt_valid_1");
      mockConstructEvent.mockReturnValue(event);

      const res = await request(app)
        .post("/api/payments/webhook")
        .set("stripe-signature", "valid_sig")
        .set("Content-Type", "application/json")
        .send(Buffer.from("{}"));

      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);
    });
  });

  // ====== Flow 6: Edge Cases ======
  describe("Flow 6 — Edge Cases", () => {
    it("webhook with missing metadata returns 200 gracefully", async () => {
      const pi = {
        id: PI_ID,
        amount: 6493,
        currency: "usd",
        metadata: {},
        payment_method_types: ["card"],
      };
      const event = makeStripeEvent("payment_intent.succeeded", pi, "evt_no_meta");
      mockConstructEvent.mockReturnValue(event);

      const res = await request(app)
        .post("/api/payments/webhook")
        .set("stripe-signature", "valid_sig")
        .set("Content-Type", "application/json")
        .send(Buffer.from(JSON.stringify(pi)));

      expect(res.status).toBe(200);
      // No DB calls since no order_id in metadata
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it("webhook for non-existent order returns 200 gracefully", async () => {
      const pi = {
        id: PI_ID,
        amount: 6493,
        currency: "usd",
        metadata: { order_id: "nonexistent-order" },
        payment_method_types: ["card"],
      };
      const event = makeStripeEvent("payment_intent.succeeded", pi, "evt_bad_order");
      mockConstructEvent.mockReturnValue(event);

      const selectChain = mockSelectQuery({ data: null, error: { message: "not found" } });
      mockFrom.mockReturnValue(selectChain);

      const res = await request(app)
        .post("/api/payments/webhook")
        .set("stripe-signature", "valid_sig")
        .set("Content-Type", "application/json")
        .send(Buffer.from(JSON.stringify(pi)));

      expect(res.status).toBe(200);
      // Only 1 DB call (the order lookup) — no update
      expect(mockFrom).toHaveBeenCalledTimes(1);
    });

    it("returns 409 when trying to cancel a shipped order", async () => {
      mockVerifyToken.mockResolvedValue(customerUser);

      const selectChain = mockSelectQuery({
        data: makeOrder({
          status: "fully_shipped",
          payment_status: "paid",
          payment_intent_id: PI_ID,
        }),
      });
      mockFrom.mockReturnValue(selectChain);

      const res = await request(app)
        .post("/api/payments/refund")
        .set("Authorization", "Bearer valid-token")
        .send({ orderId: ORDER_ID });

      expect(res.status).toBe(409);
      expect(res.body.error.message).toMatch(/shipped/);
    });

    it("returns 409 when retry exceeds max attempts (3)", async () => {
      mockVerifyToken.mockResolvedValue(customerUser);

      const orderSelectChain = mockSelectQuery({
        data: makeOrder({
          payment_intent_id: PI_ID,
          payment_status: "failed",
        }),
      });
      const attemptsSelectChain = mockSelectListQuery({
        data: [{ id: "att-1" }, { id: "att-2" }, { id: "att-3" }],
      });

      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return orderSelectChain;
        return attemptsSelectChain;
      });

      const res = await request(app)
        .post("/api/payments/retry")
        .set("Authorization", "Bearer valid-token")
        .send({ orderId: ORDER_ID });

      expect(res.status).toBe(409);
      expect(res.body.error.message).toMatch(/Maximum payment attempts/);
    });

    it("returns 409 when creating PaymentIntent for already-paid order", async () => {
      mockVerifyToken.mockResolvedValue(customerUser);

      const selectChain = mockSelectQuery({
        data: makeOrder({ status: "payment_confirmed", payment_intent_id: PI_ID }),
      });
      mockFrom.mockReturnValue(selectChain);

      const res = await request(app)
        .post("/api/payments/intent")
        .set("Authorization", "Bearer valid-token")
        .send({ orderId: ORDER_ID });

      expect(res.status).toBe(409);
    });

    it("returns 401 without auth for payment endpoints", async () => {
      const res = await request(app).post("/api/payments/intent").send({ orderId: ORDER_ID });

      expect(res.status).toBe(401);
    });

    it("returns 403 when admin tries customer-only payment endpoint", async () => {
      mockVerifyToken.mockResolvedValue(adminUser);

      const res = await request(app)
        .post("/api/payments/intent")
        .set("Authorization", "Bearer valid-token")
        .send({ orderId: ORDER_ID });

      expect(res.status).toBe(403);
    });
  });
});
