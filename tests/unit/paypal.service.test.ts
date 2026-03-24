const mockFrom = jest.fn();

jest.mock("../../src/config/supabase", () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

const mockOnPaymentSuccess = jest.fn();

jest.mock("../../src/services/hooks/paymentHooks", () => ({
  onPaymentSuccess: (...args: unknown[]) => mockOnPaymentSuccess(...args),
}));

jest.mock("../../src/config/paypal", () => ({
  getPayPalAccessToken: jest.fn().mockResolvedValue("mock-access-token"),
  isPayPalConfigured: jest.fn().mockReturnValue(true),
  PAYPAL_API_BASE: "https://api-m.sandbox.paypal.com",
}));

import { PayPalService } from "../../src/services/paypal.service";
import { isPayPalConfigured } from "../../src/config/paypal";

const ORDER_ID = "a0000000-0000-4000-8000-000000000001";
const CUSTOMER_ID = "c0000000-0000-4000-8000-000000000001";

const baseOrder = {
  id: ORDER_ID,
  customer_id: CUSTOMER_ID,
  status: "pending_payment",
  payment_status: "pending",
  payment_intent_id: null,
  paypal_order_id: null,
  total_amount: "99.99",
  order_number: "ORD-20260101-ABC12",
};

// Helper to build a chainable query mock
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
  chain.eq = jest.fn(self);
  chain.neq = jest.fn(self);
  chain.in = jest.fn(self);
  chain.single = jest.fn().mockResolvedValue(resolved);
  chain.maybeSingle = jest.fn().mockResolvedValue(resolved);
  chain.then = jest
    .fn()
    .mockImplementation((resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(resolved).then(resolve, reject),
    );
  return chain;
}

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  jest.clearAllMocks();
  (isPayPalConfigured as jest.Mock).mockReturnValue(true);
});

describe("PayPalService.createOrder", () => {
  it("creates PayPal order successfully and stores paypal_order_id", async () => {
    // DB: fetch order
    const orderChain = mockQuery({ data: baseOrder });
    // DB: update order
    const updateChain = mockQuery({ data: null });
    mockFrom.mockReturnValueOnce(orderChain).mockReturnValueOnce(updateChain);

    // PayPal API: create order
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "PAYPAL-ORDER-123",
        status: "CREATED",
        links: [
          { rel: "self", href: "https://api.paypal.com/self" },
          {
            rel: "approve",
            href: "https://www.sandbox.paypal.com/checkoutnow?token=PAYPAL-ORDER-123",
          },
        ],
      }),
    });

    const result = await PayPalService.createOrder(ORDER_ID, CUSTOMER_ID);

    expect(result.paypalOrderId).toBe("PAYPAL-ORDER-123");
    expect(result.approvalUrl).toContain("sandbox.paypal.com");

    // Verify update was called with paypal_order_id
    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        paypal_order_id: "PAYPAL-ORDER-123",
        payment_status: "processing",
        payment_method: "paypal",
      }),
    );
  });

  it("sends correct amount with 2 decimal places to PayPal", async () => {
    const orderChain = mockQuery({ data: { ...baseOrder, total_amount: "123.456" } });
    const updateChain = mockQuery({ data: null });
    mockFrom.mockReturnValueOnce(orderChain).mockReturnValueOnce(updateChain);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "PP-AMT",
        status: "CREATED",
        links: [{ rel: "approve", href: "https://paypal.com/approve" }],
      }),
    });

    await PayPalService.createOrder(ORDER_ID, CUSTOMER_ID);

    const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(fetchBody.purchase_units[0].amount.value).toBe("123.46");
  });

  it("throws NOT_FOUND when order does not exist", async () => {
    const orderChain = mockQuery({ data: null, error: { message: "not found" } });
    mockFrom.mockReturnValueOnce(orderChain);

    await expect(PayPalService.createOrder(ORDER_ID, CUSTOMER_ID)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("throws FORBIDDEN when customer does not own order", async () => {
    const orderChain = mockQuery({
      data: { ...baseOrder, customer_id: "different-customer" },
    });
    mockFrom.mockReturnValueOnce(orderChain);

    await expect(PayPalService.createOrder(ORDER_ID, CUSTOMER_ID)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("throws CONFLICT when order is not pending_payment", async () => {
    const orderChain = mockQuery({
      data: { ...baseOrder, status: "confirmed" },
    });
    mockFrom.mockReturnValueOnce(orderChain);

    await expect(PayPalService.createOrder(ORDER_ID, CUSTOMER_ID)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("throws CONFLICT when Stripe payment_intent_id already set", async () => {
    const orderChain = mockQuery({
      data: { ...baseOrder, payment_intent_id: "pi_stripe123" },
    });
    mockFrom.mockReturnValueOnce(orderChain);

    await expect(PayPalService.createOrder(ORDER_ID, CUSTOMER_ID)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining("Stripe"),
    });
  });

  it("throws CONFLICT when PayPal order already initiated", async () => {
    const orderChain = mockQuery({
      data: { ...baseOrder, paypal_order_id: "existing-pp-order" },
    });
    mockFrom.mockReturnValueOnce(orderChain);

    await expect(PayPalService.createOrder(ORDER_ID, CUSTOMER_ID)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it("throws SERVICE_UNAVAILABLE (503) when PayPal not configured", async () => {
    (isPayPalConfigured as jest.Mock).mockReturnValue(false);

    await expect(PayPalService.createOrder(ORDER_ID, CUSTOMER_ID)).rejects.toMatchObject({
      statusCode: 503,
    });
  });

  it("throws PAYPAL_ERROR (502) when PayPal API returns error", async () => {
    const orderChain = mockQuery({ data: baseOrder });
    mockFrom.mockReturnValueOnce(orderChain);

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      text: async () => "Unprocessable Entity",
    });

    await expect(PayPalService.createOrder(ORDER_ID, CUSTOMER_ID)).rejects.toMatchObject({
      statusCode: 502,
      code: "PAYPAL_ERROR",
    });
  });

  it("sets payment_method to 'paypal' on order update", async () => {
    const orderChain = mockQuery({ data: baseOrder });
    const updateChain = mockQuery({ data: null });
    mockFrom.mockReturnValueOnce(orderChain).mockReturnValueOnce(updateChain);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "PP-123",
        status: "CREATED",
        links: [],
      }),
    });

    await PayPalService.createOrder(ORDER_ID, CUSTOMER_ID);

    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ payment_method: "paypal" }),
    );
  });
});

