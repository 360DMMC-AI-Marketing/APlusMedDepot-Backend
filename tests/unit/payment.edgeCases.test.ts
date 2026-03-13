const mockFrom = jest.fn();

jest.mock("../../src/config/supabase", () => ({
  supabaseAdmin: {
    from: mockFrom,
  },
}));

const mockPaymentIntentsCreate = jest.fn();
const mockPaymentIntentsRetrieve = jest.fn();
const mockPaymentIntentsCancel = jest.fn();
const mockRefundsCreate = jest.fn();

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
  }),
}));

jest.mock("../../src/services/hooks/paymentHooks", () => ({
  onPaymentSuccess: jest.fn().mockResolvedValue(undefined),
  onPaymentRefunded: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../src/services/email.service", () => ({
  sendOrderConfirmation: jest.fn(),
  sendOrderStatusUpdate: jest.fn(),
}));

jest.mock("../../src/utils/inventory", () => ({
  incrementStock: jest.fn().mockResolvedValue(undefined),
}));

import { PaymentService } from "../../src/services/payment.service";

const CUSTOMER_ID = "customer-uuid-1";
const ORDER_ID = "order-uuid-1";

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
  chain.then = jest
    .fn()
    .mockImplementation((resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve({ data: null, error: null }).then(resolve, reject),
    );
  return chain;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("PaymentService edge cases", () => {
  describe("createPaymentIntent — Stripe unreachable", () => {
    it("throws when Stripe API is unreachable (network error)", async () => {
      const selectChain = mockSelectQuery({
        data: {
          id: ORDER_ID,
          customer_id: CUSTOMER_ID,
          status: "pending_payment",
          payment_intent_id: null,
          total_amount: "100.00",
          order_number: "ORD-001",
        },
      });
      mockFrom.mockReturnValue(selectChain);

      mockPaymentIntentsCreate.mockRejectedValue(new Error("connect ECONNREFUSED"));

      await expect(PaymentService.createPaymentIntent(ORDER_ID, CUSTOMER_ID)).rejects.toThrow(
        "connect ECONNREFUSED",
      );
    });

    it("throws when Stripe API times out", async () => {
      const selectChain = mockSelectQuery({
        data: {
          id: ORDER_ID,
          customer_id: CUSTOMER_ID,
          status: "pending_payment",
          payment_intent_id: null,
          total_amount: "100.00",
          order_number: "ORD-001",
        },
      });
      mockFrom.mockReturnValue(selectChain);

      mockPaymentIntentsCreate.mockRejectedValue(new Error("Request timeout"));

      await expect(PaymentService.createPaymentIntent(ORDER_ID, CUSTOMER_ID)).rejects.toThrow(
        "Request timeout",
      );
    });
  });

  describe("confirmPayment — Stripe retrieve throws", () => {
    it("throws when paymentIntents.retrieve fails", async () => {
      const selectChain = mockSelectQuery({
        data: {
          id: ORDER_ID,
          customer_id: CUSTOMER_ID,
          status: "pending_payment",
          payment_intent_id: "pi_123",
          payment_status: "processing",
          total_amount: "100.00",
          order_number: "ORD-001",
          created_at: "2026-01-01",
          shipping_address: null,
          order_items: [],
        },
      });
      mockFrom.mockReturnValue(selectChain);

      mockPaymentIntentsRetrieve.mockRejectedValue(
        new Error("Stripe: No such payment_intent: pi_123"),
      );

      await expect(PaymentService.confirmPayment(ORDER_ID, CUSTOMER_ID)).rejects.toThrow(
        "No such payment_intent",
      );
    });
  });

  describe("confirmPayment — unknown Stripe status", () => {
    it("returns the raw status when it is not succeeded/processing/canceled", async () => {
      const selectChain = mockSelectQuery({
        data: {
          id: ORDER_ID,
          customer_id: CUSTOMER_ID,
          status: "pending_payment",
          payment_intent_id: "pi_123",
          payment_status: "processing",
          total_amount: "100.00",
          order_number: "ORD-001",
          created_at: "2026-01-01",
          shipping_address: null,
          order_items: [],
        },
      });
      mockFrom.mockReturnValue(selectChain);

      mockPaymentIntentsRetrieve.mockResolvedValue({ status: "requires_action" });

      const result = await PaymentService.confirmPayment(ORDER_ID, CUSTOMER_ID);

      expect(result.status).toBe("requires_action");
      expect(result.paidAt).toBe("");
    });
  });

  describe("refundPayment — non-refundable statuses", () => {
    const refundableOrder = {
      id: ORDER_ID,
      customer_id: CUSTOMER_ID,
      status: "payment_confirmed",
      payment_status: "paid",
      payment_intent_id: "pi_123",
      total_amount: "100.00",
      order_number: "ORD-001",
    };

    it("throws CONFLICT for partially_shipped orders", async () => {
      const selectChain = mockSelectQuery({
        data: { ...refundableOrder, status: "partially_shipped" },
      });
      mockFrom.mockReturnValue(selectChain);

      await expect(PaymentService.refundPayment(ORDER_ID, CUSTOMER_ID)).rejects.toMatchObject({
        statusCode: 409,
        message: "Cannot refund an order with status 'partially_shipped'",
      });
    });

    it("throws CONFLICT for delivered orders", async () => {
      const selectChain = mockSelectQuery({
        data: { ...refundableOrder, status: "delivered" },
      });
      mockFrom.mockReturnValue(selectChain);

      await expect(PaymentService.refundPayment(ORDER_ID, CUSTOMER_ID)).rejects.toMatchObject({
        statusCode: 409,
        message: "Cannot refund an order with status 'delivered'",
      });
    });

    it("throws CONFLICT for cancelled orders", async () => {
      const selectChain = mockSelectQuery({
        data: { ...refundableOrder, status: "cancelled" },
      });
      mockFrom.mockReturnValue(selectChain);

      await expect(PaymentService.refundPayment(ORDER_ID, CUSTOMER_ID)).rejects.toMatchObject({
        statusCode: 409,
        message: "Cannot refund an order with status 'cancelled'",
      });
    });

    it("throws BAD_REQUEST when no payment_intent_id on paid order", async () => {
      const selectChain = mockSelectQuery({
        data: { ...refundableOrder, payment_intent_id: null },
      });
      mockFrom.mockReturnValue(selectChain);

      await expect(PaymentService.refundPayment(ORDER_ID, CUSTOMER_ID)).rejects.toMatchObject({
        statusCode: 400,
        message: "No payment intent associated with this order",
      });
    });
  });

  describe("retryPayment — edge cases", () => {
    it("throws CONFLICT when payment_status is refunded", async () => {
      const selectChain = mockSelectQuery({
        data: {
          id: ORDER_ID,
          customer_id: CUSTOMER_ID,
          status: "cancelled",
          payment_intent_id: null,
          total_amount: "100.00",
          order_number: "ORD-001",
          payment_status: "refunded",
        },
      });
      mockFrom.mockReturnValue(selectChain);

      await expect(PaymentService.retryPayment(ORDER_ID, CUSTOMER_ID)).rejects.toMatchObject({
        statusCode: 409,
        message: "Order has been refunded",
      });
    });

    it("throws CONFLICT when payment_status is processing", async () => {
      const selectChain = mockSelectQuery({
        data: {
          id: ORDER_ID,
          customer_id: CUSTOMER_ID,
          status: "pending_payment",
          payment_intent_id: "pi_123",
          total_amount: "100.00",
          order_number: "ORD-001",
          payment_status: "processing",
        },
      });
      mockFrom.mockReturnValue(selectChain);

      await expect(PaymentService.retryPayment(ORDER_ID, CUSTOMER_ID)).rejects.toMatchObject({
        statusCode: 409,
        message: "Order is not eligible for payment retry",
      });
    });

    it("skips cancel when no existing payment_intent_id", async () => {
      const orderSelectChain = mockSelectQuery({
        data: {
          id: ORDER_ID,
          customer_id: CUSTOMER_ID,
          status: "pending_payment",
          payment_intent_id: null,
          total_amount: "50.00",
          order_number: "ORD-001",
          payment_status: "pending",
        },
      });

      function mockSelectListQuery(result: { data?: unknown }) {
        const resolved = { data: result.data ?? null, error: null };
        const chain: Record<string, jest.Mock> = {};
        const self = () => chain;
        chain.select = jest.fn(self);
        chain.eq = jest.fn(self);
        chain.order = jest.fn(self);
        chain.then = jest
          .fn()
          .mockImplementation(
            (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
              Promise.resolve(resolved).then(resolve, reject),
          );
        return chain;
      }

      const attemptsChain = mockSelectListQuery({ data: [] });
      const updateChain = mockUpdateQuery();
      const insertChain: Record<string, jest.Mock> = {};
      insertChain.insert = jest.fn().mockResolvedValue({ data: null, error: null });

      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return orderSelectChain;
        if (callCount === 2) return attemptsChain;
        if (callCount === 3) return updateChain;
        return insertChain;
      });

      mockPaymentIntentsCreate.mockResolvedValue({
        id: "pi_new",
        client_secret: "secret_new",
      });

      const result = await PaymentService.retryPayment(ORDER_ID, CUSTOMER_ID);

      expect(result.paymentIntentId).toBe("pi_new");
      // cancel should NOT be called when there's no existing payment_intent_id
      expect(mockPaymentIntentsCancel).not.toHaveBeenCalled();
    });
  });

  describe("getPaymentAttempts — edge cases", () => {
    it("handles null payments data gracefully", async () => {
      const orderSelectChain = mockSelectQuery({
        data: { id: ORDER_ID, customer_id: CUSTOMER_ID },
      });

      function mockSelectListQuery(result: { data?: unknown }) {
        const resolved = { data: result.data ?? null, error: null };
        const chain: Record<string, jest.Mock> = {};
        const self = () => chain;
        chain.select = jest.fn(self);
        chain.eq = jest.fn(self);
        chain.order = jest.fn(self);
        chain.then = jest
          .fn()
          .mockImplementation(
            (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
              Promise.resolve(resolved).then(resolve, reject),
          );
        return chain;
      }

      const paymentsChain = mockSelectListQuery({ data: null });

      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return orderSelectChain;
        return paymentsChain;
      });

      const result = await PaymentService.getPaymentAttempts(ORDER_ID, CUSTOMER_ID);

      expect(result).toEqual([]);
    });
  });
});
