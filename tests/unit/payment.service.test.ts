const mockFrom = jest.fn();

jest.mock("../../src/config/supabase", () => ({
  supabaseAdmin: {
    from: mockFrom,
  },
}));

const mockPaymentIntentsCreate = jest.fn();
const mockPaymentIntentsRetrieve = jest.fn();
const mockRefundsCreate = jest.fn();

jest.mock("../../src/config/stripe", () => ({
  getStripe: () => ({
    paymentIntents: {
      create: mockPaymentIntentsCreate,
      retrieve: mockPaymentIntentsRetrieve,
    },
    refunds: {
      create: mockRefundsCreate,
    },
  }),
}));

const mockOnPaymentSuccess = jest.fn().mockResolvedValue(undefined);
const mockOnPaymentRefunded = jest.fn().mockResolvedValue(undefined);

jest.mock("../../src/services/hooks/paymentHooks", () => ({
  onPaymentSuccess: mockOnPaymentSuccess,
  onPaymentRefunded: mockOnPaymentRefunded,
}));

const mockSendOrderStatusUpdate = jest.fn();

jest.mock("../../src/services/email.service", () => ({
  sendOrderConfirmation: jest.fn(),
  sendOrderStatusUpdate: mockSendOrderStatusUpdate,
}));

const mockIncrementStock = jest.fn().mockResolvedValue(undefined);

jest.mock("../../src/utils/inventory", () => ({
  incrementStock: mockIncrementStock,
}));

import { PaymentService } from "../../src/services/payment.service";
import { AppError } from "../../src/utils/errors";

const CUSTOMER_ID = "customer-uuid-1";
const ORDER_ID = "order-uuid-1";
const ORDER_NUMBER = "ORD-20260222-0001";

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    customer_id: CUSTOMER_ID,
    status: "pending_payment",
    payment_intent_id: null,
    total_amount: "64.93",
    order_number: ORDER_NUMBER,
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

function makeConfirmOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    customer_id: CUSTOMER_ID,
    status: "pending_payment",
    payment_intent_id: "pi_existing_123",
    payment_status: "processing",
    total_amount: "64.93",
    order_number: ORDER_NUMBER,
    created_at: "2026-02-22T00:00:00Z",
    shipping_address: null,
    order_items: [],
    ...overrides,
  };
}

