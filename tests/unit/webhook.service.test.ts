const mockFrom = jest.fn();

jest.mock("../../src/config/supabase", () => ({
  supabaseAdmin: {
    from: mockFrom,
  },
}));

const mockConstructEvent = jest.fn();

jest.mock("../../src/config/stripe", () => ({
  getStripe: () => ({
    webhooks: {
      constructEvent: mockConstructEvent,
    },
  }),
}));

jest.mock("../../src/config/env", () => ({
  getEnv: () => ({
    STRIPE_WEBHOOK_SECRET: "whsec_test_secret",
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
}));

jest.mock("../../src/utils/securityLogger", () => ({
  logSuspiciousActivity: jest.fn(),
  logWebhookVerificationFailure: jest.fn(),
  logWebhookProcessed: jest.fn(),
}));

import { WebhookService } from "../../src/services/webhook.service";
import type Stripe from "stripe";

const ORDER_ID = "order-uuid-1";
const PI_ID = "pi_test_123";
const EVENT_ID = "evt_test_123";

function makePaymentIntent(overrides: Record<string, unknown> = {}): Stripe.PaymentIntent {
  return {
    id: PI_ID,
    amount: 6493,
    currency: "usd",
    metadata: { order_id: ORDER_ID },
    payment_method_types: ["card"],
    last_payment_error: null,
    ...overrides,
  } as unknown as Stripe.PaymentIntent;
}

function makeEvent(
  type: string,
  dataObject: unknown,
  overrides: Record<string, unknown> = {},
): Stripe.Event {
  return {
    id: EVENT_ID,
    type,
    data: { object: dataObject },
    ...overrides,
  } as unknown as Stripe.Event;
}

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    customer_id: "customer-uuid-1",
    payment_status: "processing",
    order_number: "ORD-001",
    total_amount: "64.93",
    created_at: "2026-02-22T00:00:00Z",
    order_items: [],
    ...overrides,
  };
}

