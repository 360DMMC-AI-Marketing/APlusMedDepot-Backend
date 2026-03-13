const mockFrom = jest.fn();
const mockRpc = jest.fn();

jest.mock("../../src/config/supabase", () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

const mockOnPaymentSuccess = jest.fn();

jest.mock("../../src/services/hooks/paymentHooks", () => ({
  onPaymentSuccess: (...args: unknown[]) => mockOnPaymentSuccess(...args),
}));

import { Net30Service } from "../../src/services/net30.service";

const ORDER_ID = "a0000000-0000-4000-8000-000000000001";
const USER_ID = "c0000000-0000-4000-8000-000000000001";

function mockQuery(result: { data?: unknown; error?: unknown }) {
  const resolved = { data: result.data ?? null, error: result.error ?? null };
  const chain: Record<string, jest.Mock> = {};
  const self = () => chain;
  chain.select = jest.fn(self);
  chain.insert = jest.fn(self);
  chain.update = jest.fn(self);
  chain.upsert = jest.fn(self);
  chain.eq = jest.fn(self);
  chain.neq = jest.fn(self);
  chain.single = jest.fn().mockResolvedValue(resolved);
  chain.then = jest
    .fn()
    .mockImplementation((resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(resolved).then(resolve, reject),
    );
  return chain;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("Net30 edge cases", () => {
  describe("exact credit boundary", () => {
    it("succeeds when available credit exactly equals order amount", async () => {
      const orderChain = mockQuery({
        data: {
          id: ORDER_ID,
          customer_id: USER_ID,
          status: "pending_payment",
          payment_status: "pending",
          payment_intent_id: null,
          paypal_order_id: null,
          payment_method: null,
          total_amount: "500.00",
          order_number: "ORD-BOUNDARY",
        },
      });
      // Credit: limit 1000, used 500 → available 500, order is exactly 500
      const creditChain = mockQuery({
        data: {
          id: "c1",
          user_id: USER_ID,
          credit_limit: "1000.00",
          credit_used: "500.00",
          eligible: true,
        },
      });
      mockRpc.mockResolvedValueOnce({ data: true, error: null });
      const updateChain = mockQuery({ data: null });
      const invoiceChain = mockQuery({
        data: { id: "inv-boundary", due_date: "2026-04-10T00:00:00.000Z" },
      });

      mockFrom
        .mockReturnValueOnce(orderChain)
        .mockReturnValueOnce(creditChain)
        .mockReturnValueOnce(updateChain)
        .mockReturnValueOnce(invoiceChain);
      mockOnPaymentSuccess.mockResolvedValue(undefined);

      const result = await Net30Service.placeNet30Order(ORDER_ID, USER_ID);

      expect(result.status).toBe("confirmed");
      expect(result.amount).toBe(500);
    });
  });

  describe("credit deduction RPC returns unexpected error", () => {
    it("throws CREDIT_ERROR (500) when RPC returns error object", async () => {
      const orderChain = mockQuery({
        data: {
          id: ORDER_ID,
          customer_id: USER_ID,
          status: "pending_payment",
          payment_status: "pending",
          payment_intent_id: null,
          paypal_order_id: null,
          payment_method: null,
          total_amount: "100.00",
          order_number: "ORD-001",
        },
      });
      const creditChain = mockQuery({
        data: {
          id: "c1",
          user_id: USER_ID,
          credit_limit: "50000.00",
          credit_used: "0.00",
          eligible: true,
        },
      });
      // deductCredit RPC fails with DB error
      mockRpc.mockResolvedValueOnce({ data: null, error: { message: "connection reset" } });

      mockFrom.mockReturnValueOnce(orderChain).mockReturnValueOnce(creditChain);

      await expect(Net30Service.placeNet30Order(ORDER_ID, USER_ID)).rejects.toMatchObject({
        statusCode: 500,
        code: "CREDIT_ERROR",
      });
    });

    it("throws INSUFFICIENT_CREDIT (409) when RPC returns false", async () => {
      const orderChain = mockQuery({
        data: {
          id: ORDER_ID,
          customer_id: USER_ID,
          status: "pending_payment",
          payment_status: "pending",
          payment_intent_id: null,
          paypal_order_id: null,
          payment_method: null,
          total_amount: "100.00",
          order_number: "ORD-001",
        },
      });
      const creditChain = mockQuery({
        data: {
          id: "c1",
          user_id: USER_ID,
          credit_limit: "50000.00",
          credit_used: "0.00",
          eligible: true,
        },
      });
      // deductCredit RPC returns false (race condition: another order consumed credit)
      mockRpc.mockResolvedValueOnce({ data: false, error: null });

      mockFrom.mockReturnValueOnce(orderChain).mockReturnValueOnce(creditChain);

      await expect(Net30Service.placeNet30Order(ORDER_ID, USER_ID)).rejects.toMatchObject({
        statusCode: 409,
        code: "INSUFFICIENT_CREDIT",
      });
    });
  });

  describe("invoice returns null", () => {
    it("returns null invoiceId when insert returns no data", async () => {
      const orderChain = mockQuery({
        data: {
          id: ORDER_ID,
          customer_id: USER_ID,
          status: "pending_payment",
          payment_status: "pending",
          payment_intent_id: null,
          paypal_order_id: null,
          payment_method: null,
          total_amount: "100.00",
          order_number: "ORD-001",
        },
      });
      const creditChain = mockQuery({
        data: {
          id: "c1",
          user_id: USER_ID,
          credit_limit: "50000.00",
          credit_used: "0.00",
          eligible: true,
        },
      });
      mockRpc.mockResolvedValueOnce({ data: true, error: null });
      const updateChain = mockQuery({ data: null });
      // Invoice insert returns null data
      const invoiceChain = mockQuery({ data: null });

      mockFrom
        .mockReturnValueOnce(orderChain)
        .mockReturnValueOnce(creditChain)
        .mockReturnValueOnce(updateChain)
        .mockReturnValueOnce(invoiceChain);
      mockOnPaymentSuccess.mockResolvedValue(undefined);

      const result = await Net30Service.placeNet30Order(ORDER_ID, USER_ID);

      expect(result.invoiceId).toBeNull();
      expect(result.status).toBe("confirmed");
    });
  });
});
