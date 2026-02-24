const mockFrom = jest.fn();

jest.mock("../../src/config/supabase", () => ({
  supabaseAdmin: {
    from: mockFrom,
  },
}));

import { PaymentAuditService } from "../../src/services/paymentAudit.service";

const ORDER_ID = "order-uuid-1";
const PI_ID = "pi_test_123";

function mockInsertQuery() {
  const chain: Record<string, jest.Mock> = {};
  chain.insert = jest.fn().mockResolvedValue({ data: null, error: null });
  return chain;
}

function mockSelectListQuery(result: { data?: unknown; error?: unknown }) {
  const resolved = {
    data: result.data ?? null,
    error: result.error ?? null,
  };
  const chain: Record<string, jest.Mock> = {};
  const self = () => chain;
  chain.select = jest.fn(self);
  chain.eq = jest.fn(self);
  chain.order = jest.fn(self);
  chain.then = jest
    .fn()
    .mockImplementation((resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(resolved).then(resolve, reject),
    );
  return chain;
}

function mockSelectSingleQuery(result: { data?: unknown; error?: unknown }) {
  const resolved = {
    data: result.data ?? null,
    error: result.error ?? null,
  };
  const chain: Record<string, jest.Mock> = {};
  const self = () => chain;
  chain.select = jest.fn(self);
  chain.eq = jest.fn(self);
  chain.limit = jest.fn(self);
  chain.single = jest.fn().mockResolvedValue(resolved);
  return chain;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("PaymentAuditService", () => {
  describe("logPaymentEvent", () => {
    it("inserts correct data into payments table", async () => {
      const insertChain = mockInsertQuery();
      mockFrom.mockReturnValue(insertChain);

      await PaymentAuditService.logPaymentEvent({
        orderId: ORDER_ID,
        stripePaymentIntentId: PI_ID,
        amount: 64.93,
        currency: "usd",
        status: "succeeded",
        paymentMethod: "card",
        stripeEventId: "evt_123",
        metadata: { source: "webhook" },
      });

      expect(mockFrom).toHaveBeenCalledWith("payments");
      expect(insertChain.insert).toHaveBeenCalledWith({
        order_id: ORDER_ID,
        stripe_payment_intent_id: PI_ID,
        amount: 64.93,
        currency: "usd",
        status: "succeeded",
        payment_method: "card",
        failure_reason: undefined,
        stripe_event_id: "evt_123",
        metadata: { source: "webhook" },
      });
    });

    it("defaults currency to usd when not provided", async () => {
      const insertChain = mockInsertQuery();
      mockFrom.mockReturnValue(insertChain);

      await PaymentAuditService.logPaymentEvent({
        orderId: ORDER_ID,
        stripePaymentIntentId: PI_ID,
        amount: 10.0,
        status: "initiated",
      });

      expect(insertChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          currency: "usd",
          metadata: {},
        }),
      );
    });
  });

  describe("getPaymentHistory", () => {
    it("returns events in chronological order", async () => {
      const selectChain = mockSelectListQuery({
        data: [
          {
            id: "pay-1",
            order_id: ORDER_ID,
            stripe_payment_intent_id: PI_ID,
            amount: "64.93",
            currency: "usd",
            status: "initiated",
            stripe_charge_id: null,
            payment_method: null,
            failure_reason: null,
            stripe_event_id: null,
            paid_at: null,
            metadata: null,
            created_at: "2026-02-22T01:00:00Z",
          },
          {
            id: "pay-2",
            order_id: ORDER_ID,
            stripe_payment_intent_id: PI_ID,
            amount: "64.93",
            currency: "usd",
            status: "succeeded",
            stripe_charge_id: "ch_abc",
            payment_method: "card",
            failure_reason: null,
            stripe_event_id: "evt_123",
            paid_at: "2026-02-22T02:00:00Z",
            metadata: { source: "webhook" },
            created_at: "2026-02-22T02:00:00Z",
          },
        ],
      });
      mockFrom.mockReturnValue(selectChain);

      const result = await PaymentAuditService.getPaymentHistory(ORDER_ID);

      expect(mockFrom).toHaveBeenCalledWith("payments");
      expect(selectChain.eq).toHaveBeenCalledWith("order_id", ORDER_ID);
      expect(selectChain.order).toHaveBeenCalledWith("created_at", { ascending: true });

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: "pay-1",
        orderId: ORDER_ID,
        stripePaymentIntentId: PI_ID,
        amount: 64.93,
        currency: "usd",
        status: "initiated",
        stripeChargeId: null,
        paymentMethod: null,
        failureReason: null,
        stripeEventId: null,
        paidAt: null,
        metadata: null,
        createdAt: "2026-02-22T01:00:00Z",
      });
      expect(result[1].status).toBe("succeeded");
      expect(result[1].paymentMethod).toBe("card");
    });

    it("returns empty array for order with no payments", async () => {
      const selectChain = mockSelectListQuery({ data: [] });
      mockFrom.mockReturnValue(selectChain);

      const result = await PaymentAuditService.getPaymentHistory(ORDER_ID);

      expect(result).toEqual([]);
    });
  });

  describe("getPaymentByIntentId", () => {
    it("returns matching record", async () => {
      const selectChain = mockSelectSingleQuery({
        data: {
          id: "pay-1",
          order_id: ORDER_ID,
          stripe_payment_intent_id: PI_ID,
          amount: "64.93",
          currency: "usd",
          status: "succeeded",
          stripe_charge_id: null,
          payment_method: "card",
          failure_reason: null,
          stripe_event_id: "evt_123",
          paid_at: "2026-02-22T02:00:00Z",
          metadata: {},
          created_at: "2026-02-22T02:00:00Z",
        },
      });
      mockFrom.mockReturnValue(selectChain);

      const result = await PaymentAuditService.getPaymentByIntentId(PI_ID);

      expect(mockFrom).toHaveBeenCalledWith("payments");
      expect(selectChain.eq).toHaveBeenCalledWith("stripe_payment_intent_id", PI_ID);
      expect(result).not.toBeNull();
      expect(result!.id).toBe("pay-1");
      expect(result!.amount).toBe(64.93);
      expect(result!.stripePaymentIntentId).toBe(PI_ID);
      expect(result!.paymentMethod).toBe("card");
    });

    it("returns null for non-existent payment intent ID", async () => {
      const selectChain = mockSelectSingleQuery({
        data: null,
        error: { message: "not found" },
      });
      mockFrom.mockReturnValue(selectChain);

      const result = await PaymentAuditService.getPaymentByIntentId("pi_nonexistent");

      expect(result).toBeNull();
    });
  });
});
