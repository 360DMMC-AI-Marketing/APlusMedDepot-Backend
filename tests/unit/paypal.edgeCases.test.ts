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

const mockGetPayPalAccessToken = jest.fn();

jest.mock("../../src/config/paypal", () => ({
  getPayPalAccessToken: (...args: unknown[]) => mockGetPayPalAccessToken(...args),
  isPayPalConfigured: jest.fn().mockReturnValue(true),
  PAYPAL_API_BASE: "https://api-m.sandbox.paypal.com",
}));

import { PayPalService } from "../../src/services/paypal.service";

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
  chain.single = jest.fn().mockResolvedValue(resolved);
  chain.then = jest
    .fn()
    .mockImplementation((resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(resolved).then(resolve, reject),
    );
  return chain;
}

const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  jest.clearAllMocks();
  mockGetPayPalAccessToken.mockResolvedValue("mock-access-token");
});

describe("PayPal edge cases", () => {
  describe("token refresh failure", () => {
    it("throws when getPayPalAccessToken fails during createOrder", async () => {
      const orderChain = mockQuery({ data: baseOrder });
      mockFrom.mockReturnValueOnce(orderChain);

      mockGetPayPalAccessToken.mockRejectedValueOnce(
        new Error("PayPal auth failed: 401 Unauthorized"),
      );

      await expect(PayPalService.createOrder(ORDER_ID, CUSTOMER_ID)).rejects.toThrow(
        "PayPal auth failed",
      );

      // No fetch call should have been made
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("throws when getPayPalAccessToken fails during captureOrder", async () => {
      const orderChain = mockQuery({
        data: { ...baseOrder, paypal_order_id: "PP-123", payment_status: "processing" },
      });
      mockFrom.mockReturnValueOnce(orderChain);

      mockGetPayPalAccessToken.mockRejectedValueOnce(
        new Error("PayPal credentials not configured"),
      );

      await expect(PayPalService.captureOrder(ORDER_ID, CUSTOMER_ID)).rejects.toThrow(
        "PayPal credentials not configured",
      );

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("capture with missing capture_id in response", () => {
    it("stores null capture_id when purchase_units is empty", async () => {
      const orderChain = mockQuery({
        data: { ...baseOrder, paypal_order_id: "PP-123", payment_status: "processing" },
      });
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

      const result = await PayPalService.captureOrder(ORDER_ID, CUSTOMER_ID);

      expect(result.status).toBe("paid");
      expect(insertChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ capture_id: null }),
        }),
      );
    });

    it("stores null capture_id when captures array is missing", async () => {
      const orderChain = mockQuery({
        data: { ...baseOrder, paypal_order_id: "PP-123", payment_status: "processing" },
      });
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
          purchase_units: [{ payments: {} }],
        }),
      });
      mockOnPaymentSuccess.mockResolvedValue(undefined);

      await PayPalService.captureOrder(ORDER_ID, CUSTOMER_ID);

      expect(insertChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ capture_id: null }),
        }),
      );
    });
  });

  describe("non-JSON error from PayPal API", () => {
    it("throws 502 when PayPal returns HTML error page on create", async () => {
      const orderChain = mockQuery({ data: baseOrder });
      mockFrom.mockReturnValueOnce(orderChain);

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => "<html><body>Service Unavailable</body></html>",
      });

      const consoleSpy = jest.spyOn(console, "error").mockImplementation();

      await expect(PayPalService.createOrder(ORDER_ID, CUSTOMER_ID)).rejects.toMatchObject({
        statusCode: 502,
        code: "PAYPAL_ERROR",
      });

      consoleSpy.mockRestore();
    });

    it("throws 502 when PayPal returns HTML error page on capture", async () => {
      const orderChain = mockQuery({
        data: { ...baseOrder, paypal_order_id: "PP-123", payment_status: "processing" },
      });
      mockFrom.mockReturnValueOnce(orderChain);

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "<html><body>Internal Server Error</body></html>",
      });

      const consoleSpy = jest.spyOn(console, "error").mockImplementation();

      await expect(PayPalService.captureOrder(ORDER_ID, CUSTOMER_ID)).rejects.toMatchObject({
        statusCode: 502,
        code: "PAYPAL_ERROR",
      });

      consoleSpy.mockRestore();
    });
  });

  describe("captureOrder with missing status in response", () => {
    it("returns 'unknown' when capture response has no status", async () => {
      const orderChain = mockQuery({
        data: { ...baseOrder, paypal_order_id: "PP-123", payment_status: "processing" },
      });
      mockFrom.mockReturnValueOnce(orderChain);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "PP-123" }),
      });

      const result = await PayPalService.captureOrder(ORDER_ID, CUSTOMER_ID);

      expect(result.status).toBe("unknown");
      expect(result.paidAt).toBeNull();
    });
  });

  describe("createOrder with no approve link", () => {
    it("returns empty approvalUrl when no approve link in response", async () => {
      const orderChain = mockQuery({ data: baseOrder });
      const updateChain = mockQuery({ data: null });
      mockFrom.mockReturnValueOnce(orderChain).mockReturnValueOnce(updateChain);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "PP-123",
          status: "CREATED",
          links: [{ rel: "self", href: "https://api.paypal.com/self" }],
        }),
      });

      const result = await PayPalService.createOrder(ORDER_ID, CUSTOMER_ID);

      expect(result.approvalUrl).toBe("");
      expect(result.paypalOrderId).toBe("PP-123");
    });
  });
});
