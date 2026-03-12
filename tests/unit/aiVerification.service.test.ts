const mockFrom = jest.fn();

jest.mock("../../src/config/supabase", () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

const mockMessagesCreate = jest.fn();

jest.mock("@anthropic-ai/sdk", () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      messages: {
        create: mockMessagesCreate,
      },
    })),
  };
});

import { AIVerificationService } from "../../src/services/aiVerification.service";

const VENDOR_ID = "v0000000-0000-4000-8000-000000000001";

const baseVendor = {
  id: VENDOR_ID,
  business_name: "MedSupply Corp",
  tax_id: "12-3456789",
  business_type: "LLC",
  address: { street: "123 Main St", city: "Dallas", state: "TX", zip: "75001" },
  phone: "555-123-4567",
  product_categories: ["medical", "surgical"],
  years_in_business: 5,
  status: "pending",
  created_at: "2026-01-15T00:00:00Z",
  users: {
    email: "vendor@example.com",
    first_name: "John",
    last_name: "Doe",
  },
};

const validAIResponse: Record<string, unknown> = {
  score: 85,
  recommendation: "approve",
  checks: {
    businessInfo: { passed: true, notes: "Business info is complete" },
    documentation: { passed: true, notes: "Documents verified" },
    riskAssessment: { passed: true, notes: "Low risk profile" },
  },
  missingItems: [],
  riskFactors: [],
};

function mockQuery(result: { data?: unknown; error?: unknown }) {
  const resolved = {
    data: result.data ?? null,
    error: result.error ?? null,
  };
  const chain: Record<string, jest.Mock> = {};
  const self = () => chain;
  chain.select = jest.fn(self);
  chain.eq = jest.fn(self);
  chain.single = jest.fn().mockResolvedValue(resolved);
  chain.then = jest
    .fn()
    .mockImplementation((resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(resolved).then(resolve, reject),
    );
  return chain;
}

const originalEnv = process.env.ANTHROPIC_API_KEY;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.ANTHROPIC_API_KEY = "test-key";
});

afterAll(() => {
  process.env.ANTHROPIC_API_KEY = originalEnv;
});