function mockSelectQuery(result: { data?: unknown; error?: unknown }) {
  const resolved = {
    data: result.data ?? null,
    error: result.error ?? null,
  };
  const chain: Record<string, jest.Mock> = {};
  const self = () => chain;
  chain.select = jest.fn(self);
  chain.eq = jest.fn(self);
  chain.single = jest.fn().mockResolvedValue(resolved);
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

beforeEach(() => {
  jest.clearAllMocks();
  WebhookService.clearProcessedEvents();
});

describe("WebhookService", () => {
  describe("constructEvent", () => {
    it("returns event on valid signature", () => {
      const fakeEvent = { id: "evt_1", type: "payment_intent.succeeded" };
      mockConstructEvent.mockReturnValue(fakeEvent);

      const result = WebhookService.constructEvent(Buffer.from("raw-body"), "sig_test");

      expect(result).toBe(fakeEvent);
      expect(mockConstructEvent).toHaveBeenCalledWith(
        Buffer.from("raw-body"),
        "sig_test",
        "whsec_test_secret",
        300,
      );
    });

    it("throws on invalid signature", () => {
      mockConstructEvent.mockImplementation(() => {
        throw new Error("Invalid signature");
      });

      expect(() => WebhookService.constructEvent(Buffer.from("bad"), "bad_sig")).toThrow(
        "Invalid signature",
      );
    });
  });

  describe("handlePaymentSuccess", () => {
    it("extracts metadata and updates order to paid", async () => {
      const pi = makePaymentIntent();
      const event = makeEvent("payment_intent.succeeded", pi);

      const selectChain = mockSelectQuery({ data: makeOrder() });
      const updateChain = mockUpdateQuery();
      const insertChain = mockInsertQuery();
      const userSelectChain = mockSelectQuery({ data: { email: "cust@test.com" } });

      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return selectChain; // order select
        if (callCount === 2) return updateChain; // order update
        if (callCount === 3) return insertChain; // payments insert
        return userSelectChain; // user select for email
      });

      await WebhookService.handlePaymentSuccess(event);

      expect(updateChain.update).toHaveBeenCalledWith({
        payment_status: "paid",
        status: "confirmed",
      });
    });

    it("is idempotent when order already paid", async () => {
      const pi = makePaymentIntent();
      const event = makeEvent("payment_intent.succeeded", pi);

      const selectChain = mockSelectQuery({
        data: makeOrder({ payment_status: "paid" }),
      });
      mockFrom.mockReturnValue(selectChain);

      await WebhookService.handlePaymentSuccess(event);

      // Only 1 call (the select) — no update/insert
      expect(mockFrom).toHaveBeenCalledTimes(1);
    });

    it("inserts payment record with correct amount", async () => {
      const pi = makePaymentIntent({ amount: 6493 });
      const event = makeEvent("payment_intent.succeeded", pi);

      const selectChain = mockSelectQuery({ data: makeOrder() });
      const updateChain = mockUpdateQuery();
      const insertChain = mockInsertQuery();
      const userSelectChain = mockSelectQuery({ data: { email: "cust@test.com" } });

      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return selectChain;
        if (callCount === 2) return updateChain;
        if (callCount === 3) return insertChain;
        return userSelectChain;
      });

      await WebhookService.handlePaymentSuccess(event);

      expect(mockFrom).toHaveBeenNthCalledWith(3, "payments");
      expect(insertChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          order_id: ORDER_ID,
          amount: 64.93,
          status: "succeeded",
          stripe_event_id: EVENT_ID,
        }),
      );
    });

    it("calls onPaymentSuccess hook", async () => {
      const pi = makePaymentIntent();
      const event = makeEvent("payment_intent.succeeded", pi);

      const selectChain = mockSelectQuery({ data: makeOrder() });
      const updateChain = mockUpdateQuery();
      const insertChain = mockInsertQuery();
      const userSelectChain = mockSelectQuery({ data: { email: "cust@test.com" } });

      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return selectChain;
        if (callCount === 2) return updateChain;
        if (callCount === 3) return insertChain;
        return userSelectChain;
      });

      await WebhookService.handlePaymentSuccess(event);

      expect(mockOnPaymentSuccess).toHaveBeenCalledWith(ORDER_ID);
    });

    it("returns early when metadata missing order_id", async () => {
      const pi = makePaymentIntent({ metadata: {} });
      const event = makeEvent("payment_intent.succeeded", pi);

      await WebhookService.handlePaymentSuccess(event);

      expect(mockFrom).not.toHaveBeenCalled();
    });

    it("returns early when order not found", async () => {
      const pi = makePaymentIntent();
      const event = makeEvent("payment_intent.succeeded", pi);

      const selectChain = mockSelectQuery({ data: null, error: { message: "not found" } });
      mockFrom.mockReturnValue(selectChain);

      await WebhookService.handlePaymentSuccess(event);

      // Only 1 call (the select) — no update
      expect(mockFrom).toHaveBeenCalledTimes(1);
    });
  });

  describe("handlePaymentFailure", () => {
    it("updates order to failed", async () => {
      const pi = makePaymentIntent({
        last_payment_error: { message: "Card declined" },
      });
      const event = makeEvent("payment_intent.payment_failed", pi);

      const updateChain = mockUpdateQuery();
      const insertChain = mockInsertQuery();

      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return updateChain;
        return insertChain;
      });

      await WebhookService.handlePaymentFailure(event);

      expect(updateChain.update).toHaveBeenCalledWith({ payment_status: "failed" });
    });

    it("does not overwrite paid status", async () => {
      const pi = makePaymentIntent();
      const event = makeEvent("payment_intent.payment_failed", pi);

      const updateChain = mockUpdateQuery();
      const insertChain = mockInsertQuery();

      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return updateChain;
        return insertChain;
      });

      await WebhookService.handlePaymentFailure(event);

      expect(updateChain.not).toHaveBeenCalledWith("payment_status", "in", '("paid","refunded")');
    });

    it("inserts payment record with failure reason", async () => {
      const pi = makePaymentIntent({
        last_payment_error: { message: "Card declined" },
      });
      const event = makeEvent("payment_intent.payment_failed", pi);

      const updateChain = mockUpdateQuery();
      const insertChain = mockInsertQuery();

      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return updateChain;
        return insertChain;
      });

      await WebhookService.handlePaymentFailure(event);

      expect(insertChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "failed",
          failure_reason: "Card declined",
        }),
      );
    });

    it("returns early when metadata missing order_id", async () => {
      const pi = makePaymentIntent({ metadata: {} });
      const event = makeEvent("payment_intent.payment_failed", pi);

      await WebhookService.handlePaymentFailure(event);

      expect(mockFrom).not.toHaveBeenCalled();
    });
  });

  describe("handleRefund", () => {
    it("sets full refund to refunded + cancelled and calls hook", async () => {
      const charge = {
        payment_intent: PI_ID,
        amount: 6493,
        amount_refunded: 6493,
      };
      const event = makeEvent("charge.refunded", charge);

      const selectChain = mockSelectQuery({
        data: { id: ORDER_ID, payment_status: "paid" },
      });
      const updateChain = mockUpdateQuery();

      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return selectChain;
        return updateChain;
      });

      await WebhookService.handleRefund(event);

      expect(updateChain.update).toHaveBeenCalledWith({
        payment_status: "refunded",
        status: "cancelled",
      });
      expect(mockOnPaymentRefunded).toHaveBeenCalledWith(ORDER_ID);
    });

    it("sets partial refund to partially_refunded", async () => {
      const charge = {
        payment_intent: PI_ID,
        amount: 6493,
        amount_refunded: 3000,
      };
      const event = makeEvent("charge.refunded", charge);

      const selectChain = mockSelectQuery({
        data: { id: ORDER_ID, payment_status: "paid" },
      });
      const updateChain = mockUpdateQuery();

      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return selectChain;
        return updateChain;
      });

      await WebhookService.handleRefund(event);

      expect(updateChain.update).toHaveBeenCalledWith({
        payment_status: "partially_refunded",
      });
      expect(mockOnPaymentRefunded).not.toHaveBeenCalled();
    });

    it("returns early when payment_intent missing", async () => {
      const charge = { payment_intent: null, amount: 6493, amount_refunded: 6493 };
      const event = makeEvent("charge.refunded", charge);

      await WebhookService.handleRefund(event);

      expect(mockFrom).not.toHaveBeenCalled();
    });

    it("returns early when order not found", async () => {
      const charge = { payment_intent: PI_ID, amount: 6493, amount_refunded: 6493 };
      const event = makeEvent("charge.refunded", charge);

      const selectChain = mockSelectQuery({ data: null, error: { message: "not found" } });
      mockFrom.mockReturnValue(selectChain);

      await WebhookService.handleRefund(event);

      expect(mockFrom).toHaveBeenCalledTimes(1);
      expect(mockOnPaymentRefunded).not.toHaveBeenCalled();
    });
  });

  describe("isDuplicate / event deduplication", () => {
    it("does not process the same event ID twice via handlePaymentSuccess", async () => {
      const pi = makePaymentIntent();
      const event = makeEvent("payment_intent.succeeded", pi);

      const selectChain = mockSelectQuery({ data: makeOrder() });
      const updateChain = mockUpdateQuery();
      const insertChain = mockInsertQuery();
      const userSelectChain = mockSelectQuery({ data: { email: "cust@test.com" } });

      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return selectChain;
        if (callCount === 2) return updateChain;
        if (callCount === 3) return insertChain;
        return userSelectChain;
      });

      await WebhookService.handlePaymentSuccess(event);
      expect(mockFrom).toHaveBeenCalled();

      mockFrom.mockClear();

      // Second call with same event ID should be skipped
      await WebhookService.handlePaymentSuccess(event);
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it("does not process the same event ID twice via handlePaymentFailure", async () => {
      const pi = makePaymentIntent();
      const event = makeEvent("payment_intent.payment_failed", pi);

      const updateChain = mockUpdateQuery();
      const insertChain = mockInsertQuery();

      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return updateChain;
        return insertChain;
      });

      await WebhookService.handlePaymentFailure(event);
      expect(mockFrom).toHaveBeenCalled();

      mockFrom.mockClear();

      await WebhookService.handlePaymentFailure(event);
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it("does not process the same event ID twice via handleRefund", async () => {
      const charge = { payment_intent: PI_ID, amount: 6493, amount_refunded: 6493 };
      const event = makeEvent("charge.refunded", charge);

      const selectChain = mockSelectQuery({
        data: { id: ORDER_ID, payment_status: "paid" },
      });
      const updateChain = mockUpdateQuery();

      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return selectChain;
        return updateChain;
      });

      await WebhookService.handleRefund(event);
      expect(mockFrom).toHaveBeenCalled();

      mockFrom.mockClear();

      await WebhookService.handleRefund(event);
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it("evicts oldest event when Set exceeds max size", () => {
      // Fill up to max
      for (let i = 0; i < 10_000; i++) {
        WebhookService.isDuplicate(`evt_${i}`);
      }
      expect(WebhookService.getProcessedEventsSize()).toBe(10_000);

      // Adding one more should evict the oldest
      WebhookService.isDuplicate("evt_new");
      expect(WebhookService.getProcessedEventsSize()).toBe(10_000);

      // The oldest (evt_0) should have been evicted
      expect(WebhookService.isDuplicate("evt_0")).toBe(false);
    });
  });
});
