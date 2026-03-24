const mockSend = jest.fn();

jest.mock("resend", () => ({
  Resend: jest.fn(),
}));

const setupEnv = (): void => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  process.env.STRIPE_SECRET_KEY = "sk_test_123";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_123";
  process.env.RESEND_API_KEY = "resend_key";
  process.env.FROM_EMAIL = "orders@aplusmeddepot.com";
  process.env.JWT_SECRET = "x".repeat(32);
  process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/test";
  process.env.NODE_ENV = "test";
  process.env.PORT = "3001";
};

const setupResendMock = (): void => {
  const { Resend } = jest.requireMock("resend") as { Resend: jest.Mock };
  Resend.mockImplementation(() => ({ emails: { send: mockSend } }));
};

const loadEmailService = async () => {
  const module = await import("../../src/services/email.service");
  return module;
};

describe("email.service", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockSend.mockReset();
    setupEnv();
    setupResendMock();
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("sendEmail happy path calls Resend with expected payload", async () => {
    const { sendEmail } = await loadEmailService();
    mockSend.mockResolvedValueOnce({ id: "email_1" });

    await sendEmail("customer@example.com", "Subject line", "<p>Test</p>");

    expect(mockSend).toHaveBeenCalledWith({
      from: "orders@aplusmeddepot.com",
      to: "customer@example.com",
      subject: "Subject line",
      html: "<p>Test</p>",
    });
  });

  it("sendEmail failure logs error and does not throw", async () => {
    const { sendEmail } = await loadEmailService();
    mockSend.mockRejectedValue(new Error("fail"));

    await expect(
      sendEmail("customer@example.com", "Subject line", "<p>Test</p>"),
    ).resolves.toBeUndefined();

    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(console.error).toHaveBeenCalled();
  });

  it("sendEmail retry succeeds on second attempt", async () => {
    const { sendEmail } = await loadEmailService();
    mockSend.mockRejectedValueOnce(new Error("fail")).mockResolvedValueOnce({ id: "email_2" });

    await sendEmail("customer@example.com", "Subject line", "<p>Test</p>");

    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("sendEmail does not throw when both retries fail", async () => {
    const { sendEmail } = await loadEmailService();
    mockSend.mockRejectedValue(new Error("fail"));

    await expect(
      sendEmail("customer@example.com", "Subject line", "<p>Test</p>"),
    ).resolves.toBeUndefined();

    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it("sendOrderConfirmation uses subject containing order ID", async () => {
    const { sendOrderConfirmation } = await loadEmailService();
    mockSend.mockResolvedValueOnce({ id: "email_3" });

    sendOrderConfirmation(
      {
        id: "order_123",
        items: [{ name: "Item 1", quantity: 1, unitPrice: 10 }],
      },
      "customer@example.com",
    );

    expect(mockSend).toHaveBeenCalled();
    const payload = mockSend.mock.calls[0][0] as { subject?: string };
    expect(payload.subject).toContain("order_123");
  });

  it("sendSupplierNewOrder uses supplier email", async () => {
    const { sendSupplierNewOrder } = await loadEmailService();
    mockSend.mockResolvedValueOnce({ id: "email_4" });

    sendSupplierNewOrder(
      "supplier@example.com",
      [
        {
          name: "Item 1",
          quantity: 2,
          unitPrice: 5,
          commissionAmount: 1,
          supplierPayout: 9,
        },
      ],
      {
        line1: "123 Main St",
        city: "Austin",
        state: "TX",
        postalCode: "78701",
        country: "US",
      },
    );

    expect(mockSend).toHaveBeenCalled();
    const payload = mockSend.mock.calls[0][0] as { to?: string };
    expect(payload.to).toBe("supplier@example.com");
  });
});