describe("AIVerificationService.verifyVendor", () => {
  it("returns structured result with score, recommendation, checks, missingItems, riskFactors", async () => {
    const vendorChain = mockQuery({ data: baseVendor });
    const docsChain = mockQuery({ data: [] });
    mockFrom.mockReturnValueOnce(vendorChain).mockReturnValueOnce(docsChain);

    mockMessagesCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: JSON.stringify(validAIResponse) }],
    });

    const result = await AIVerificationService.verifyVendor(VENDOR_ID);

    expect(result.score).toBe(85);
    expect(result.recommendation).toBe("approve");
    expect(result.checks.businessInfo.passed).toBe(true);
    expect(result.checks.documentation.passed).toBe(true);
    expect(result.checks.riskAssessment.passed).toBe(true);
    expect(result.missingItems).toEqual([]);
    expect(result.riskFactors).toEqual([]);
  });

  it("throws NOT_FOUND when vendor does not exist", async () => {
    const vendorChain = mockQuery({ data: null, error: { message: "not found" } });
    mockFrom.mockReturnValueOnce(vendorChain);

    await expect(AIVerificationService.verifyVendor(VENDOR_ID)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("throws SERVICE_UNAVAILABLE (503) when Anthropic not configured", async () => {
    process.env.ANTHROPIC_API_KEY = "";

    await expect(AIVerificationService.verifyVendor(VENDOR_ID)).rejects.toMatchObject({
      statusCode: 503,
    });
  });

  it("throws AI_SERVICE_ERROR (502) when Anthropic API throws", async () => {
    const vendorChain = mockQuery({ data: baseVendor });
    const docsChain = mockQuery({ data: [] });
    mockFrom.mockReturnValueOnce(vendorChain).mockReturnValueOnce(docsChain);

    mockMessagesCreate.mockRejectedValueOnce(new Error("Rate limited"));

    const consoleSpy = jest.spyOn(console, "error").mockImplementation();

    await expect(AIVerificationService.verifyVendor(VENDOR_ID)).rejects.toMatchObject({
      statusCode: 502,
      code: "AI_SERVICE_ERROR",
    });

    consoleSpy.mockRestore();
  });

  it("returns fallback result when Claude returns malformed JSON", async () => {
    const vendorChain = mockQuery({ data: baseVendor });
    const docsChain = mockQuery({ data: [] });
    mockFrom.mockReturnValueOnce(vendorChain).mockReturnValueOnce(docsChain);

    mockMessagesCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "This is not JSON at all" }],
    });

    const consoleSpy = jest.spyOn(console, "error").mockImplementation();

    const result = await AIVerificationService.verifyVendor(VENDOR_ID);

    expect(result.score).toBe(0);
    expect(result.recommendation).toBe("review");
    expect(result.missingItems).toContain("AI verification needs to be re-run");

    consoleSpy.mockRestore();
  });

  it("parses valid JSON correctly", async () => {
    const vendorChain = mockQuery({ data: baseVendor });
    const docsChain = mockQuery({ data: [] });
    mockFrom.mockReturnValueOnce(vendorChain).mockReturnValueOnce(docsChain);

    const response = {
      score: 72,
      recommendation: "review",
      checks: {
        businessInfo: { passed: true, notes: "OK" },
        documentation: { passed: false, notes: "Missing license" },
        riskAssessment: { passed: true, notes: "Medium risk" },
      },
      missingItems: ["Business license"],
      riskFactors: ["New business"],
    };

    mockMessagesCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: JSON.stringify(response) }],
    });

    const result = await AIVerificationService.verifyVendor(VENDOR_ID);

    expect(result.score).toBe(72);
    expect(result.recommendation).toBe("review");
    expect(result.missingItems).toEqual(["Business license"]);
    expect(result.riskFactors).toEqual(["New business"]);
  });

  it("clamps score to 0-100 range (150 → 100)", async () => {
    const vendorChain = mockQuery({ data: baseVendor });
    const docsChain = mockQuery({ data: [] });
    mockFrom.mockReturnValueOnce(vendorChain).mockReturnValueOnce(docsChain);

    mockMessagesCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({ ...validAIResponse, score: 150 }),
        },
      ],
    });

    const result = await AIVerificationService.verifyVendor(VENDOR_ID);

    expect(result.score).toBe(100);
  });

  it("clamps negative score to 0", async () => {
    const vendorChain = mockQuery({ data: baseVendor });
    const docsChain = mockQuery({ data: [] });
    mockFrom.mockReturnValueOnce(vendorChain).mockReturnValueOnce(docsChain);

    mockMessagesCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({ ...validAIResponse, score: -20 }),
        },
      ],
    });

    const result = await AIVerificationService.verifyVendor(VENDOR_ID);

    expect(result.score).toBe(0);
  });

  it("defaults invalid recommendation to 'review'", async () => {
    const vendorChain = mockQuery({ data: baseVendor });
    const docsChain = mockQuery({ data: [] });
    mockFrom.mockReturnValueOnce(vendorChain).mockReturnValueOnce(docsChain);

    mockMessagesCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            ...validAIResponse,
            recommendation: "maybe",
          }),
        },
      ],
    });

    const result = await AIVerificationService.verifyVendor(VENDOR_ID);

    expect(result.recommendation).toBe("review");
  });

  it("fills missing fields with defaults", async () => {
    const vendorChain = mockQuery({ data: baseVendor });
    const docsChain = mockQuery({ data: [] });
    mockFrom.mockReturnValueOnce(vendorChain).mockReturnValueOnce(docsChain);

    mockMessagesCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: JSON.stringify({ score: 60 }) }],
    });

    const result = await AIVerificationService.verifyVendor(VENDOR_ID);

    expect(result.score).toBe(60);
    expect(result.recommendation).toBe("review");
    expect(result.checks.businessInfo.notes).toBe("Not assessed");
    expect(result.missingItems).toEqual([]);
    expect(result.riskFactors).toEqual([]);
  });

  it("uses correct model in API call", async () => {
    const vendorChain = mockQuery({ data: baseVendor });
    const docsChain = mockQuery({ data: [] });
    mockFrom.mockReturnValueOnce(vendorChain).mockReturnValueOnce(docsChain);

    mockMessagesCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: JSON.stringify(validAIResponse) }],
    });

    await AIVerificationService.verifyVendor(VENDOR_ID);

    expect(mockMessagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
      }),
    );
  });

  it("includes vendor data in prompt (business_name, tax_id)", async () => {
    const vendorChain = mockQuery({ data: baseVendor });
    const docsChain = mockQuery({ data: [] });
    mockFrom.mockReturnValueOnce(vendorChain).mockReturnValueOnce(docsChain);

    mockMessagesCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: JSON.stringify(validAIResponse) }],
    });

    await AIVerificationService.verifyVendor(VENDOR_ID);

    const callArgs = mockMessagesCreate.mock.calls[0][0];
    const userMessage = callArgs.messages[0].content;
    expect(userMessage).toContain("MedSupply Corp");
    expect(userMessage).toContain("12-3456789");
  });

  it("includes documents in prompt when they exist", async () => {
    const vendorChain = mockQuery({ data: baseVendor });
    const docsChain = mockQuery({
      data: [
        { document_type: "business_license", status: "verified", file_name: "license.pdf" },
        { document_type: "tax_certificate", status: "pending", file_name: "tax.pdf" },
      ],
    });
    mockFrom.mockReturnValueOnce(vendorChain).mockReturnValueOnce(docsChain);

    mockMessagesCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: JSON.stringify(validAIResponse) }],
    });

    await AIVerificationService.verifyVendor(VENDOR_ID);

    const callArgs = mockMessagesCreate.mock.calls[0][0];
    const userMessage = callArgs.messages[0].content;
    expect(userMessage).toContain("business_license");
    expect(userMessage).toContain("tax_certificate");
  });

  it("shows 'None' for documents when none exist", async () => {
    const vendorChain = mockQuery({ data: baseVendor });
    const docsChain = mockQuery({ data: [] });
    mockFrom.mockReturnValueOnce(vendorChain).mockReturnValueOnce(docsChain);

    mockMessagesCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: JSON.stringify(validAIResponse) }],
    });

    await AIVerificationService.verifyVendor(VENDOR_ID);

    const callArgs = mockMessagesCreate.mock.calls[0][0];
    const userMessage = callArgs.messages[0].content;
    expect(userMessage).toContain("Documents Submitted: None");
  });

  it("strips markdown code fences from response", async () => {
    const vendorChain = mockQuery({ data: baseVendor });
    const docsChain = mockQuery({ data: [] });
    mockFrom.mockReturnValueOnce(vendorChain).mockReturnValueOnce(docsChain);

    mockMessagesCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: "```json\n" + JSON.stringify(validAIResponse) + "\n```",
        },
      ],
    });

    const result = await AIVerificationService.verifyVendor(VENDOR_ID);

    expect(result.score).toBe(85);
    expect(result.recommendation).toBe("approve");
  });
});