function mockUpdateQuery() {
  const chain: Record<string, jest.Mock> = {};
  const self = () => chain;
  chain.update = jest.fn(self);
  chain.eq = jest.fn(self);
  // Allow the chain to resolve when awaited
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

describe("PaymentService", () => {
  describe("createPaymentIntent", () => {
    it("returns clientSecret and paymentIntentId on success", async () => {
      const selectChain = mockSelectQuery({ data: makeOrder() });
      const updateChain = mockUpdateQuery();

      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return selectChain;
        return updateChain;
      });

      mockPaymentIntentsCreate.mockResolvedValue({
        id: "pi_test_123",
        client_secret: "pi_test_123_secret_abc",
      });

      const result = await PaymentService.createPaymentIntent(ORDER_ID, CUSTOMER_ID);

      expect(result).toEqual({
        clientSecret: "pi_test_123_secret_abc",
        paymentIntentId: "pi_test_123",
      });

      expect(mockPaymentIntentsCreate).toHaveBeenCalledWith({
        amount: 6493,
        currency: "usd",
        metadata: {
          order_id: ORDER_ID,
          order_number: ORDER_NUMBER,
          customer_id: CUSTOMER_ID,
        },
        automatic_payment_methods: { enabled: true },
      });
    });

    it("throws NOT_FOUND when order does not exist", async () => {
      const selectChain = mockSelectQuery({
        data: null,
        error: { message: "not found" },
      });
      mockFrom.mockReturnValue(selectChain);

      await expect(PaymentService.createPaymentIntent(ORDER_ID, CUSTOMER_ID)).rejects.toThrow(
        AppError,
      );

      await expect(PaymentService.createPaymentIntent(ORDER_ID, CUSTOMER_ID)).rejects.toMatchObject(
        {
          statusCode: 404,
          code: "NOT_FOUND",
        },
      );
    });

    it("throws FORBIDDEN when customer does not own the order", async () => {
      const selectChain = mockSelectQuery({
        data: makeOrder({ customer_id: "other-customer" }),
      });
      mockFrom.mockReturnValue(selectChain);

      await expect(PaymentService.createPaymentIntent(ORDER_ID, CUSTOMER_ID)).rejects.toThrow(
        AppError,
      );

      await expect(PaymentService.createPaymentIntent(ORDER_ID, CUSTOMER_ID)).rejects.toMatchObject(
        {
          statusCode: 403,
          code: "FORBIDDEN",
        },
      );
    });

    it("throws CONFLICT when order is not pending_payment", async () => {
      const selectChain = mockSelectQuery({
        data: makeOrder({ status: "shipped" }),
      });
      mockFrom.mockReturnValue(selectChain);

      await expect(PaymentService.createPaymentIntent(ORDER_ID, CUSTOMER_ID)).rejects.toThrow(
        AppError,
      );

      await expect(PaymentService.createPaymentIntent(ORDER_ID, CUSTOMER_ID)).rejects.toMatchObject(
        {
          statusCode: 409,
          code: "CONFLICT",
          message: "Order is not awaiting payment",
        },
      );
    });

    it("throws CONFLICT when payment already initiated", async () => {
      const selectChain = mockSelectQuery({
        data: makeOrder({ payment_intent_id: "pi_existing" }),
      });
      mockFrom.mockReturnValue(selectChain);

      await expect(PaymentService.createPaymentIntent(ORDER_ID, CUSTOMER_ID)).rejects.toThrow(
        AppError,
      );

      await expect(PaymentService.createPaymentIntent(ORDER_ID, CUSTOMER_ID)).rejects.toMatchObject(
        {
          statusCode: 409,
          code: "CONFLICT",
          message: "Payment already initiated",
        },
      );
    });

    it("converts $64.93 to 6493 cents", async () => {
      const selectChain = mockSelectQuery({
        data: makeOrder({ total_amount: "64.93" }),
      });
      const updateChain = mockUpdateQuery();

      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return selectChain;
        return updateChain;
      });

      mockPaymentIntentsCreate.mockResolvedValue({
        id: "pi_test",
        client_secret: "secret",
      });

      await PaymentService.createPaymentIntent(ORDER_ID, CUSTOMER_ID);

      expect(mockPaymentIntentsCreate).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 6493 }),
      );
    });

    it("converts $0.01 to 1 cent", async () => {
      const selectChain = mockSelectQuery({
        data: makeOrder({ total_amount: "0.01" }),
      });
      const updateChain = mockUpdateQuery();

      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return selectChain;
        return updateChain;
      });

      mockPaymentIntentsCreate.mockResolvedValue({
        id: "pi_test",
        client_secret: "secret",
      });

      await PaymentService.createPaymentIntent(ORDER_ID, CUSTOMER_ID);

      expect(mockPaymentIntentsCreate).toHaveBeenCalledWith(expect.objectContaining({ amount: 1 }));
    });

    it("converts $999.99 to 99999 cents", async () => {
      const selectChain = mockSelectQuery({
        data: makeOrder({ total_amount: "999.99" }),
      });
      const updateChain = mockUpdateQuery();

      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return selectChain;
        return updateChain;
      });

      mockPaymentIntentsCreate.mockResolvedValue({
        id: "pi_test",
        client_secret: "secret",
      });

      await PaymentService.createPaymentIntent(ORDER_ID, CUSTOMER_ID);

      expect(mockPaymentIntentsCreate).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 99999 }),
      );
    });

    it("throws when Stripe API returns an error", async () => {
      const selectChain = mockSelectQuery({ data: makeOrder() });
      mockFrom.mockReturnValue(selectChain);

      mockPaymentIntentsCreate.mockRejectedValue(new Error("Stripe API error: card_declined"));

      await expect(PaymentService.createPaymentIntent(ORDER_ID, CUSTOMER_ID)).rejects.toThrow(
        "Stripe API error: card_declined",
      );
    });

    it("stores payment_intent_id on the order after creation", async () => {
      const selectChain = mockSelectQuery({ data: makeOrder() });
      const updateChain = mockUpdateQuery();

      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return selectChain;
        return updateChain;
      });

      mockPaymentIntentsCreate.mockResolvedValue({
        id: "pi_store_test",
        client_secret: "secret",
      });

      await PaymentService.createPaymentIntent(ORDER_ID, CUSTOMER_ID);

      // Second call to from() should be the update
      expect(mockFrom).toHaveBeenCalledTimes(2);
      expect(mockFrom).toHaveBeenNthCalledWith(2, "orders");
      expect(updateChain.update).toHaveBeenCalledWith({
        payment_intent_id: "pi_store_test",
        payment_status: "processing",
      });
      expect(updateChain.eq).toHaveBeenCalledWith("id", ORDER_ID);
    });
  });

  describe("confirmPayment", () => {
    it("updates order to paid when Stripe status is succeeded", async () => {
      const selectChain = mockSelectQuery({ data: makeConfirmOrder() });
      const updateChain = mockUpdateQuery();
      const userSelectChain = mockSelectQuery({ data: { email: "cust@test.com" } });

      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return selectChain;
        if (callCount === 2) return updateChain;
        return userSelectChain;
      });

      mockPaymentIntentsRetrieve.mockResolvedValue({ status: "succeeded" });

      const result = await PaymentService.confirmPayment(ORDER_ID, CUSTOMER_ID);

      expect(result.orderId).toBe(ORDER_ID);
      expect(result.status).toBe("paid");
      expect(result.paidAt).toBeTruthy();
      expect(updateChain.update).toHaveBeenCalledWith({
        payment_status: "paid",
        status: "confirmed",
      });
    });

    it("returns idempotently when already paid", async () => {
      const selectChain = mockSelectQuery({
        data: makeConfirmOrder({ payment_status: "paid" }),
      });
      mockFrom.mockReturnValue(selectChain);

      const result = await PaymentService.confirmPayment(ORDER_ID, CUSTOMER_ID);

      expect(result.status).toBe("paid");
      expect(mockPaymentIntentsRetrieve).not.toHaveBeenCalled();
    });

    it("returns processing when Stripe status is processing", async () => {
      const selectChain = mockSelectQuery({ data: makeConfirmOrder() });
      mockFrom.mockReturnValue(selectChain);

      mockPaymentIntentsRetrieve.mockResolvedValue({ status: "processing" });

      const result = await PaymentService.confirmPayment(ORDER_ID, CUSTOMER_ID);

      expect(result.status).toBe("processing");
      expect(result.paidAt).toBe("");
    });

    it("throws BAD_REQUEST when no payment initiated", async () => {
      const selectChain = mockSelectQuery({
        data: makeConfirmOrder({ payment_intent_id: null }),
      });
      mockFrom.mockReturnValue(selectChain);

      await expect(PaymentService.confirmPayment(ORDER_ID, CUSTOMER_ID)).rejects.toMatchObject({
        statusCode: 400,
        code: "BAD_REQUEST",
      });
    });

    it("calls onPaymentSuccess hook on succeeded", async () => {
      const selectChain = mockSelectQuery({ data: makeConfirmOrder() });
      const updateChain = mockUpdateQuery();
      const userSelectChain = mockSelectQuery({ data: { email: "cust@test.com" } });

      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return selectChain;
        if (callCount === 2) return updateChain;
        return userSelectChain;
      });

      mockPaymentIntentsRetrieve.mockResolvedValue({ status: "succeeded" });

      await PaymentService.confirmPayment(ORDER_ID, CUSTOMER_ID);

      expect(mockOnPaymentSuccess).toHaveBeenCalledWith(ORDER_ID);
    });

    it("throws NOT_FOUND when order does not exist", async () => {
      const selectChain = mockSelectQuery({
        data: null,
        error: { message: "not found" },
      });
      mockFrom.mockReturnValue(selectChain);

      await expect(PaymentService.confirmPayment(ORDER_ID, CUSTOMER_ID)).rejects.toMatchObject({
        statusCode: 404,
        code: "NOT_FOUND",
      });
    });

    it("throws FORBIDDEN when customer does not own the order", async () => {
      const selectChain = mockSelectQuery({
        data: makeConfirmOrder({ customer_id: "other-customer" }),
      });
      mockFrom.mockReturnValue(selectChain);

      await expect(PaymentService.confirmPayment(ORDER_ID, CUSTOMER_ID)).rejects.toMatchObject({
        statusCode: 403,
        code: "FORBIDDEN",
      });
    });

    it("returns canceled when Stripe status is canceled", async () => {
      const selectChain = mockSelectQuery({ data: makeConfirmOrder() });
      mockFrom.mockReturnValue(selectChain);

      mockPaymentIntentsRetrieve.mockResolvedValue({ status: "canceled" });

      const result = await PaymentService.confirmPayment(ORDER_ID, CUSTOMER_ID);

      expect(result.status).toBe("canceled");
      expect(result.paidAt).toBe("");
    });
  });

  describe("getPaymentStatus", () => {
    it("returns paymentStatus and orderStatus", async () => {
      const selectChain = mockSelectQuery({
        data: {
          id: ORDER_ID,
          customer_id: CUSTOMER_ID,
          payment_status: "paid",
          status: "confirmed",
        },
      });
      mockFrom.mockReturnValue(selectChain);

      const result = await PaymentService.getPaymentStatus(ORDER_ID, CUSTOMER_ID);

      expect(result).toEqual({
        paymentStatus: "paid",
        orderStatus: "confirmed",
      });
    });

    it("throws NOT_FOUND when order does not exist", async () => {
      const selectChain = mockSelectQuery({
        data: null,
        error: { message: "not found" },
      });
      mockFrom.mockReturnValue(selectChain);

      await expect(PaymentService.getPaymentStatus(ORDER_ID, CUSTOMER_ID)).rejects.toMatchObject({
        statusCode: 404,
        code: "NOT_FOUND",
      });
    });

    it("throws FORBIDDEN when customer does not own the order", async () => {
      const selectChain = mockSelectQuery({
        data: {
          id: ORDER_ID,
          customer_id: "other-customer",
          payment_status: "processing",
          status: "pending_payment",
        },
      });
      mockFrom.mockReturnValue(selectChain);

      await expect(PaymentService.getPaymentStatus(ORDER_ID, CUSTOMER_ID)).rejects.toMatchObject({
        statusCode: 403,
        code: "FORBIDDEN",
      });
    });
  });

  describe("refundPayment", () => {
    const PI_ID = "pi_refund_123";
    const REFUND_ID = "re_test_456";

    function makeRefundOrder(overrides: Record<string, unknown> = {}) {
      return {
        id: ORDER_ID,
        customer_id: CUSTOMER_ID,
        status: "confirmed",
        payment_status: "paid",
        payment_intent_id: PI_ID,
        total_amount: "64.93",
        order_number: ORDER_NUMBER,
        ...overrides,
      };
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
      chain.then = jest
        .fn()
        .mockImplementation((resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve(resolved).then(resolve, reject),
        );
      return chain;
    }

    function mockInsertQuery() {
      const chain: Record<string, jest.Mock> = {};
      chain.insert = jest.fn().mockResolvedValue({ data: null, error: null });
      return chain;
    }

    function setupRefundHappyPath(orderOverrides: Record<string, unknown> = {}) {
      const orderSelectChain = mockSelectQuery({ data: makeRefundOrder(orderOverrides) });
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
        if (callCount === 1) return orderSelectChain; // orders select
        if (callCount === 2) return orderUpdateChain; // orders update
        if (callCount === 3) return itemsSelectChain; // order_items select
        if (callCount === 4) return paymentsInsertChain; // payments insert
        if (callCount === 5) return historyInsertChain; // order_status_history insert
        return userSelectChain; // users select
      });

      mockRefundsCreate.mockResolvedValue({ id: REFUND_ID, status: "succeeded" });

      return {
        orderSelectChain,
        orderUpdateChain,
        itemsSelectChain,
        paymentsInsertChain,
        historyInsertChain,
        userSelectChain,
      };
    }

    it("returns refundId, status, and amount on success", async () => {
      setupRefundHappyPath();

      const result = await PaymentService.refundPayment(ORDER_ID, CUSTOMER_ID, "Changed my mind");

      expect(result).toEqual({
        refundId: REFUND_ID,
        status: "refunded",
        amount: 64.93,
      });

      expect(mockRefundsCreate).toHaveBeenCalledWith({
        payment_intent: PI_ID,
        reason: "requested_by_customer",
      });
    });

    it("throws NOT_FOUND when order does not exist", async () => {
      const selectChain = mockSelectQuery({
        data: null,
        error: { message: "not found" },
      });
      mockFrom.mockReturnValue(selectChain);

      await expect(PaymentService.refundPayment(ORDER_ID, CUSTOMER_ID)).rejects.toMatchObject({
        statusCode: 404,
        code: "NOT_FOUND",
      });
    });

    it("throws FORBIDDEN when customer does not own the order", async () => {
      const selectChain = mockSelectQuery({
        data: makeRefundOrder({ customer_id: "other-customer" }),
      });
      mockFrom.mockReturnValue(selectChain);

      await expect(PaymentService.refundPayment(ORDER_ID, CUSTOMER_ID)).rejects.toMatchObject({
        statusCode: 403,
        code: "FORBIDDEN",
      });
    });

    it("throws CONFLICT when payment_status is not paid", async () => {
      const selectChain = mockSelectQuery({
        data: makeRefundOrder({ payment_status: "processing" }),
      });
      mockFrom.mockReturnValue(selectChain);

      await expect(PaymentService.refundPayment(ORDER_ID, CUSTOMER_ID)).rejects.toMatchObject({
        statusCode: 409,
        code: "CONFLICT",
        message: "Order payment status must be 'paid' to request a refund",
      });
    });

    it("throws CONFLICT when order status is shipped", async () => {
      const selectChain = mockSelectQuery({
        data: makeRefundOrder({ status: "shipped" }),
      });
      mockFrom.mockReturnValue(selectChain);

      await expect(PaymentService.refundPayment(ORDER_ID, CUSTOMER_ID)).rejects.toMatchObject({
        statusCode: 409,
        code: "CONFLICT",
        message: "Cannot refund an order with status 'shipped'",
      });
    });

    it("does not update order when Stripe refund fails", async () => {
      const selectChain = mockSelectQuery({ data: makeRefundOrder() });
      mockFrom.mockReturnValue(selectChain);

      mockRefundsCreate.mockRejectedValue(new Error("Stripe refund failed"));

      await expect(PaymentService.refundPayment(ORDER_ID, CUSTOMER_ID)).rejects.toThrow(
        "Stripe refund failed",
      );

      // Only 1 from() call (the initial order select) — no update
      expect(mockFrom).toHaveBeenCalledTimes(1);
    });

    it("inserts payment record with negative amount", async () => {
      const { paymentsInsertChain } = setupRefundHappyPath();

      await PaymentService.refundPayment(ORDER_ID, CUSTOMER_ID);

      expect(mockFrom).toHaveBeenNthCalledWith(4, "payments");
      expect(paymentsInsertChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          order_id: ORDER_ID,
          stripe_payment_intent_id: PI_ID,
          amount: -64.93,
          currency: "usd",
          status: "refunded",
          stripe_charge_id: REFUND_ID,
        }),
      );
    });

    it("calls incrementStock with order items", async () => {
      setupRefundHappyPath();

      await PaymentService.refundPayment(ORDER_ID, CUSTOMER_ID);

      expect(mockIncrementStock).toHaveBeenCalledWith(
        [
          { productId: "prod-1", quantity: 2 },
          { productId: "prod-2", quantity: 1 },
        ],
        expect.anything(),
      );
    });

    it("calls onPaymentRefunded hook", async () => {
      setupRefundHappyPath();

      await PaymentService.refundPayment(ORDER_ID, CUSTOMER_ID);

      expect(mockOnPaymentRefunded).toHaveBeenCalledWith(ORDER_ID);
    });

    it("inserts order_status_history record", async () => {
      const { historyInsertChain } = setupRefundHappyPath();

      await PaymentService.refundPayment(ORDER_ID, CUSTOMER_ID, "Changed my mind");

      expect(mockFrom).toHaveBeenNthCalledWith(5, "order_status_history");
      expect(historyInsertChain.insert).toHaveBeenCalledWith({
        order_id: ORDER_ID,
        from_status: "confirmed",
        to_status: "cancelled",
        changed_by: CUSTOMER_ID,
        reason: "Changed my mind",
      });
    });
  });
});