describe("PayPalService.captureOrder", () => {
  const orderWithPaypal = {
    ...baseOrder,
    paypal_order_id: "PAYPAL-ORDER-123",
    payment_status: "processing",
  };

  it("captures COMPLETED payment — marks paid, creates payment record, calls onPaymentSuccess", async () => {
    // DB: fetch order
    const orderChain = mockQuery({ data: orderWithPaypal });
    // DB: update order
    const updateChain = mockQuery({ data: null });
    // DB: insert payment
    const insertChain = mockQuery({ data: null });
    mockFrom
      .mockReturnValueOnce(orderChain)
      .mockReturnValueOnce(updateChain)
      .mockReturnValueOnce(insertChain);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "PAYPAL-ORDER-123",
        status: "COMPLETED",
        purchase_units: [
          {
            payments: {
              captures: [{ id: "CAPTURE-456" }],
            },
          },
        ],
      }),
    });

    mockOnPaymentSuccess.mockResolvedValue(undefined);

    const result = await PayPalService.captureOrder(ORDER_ID, CUSTOMER_ID);

    expect(result.status).toBe("paid");
    expect(result.paidAt).toBeTruthy();
    expect(result.orderId).toBe(ORDER_ID);

    // Verify order update
    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_status: "paid",
        status: "confirmed",
        payment_method: "paypal",
      }),
    );

    // Verify payment record insert
    expect(insertChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        order_id: ORDER_ID,
        amount: 99.99,
        currency: "USD",
        status: "succeeded",
        payment_method: "paypal",
        metadata: expect.objectContaining({
          paypal_order_id: "PAYPAL-ORDER-123",
          capture_id: "CAPTURE-456",
        }),
      }),
    );

    // Verify hook called
    expect(mockOnPaymentSuccess).toHaveBeenCalledWith(ORDER_ID);
  });

  it("returns success immediately for already-paid order (idempotent)", async () => {
    const paidOrder = { ...orderWithPaypal, payment_status: "paid" };
    const orderChain = mockQuery({ data: paidOrder });
    mockFrom.mockReturnValueOnce(orderChain);

    const result = await PayPalService.captureOrder(ORDER_ID, CUSTOMER_ID);

    expect(result.status).toBe("paid");
    // No fetch call — no PayPal API hit
    expect(mockFetch).not.toHaveBeenCalled();
    // No duplicate processing
    expect(mockOnPaymentSuccess).not.toHaveBeenCalled();
  });

  it("throws BAD_REQUEST when no paypal_order_id on order", async () => {
    const noPaypalOrder = { ...baseOrder, paypal_order_id: null };
    const orderChain = mockQuery({ data: noPaypalOrder });
    mockFrom.mockReturnValueOnce(orderChain);

    await expect(PayPalService.captureOrder(ORDER_ID, CUSTOMER_ID)).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("throws PAYPAL_ERROR (502) when capture API fails", async () => {
    const orderChain = mockQuery({ data: orderWithPaypal });
    mockFrom.mockReturnValueOnce(orderChain);

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    });

    await expect(PayPalService.captureOrder(ORDER_ID, CUSTOMER_ID)).rejects.toMatchObject({
      statusCode: 502,
      code: "PAYPAL_ERROR",
    });
  });

  it("returns non-COMPLETED status without marking order as paid", async () => {
    const orderChain = mockQuery({ data: orderWithPaypal });
    mockFrom.mockReturnValueOnce(orderChain);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "PAYPAL-ORDER-123",
        status: "PENDING",
      }),
    });

    const result = await PayPalService.captureOrder(ORDER_ID, CUSTOMER_ID);

    expect(result.status).toBe("pending");
    expect(result.paidAt).toBeNull();
    // No DB updates for non-completed
    expect(mockFrom).toHaveBeenCalledTimes(1); // only the initial order fetch
    expect(mockOnPaymentSuccess).not.toHaveBeenCalled();
  });

  it("calls onPaymentSuccess exactly once on success", async () => {
    const orderChain = mockQuery({ data: orderWithPaypal });
    const updateChain = mockQuery({ data: null });
    const insertChain = mockQuery({ data: null });
    mockFrom
      .mockReturnValueOnce(orderChain)
      .mockReturnValueOnce(updateChain)
      .mockReturnValueOnce(insertChain);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "PP-123", status: "COMPLETED", purchase_units: [] }),
    });
    mockOnPaymentSuccess.mockResolvedValue(undefined);

    await PayPalService.captureOrder(ORDER_ID, CUSTOMER_ID);

    expect(mockOnPaymentSuccess).toHaveBeenCalledTimes(1);
    expect(mockOnPaymentSuccess).toHaveBeenCalledWith(ORDER_ID);
  });

  it("payment record has payment_method = 'paypal' and metadata with paypal_order_id", async () => {
    const orderChain = mockQuery({ data: orderWithPaypal });
    const updateChain = mockQuery({ data: null });
    const insertChain = mockQuery({ data: null });
    mockFrom
      .mockReturnValueOnce(orderChain)
      .mockReturnValueOnce(updateChain)
      .mockReturnValueOnce(insertChain);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "PP-123",
        status: "COMPLETED",
        purchase_units: [{ payments: { captures: [{ id: "CAP-789" }] } }],
      }),
    });
    mockOnPaymentSuccess.mockResolvedValue(undefined);

    await PayPalService.captureOrder(ORDER_ID, CUSTOMER_ID);

    expect(insertChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_method: "paypal",
        metadata: {
          paypal_order_id: "PAYPAL-ORDER-123",
          capture_id: "CAP-789",
        },
      }),
    );
  });

  it("throws NOT_FOUND when order does not exist", async () => {
    const orderChain = mockQuery({ data: null, error: { message: "not found" } });
    mockFrom.mockReturnValueOnce(orderChain);

    await expect(PayPalService.captureOrder(ORDER_ID, CUSTOMER_ID)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("throws FORBIDDEN when wrong customer", async () => {
    const orderChain = mockQuery({
      data: { ...orderWithPaypal, customer_id: "different-customer" },
    });
    mockFrom.mockReturnValueOnce(orderChain);

    await expect(PayPalService.captureOrder(ORDER_ID, CUSTOMER_ID)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("does not throw when onPaymentSuccess hook fails", async () => {
    const orderChain = mockQuery({ data: orderWithPaypal });
    const updateChain = mockQuery({ data: null });
    const insertChain = mockQuery({ data: null });
    mockFrom
      .mockReturnValueOnce(orderChain)
      .mockReturnValueOnce(updateChain)
      .mockReturnValueOnce(insertChain);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "PP-123", status: "COMPLETED", purchase_units: [] }),
    });
    mockOnPaymentSuccess.mockRejectedValue(new Error("Hook exploded"));

    // Should not throw — payment is already captured
    const result = await PayPalService.captureOrder(ORDER_ID, CUSTOMER_ID);
    expect(result.status).toBe("paid");
  });
});
