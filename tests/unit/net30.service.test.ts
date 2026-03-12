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

const baseOrder = {
  id: ORDER_ID,
  customer_id: USER_ID,
  status: "pending_payment",
  payment_status: "pending",
  payment_intent_id: null,
  paypal_order_id: null,
  payment_method: null,
  total_amount: "1500.00",
  order_number: "ORD-20260311-ABC12",
};

function mockQuery(result: { data?: unknown; error?: unknown }) {
  const resolved = {
    data: result.data ?? null,
    error: result.error ?? null,
  };
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

describe("Net30Service.placeNet30Order", () => {
  it("succeeds: order confirmed, invoice created, credit deducted, onPaymentSuccess called", async () => {
    // 1. Fetch order
    const orderChain = mockQuery({ data: baseOrder });
    // 2. getCreditInfo (from checkCreditEligibility)
    const creditChain = mockQuery({
      data: {
        id: "c1",
        user_id: USER_ID,
        credit_limit: "50000.00",
        credit_used: "0.00",
        eligible: true,
      },
    });
    // 3. deductCredit rpc
    mockRpc.mockResolvedValueOnce({ data: true, error: null });
    // 4. update order
    const updateChain = mockQuery({ data: null });
    // 5. insert invoice
    const invoiceChain = mockQuery({
      data: { id: "invoice-001", due_date: "2026-04-10T00:00:00.000Z" },
    });

    mockFrom
      .mockReturnValueOnce(orderChain)
      .mockReturnValueOnce(creditChain)
      .mockReturnValueOnce(updateChain)
      .mockReturnValueOnce(invoiceChain);

    mockOnPaymentSuccess.mockResolvedValue(undefined);

    const result = await Net30Service.placeNet30Order(ORDER_ID, USER_ID);

    expect(result.orderId).toBe(ORDER_ID);
    expect(result.invoiceId).toBe("invoice-001");
    expect(result.amount).toBe(1500);
    expect(result.status).toBe("confirmed");
    expect(result.invoiceDueDate).toBeTruthy();

    // Verify order update
    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "confirmed",
        payment_status: "paid",
        payment_method: "net30",
      }),
    );

    // Verify invoice insert
    expect(invoiceChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        order_id: ORDER_ID,
        user_id: USER_ID,
        amount: 1500,
        status: "pending",
      }),
    );

    // Verify hook
    expect(mockOnPaymentSuccess).toHaveBeenCalledWith(ORDER_ID);
  });

  it("throws NOT_FOUND when order does not exist", async () => {
    const orderChain = mockQuery({ data: null, error: { message: "not found" } });
    mockFrom.mockReturnValueOnce(orderChain);

    await expect(Net30Service.placeNet30Order(ORDER_ID, USER_ID)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("throws FORBIDDEN when order belongs to different user", async () => {
    const orderChain = mockQuery({
      data: { ...baseOrder, customer_id: "different-user" },
    });
    mockFrom.mockReturnValueOnce(orderChain);

    await expect(Net30Service.placeNet30Order(ORDER_ID, USER_ID)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("throws CONFLICT when order is not pending_payment", async () => {
    const orderChain = mockQuery({
      data: { ...baseOrder, status: "confirmed" },
    });
    mockFrom.mockReturnValueOnce(orderChain);

    await expect(Net30Service.placeNet30Order(ORDER_ID, USER_ID)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("throws CONFLICT when Stripe payment already initiated", async () => {
    const orderChain = mockQuery({
      data: { ...baseOrder, payment_intent_id: "pi_stripe123" },
    });
    mockFrom.mockReturnValueOnce(orderChain);

    await expect(Net30Service.placeNet30Order(ORDER_ID, USER_ID)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining("Stripe"),
    });
  });

  it("throws CONFLICT when PayPal payment already initiated", async () => {
    const orderChain = mockQuery({
      data: { ...baseOrder, paypal_order_id: "PP-123" },
    });
    mockFrom.mockReturnValueOnce(orderChain);

    await expect(Net30Service.placeNet30Order(ORDER_ID, USER_ID)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining("PayPal"),
    });
  });

  it("throws CREDIT_INELIGIBLE (403) when user not eligible for Net30", async () => {
    const orderChain = mockQuery({ data: baseOrder });
    const creditChain = mockQuery({
      data: {
        id: "c1",
        user_id: USER_ID,
        credit_limit: "50000.00",
        credit_used: "0.00",
        eligible: false,
      },
    });
    mockFrom.mockReturnValueOnce(orderChain).mockReturnValueOnce(creditChain);

    await expect(Net30Service.placeNet30Order(ORDER_ID, USER_ID)).rejects.toMatchObject({
      statusCode: 403,
      code: "CREDIT_INELIGIBLE",
    });
  });

  it("throws CREDIT_INELIGIBLE (403) with amounts when insufficient credit", async () => {
    const orderChain = mockQuery({ data: baseOrder });
    const creditChain = mockQuery({
      data: {
        id: "c1",
        user_id: USER_ID,
        credit_limit: "2000.00",
        credit_used: "1500.00",
        eligible: true,
      },
    });
    mockFrom.mockReturnValueOnce(orderChain).mockReturnValueOnce(creditChain);

    await expect(Net30Service.placeNet30Order(ORDER_ID, USER_ID)).rejects.toMatchObject({
      statusCode: 403,
      message: expect.stringContaining("$500.00"),
    });
  });

  it("invoice due_date is approximately 30 days from now", async () => {
    const orderChain = mockQuery({ data: baseOrder });
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
    const invoiceChain = mockQuery({
      data: { id: "inv-1", due_date: "2026-04-10T00:00:00.000Z" },
    });

    mockFrom
      .mockReturnValueOnce(orderChain)
      .mockReturnValueOnce(creditChain)
      .mockReturnValueOnce(updateChain)
      .mockReturnValueOnce(invoiceChain);
    mockOnPaymentSuccess.mockResolvedValue(undefined);

    const result = await Net30Service.placeNet30Order(ORDER_ID, USER_ID);

    const dueDate = new Date(result.invoiceDueDate);
    const now = new Date();
    const diffDays = (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

    expect(diffDays).toBeGreaterThan(29);
    expect(diffDays).toBeLessThan(31);
  });

  it("calls onPaymentSuccess hook", async () => {
    const orderChain = mockQuery({ data: baseOrder });
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
    const invoiceChain = mockQuery({ data: { id: "inv-1", due_date: "2026-04-10" } });

    mockFrom
      .mockReturnValueOnce(orderChain)
      .mockReturnValueOnce(creditChain)
      .mockReturnValueOnce(updateChain)
      .mockReturnValueOnce(invoiceChain);
    mockOnPaymentSuccess.mockResolvedValue(undefined);

    await Net30Service.placeNet30Order(ORDER_ID, USER_ID);

    expect(mockOnPaymentSuccess).toHaveBeenCalledTimes(1);
    expect(mockOnPaymentSuccess).toHaveBeenCalledWith(ORDER_ID);
  });

  it("does not throw when hook fails", async () => {
    const orderChain = mockQuery({ data: baseOrder });
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
    const invoiceChain = mockQuery({ data: { id: "inv-1", due_date: "2026-04-10" } });

    mockFrom
      .mockReturnValueOnce(orderChain)
      .mockReturnValueOnce(creditChain)
      .mockReturnValueOnce(updateChain)
      .mockReturnValueOnce(invoiceChain);
    mockOnPaymentSuccess.mockRejectedValue(new Error("Hook exploded"));

    const consoleSpy = jest.spyOn(console, "error").mockImplementation();

    const result = await Net30Service.placeNet30Order(ORDER_ID, USER_ID);

    expect(result.status).toBe("confirmed");
    consoleSpy.mockRestore();
  });

  it("sets payment_method to 'net30'", async () => {
    const orderChain = mockQuery({ data: baseOrder });
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
    const invoiceChain = mockQuery({ data: { id: "inv-1", due_date: "2026-04-10" } });

    mockFrom
      .mockReturnValueOnce(orderChain)
      .mockReturnValueOnce(creditChain)
      .mockReturnValueOnce(updateChain)
      .mockReturnValueOnce(invoiceChain);
    mockOnPaymentSuccess.mockResolvedValue(undefined);

    await Net30Service.placeNet30Order(ORDER_ID, USER_ID);

    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ payment_method: "net30" }),
    );
  });

  it("throws CONFLICT when Net30 already initiated", async () => {
    const orderChain = mockQuery({
      data: { ...baseOrder, payment_method: "net30" },
    });
    mockFrom.mockReturnValueOnce(orderChain);

    await expect(Net30Service.placeNet30Order(ORDER_ID, USER_ID)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining("Net30"),
    });
  });
});
