const mockFrom = jest.fn();

jest.mock("../../src/config/supabase", () => ({
  supabaseAdmin: {
    from: mockFrom,
  },
}));

jest.mock("../../src/config/stripe", () => ({
  getStripe: () => ({
    webhooks: { constructEvent: jest.fn() },
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

const mockConfirmOrder = jest.fn().mockResolvedValue(undefined);

jest.mock("../../src/services/orderConfirmation.service", () => ({
  OrderConfirmationService: {
    confirmOrder: mockConfirmOrder,
  },
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

function makeEvent(type: string, dataObject: unknown, id = "evt_unique_1"): Stripe.Event {
  return { id, type, data: { object: dataObject } } as unknown as Stripe.Event;
}

function mockSelectQuery(result: { data?: unknown; error?: unknown }) {
  const resolved = { data: result.data ?? null, error: result.error ?? null };
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

describe("Webhook edge cases", () => {
  describe("handlePaymentSuccess — confirmOrder failure", () => {
    it("succeeds even when confirmOrder throws", async () => {
      const pi = {
        id: PI_ID,
        amount: 6493,
        currency: "usd",
        metadata: { order_id: ORDER_ID },
        payment_method_types: ["card"],
      };
      const event = makeEvent("payment_intent.succeeded", pi, "evt_confirm_fail");

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

      mockConfirmOrder.mockRejectedValueOnce(new Error("Confirmation email failed"));
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();

      // Should not throw — confirmOrder failure is caught
      await WebhookService.handlePaymentSuccess(event);

      expect(mockOnPaymentSuccess).toHaveBeenCalledWith(ORDER_ID);
      expect(mockConfirmOrder).toHaveBeenCalledWith(ORDER_ID);
      // Event should still be marked as processed
      expect(WebhookService.isDuplicate("evt_confirm_fail")).toBe(true);

      consoleSpy.mockRestore();
    });
  });

  describe("handlePaymentFailure — null last_payment_error", () => {
    it("uses 'Unknown payment failure' when last_payment_error is null", async () => {
      const pi = {
        id: PI_ID,
        amount: 6493,
        currency: "usd",
        metadata: { order_id: ORDER_ID },
        payment_method_types: ["card"],
        last_payment_error: null,
      };
      const event = makeEvent("payment_intent.payment_failed", pi, "evt_null_err");

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
          failure_reason: "Unknown payment failure",
        }),
      );
    });
  });

  describe("handleRefund — payment_intent as object", () => {
    it("extracts id from payment_intent object (not string)", async () => {
      const charge = {
        payment_intent: { id: PI_ID, object: "payment_intent" },
        amount: 6493,
        amount_refunded: 6493,
      };
      const event = makeEvent("charge.refunded", charge, "evt_pi_obj");

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

      expect(selectChain.eq).toHaveBeenCalledWith("payment_intent_id", PI_ID);
      expect(mockOnPaymentRefunded).toHaveBeenCalledWith(ORDER_ID);
    });
  });

  describe("handleRefund — payment_intent is undefined", () => {
    it("returns early when charge.payment_intent is undefined", async () => {
      const charge = {
        payment_intent: undefined,
        amount: 6493,
        amount_refunded: 6493,
      };
      const event = makeEvent("charge.refunded", charge, "evt_no_pi");

      const consoleSpy = jest.spyOn(console, "warn").mockImplementation();

      await WebhookService.handleRefund(event);

      expect(mockFrom).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe("handlePaymentSuccess — missing payment_method_types", () => {
    it("falls back to 'card' when payment_method_types is empty", async () => {
      const pi = {
        id: PI_ID,
        amount: 1000,
        currency: "usd",
        metadata: { order_id: ORDER_ID },
        payment_method_types: [],
      };
      const event = makeEvent("payment_intent.succeeded", pi, "evt_no_method");

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

      await WebhookService.handlePaymentSuccess(event);

      // payment_method_types[0] is undefined, so should use "card" fallback
      expect(insertChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          payment_method: "card",
        }),
      );
    });
  });
});
