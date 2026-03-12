const mockFrom = jest.fn();
const mockRpc = jest.fn();

jest.mock("../../src/config/supabase", () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

import { CreditService } from "../../src/services/credit.service";

function mockQuery(result: { data?: unknown; error?: unknown }) {
  const resolved = {
    data: result.data ?? null,
    error: result.error ?? null,
  };
  const chain: Record<string, jest.Mock> = {};
  const self = () => chain;
  chain.select = jest.fn(self);
  chain.insert = jest.fn(self);
  chain.upsert = jest.fn(self);
  chain.update = jest.fn(self);
  chain.eq = jest.fn(self);
  chain.single = jest.fn().mockResolvedValue(resolved);
  chain.then = jest
    .fn()
    .mockImplementation((resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(resolved).then(resolve, reject),
    );
  return chain;
}

const USER_ID = "user-uuid-001";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("CreditService.getCreditInfo", () => {
  it("returns correct values for user with credit record", async () => {
    const chain = mockQuery({
      data: {
        id: "credit-1",
        user_id: USER_ID,
        credit_limit: "50000.00",
        credit_used: "10000.00",
        eligible: true,
      },
    });
    mockFrom.mockReturnValueOnce(chain);

    const result = await CreditService.getCreditInfo(USER_ID);

    expect(result).toEqual({
      eligible: true,
      limit: 50000,
      used: 10000,
      available: 40000,
    });
  });

  it("returns defaults for user without credit record", async () => {
    const chain = mockQuery({ data: null, error: { message: "not found" } });
    mockFrom.mockReturnValueOnce(chain);

    const result = await CreditService.getCreditInfo(USER_ID);

    expect(result).toEqual({
      eligible: false,
      limit: 0,
      used: 0,
      available: 0,
    });
  });

  it("calculates available = limit - used correctly", async () => {
    const chain = mockQuery({
      data: {
        id: "c1",
        user_id: USER_ID,
        credit_limit: "25000.50",
        credit_used: "5000.25",
        eligible: true,
      },
    });
    mockFrom.mockReturnValueOnce(chain);

    const result = await CreditService.getCreditInfo(USER_ID);

    expect(result.available).toBeCloseTo(20000.25, 2);
    expect(result.limit).toBeCloseTo(25000.5, 2);
    expect(result.used).toBeCloseTo(5000.25, 2);
  });

  it("caps available at 0 when used > limit", async () => {
    const chain = mockQuery({
      data: {
        id: "c1",
        user_id: USER_ID,
        credit_limit: "1000.00",
        credit_used: "1500.00",
        eligible: true,
      },
    });
    mockFrom.mockReturnValueOnce(chain);

    const result = await CreditService.getCreditInfo(USER_ID);

    expect(result.available).toBe(0);
  });

  it("converts NUMERIC fields to JavaScript numbers", async () => {
    const chain = mockQuery({
      data: {
        id: "c1",
        user_id: USER_ID,
        credit_limit: "99999.99",
        credit_used: "12345.67",
        eligible: false,
      },
    });
    mockFrom.mockReturnValueOnce(chain);

    const result = await CreditService.getCreditInfo(USER_ID);

    expect(typeof result.limit).toBe("number");
    expect(typeof result.used).toBe("number");
    expect(typeof result.available).toBe("number");
    expect(result.limit).toBe(99999.99);
    expect(result.used).toBe(12345.67);
  });
});

describe("CreditService.checkCreditEligibility", () => {
  it("returns eligible: true for user with sufficient credit", async () => {
    const chain = mockQuery({
      data: {
        id: "c1",
        user_id: USER_ID,
        credit_limit: "50000.00",
        credit_used: "10000.00",
        eligible: true,
      },
    });
    mockFrom.mockReturnValueOnce(chain);

    const result = await CreditService.checkCreditEligibility(USER_ID, 5000);

    expect(result.eligible).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("returns ineligible for non-eligible user", async () => {
    const chain = mockQuery({
      data: {
        id: "c1",
        user_id: USER_ID,
        credit_limit: "50000.00",
        credit_used: "0.00",
        eligible: false,
      },
    });
    mockFrom.mockReturnValueOnce(chain);

    const result = await CreditService.checkCreditEligibility(USER_ID, 100);

    expect(result.eligible).toBe(false);
    expect(result.reason).toContain("not enabled");
  });

  it("returns ineligible with dollar amounts for insufficient credit", async () => {
    const chain = mockQuery({
      data: {
        id: "c1",
        user_id: USER_ID,
        credit_limit: "10000.00",
        credit_used: "9500.00",
        eligible: true,
      },
    });
    mockFrom.mockReturnValueOnce(chain);

    const result = await CreditService.checkCreditEligibility(USER_ID, 1000);

    expect(result.eligible).toBe(false);
    expect(result.reason).toContain("$500.00");
    expect(result.reason).toContain("$1000.00");
  });

  it("returns eligible when available exactly equals amount", async () => {
    const chain = mockQuery({
      data: {
        id: "c1",
        user_id: USER_ID,
        credit_limit: "5000.00",
        credit_used: "3000.00",
        eligible: true,
      },
    });
    mockFrom.mockReturnValueOnce(chain);

    const result = await CreditService.checkCreditEligibility(USER_ID, 2000);

    expect(result.eligible).toBe(true);
  });
});

describe("CreditService.deductCredit", () => {
  it("calls rpc with correct params on sufficient credit", async () => {
    mockRpc.mockResolvedValueOnce({ data: true, error: null });

    await CreditService.deductCredit(USER_ID, 500);

    expect(mockRpc).toHaveBeenCalledWith("deduct_credit", {
      p_user_id: USER_ID,
      p_amount: 500,
    });
  });

  it("throws INSUFFICIENT_CREDIT (409) when rpc returns false", async () => {
    mockRpc.mockResolvedValueOnce({ data: false, error: null });

    await expect(CreditService.deductCredit(USER_ID, 500)).rejects.toMatchObject({
      statusCode: 409,
      code: "INSUFFICIENT_CREDIT",
    });
  });

  it("throws CREDIT_ERROR (500) when rpc returns error", async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: "db error" } });

    await expect(CreditService.deductCredit(USER_ID, 500)).rejects.toMatchObject({
      statusCode: 500,
      code: "CREDIT_ERROR",
    });
  });
});

describe("CreditService.restoreCredit", () => {
  it("calls rpc with correct params", async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });

    await CreditService.restoreCredit(USER_ID, 500);

    expect(mockRpc).toHaveBeenCalledWith("restore_credit", {
      p_user_id: USER_ID,
      p_amount: 500,
    });
  });

  it("logs error but does not throw on rpc failure", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation();
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: "db error" } });

    await expect(CreditService.restoreCredit(USER_ID, 500)).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalledWith("Credit restoration failed:", expect.anything());
    consoleSpy.mockRestore();
  });
});

describe("CreditService.setupCredit", () => {
  it("creates/updates credit record via upsert", async () => {
    const chain = mockQuery({ data: null });
    mockFrom.mockReturnValueOnce(chain);

    await CreditService.setupCredit(USER_ID, { creditLimit: 75000, eligible: true });

    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: USER_ID,
        credit_limit: 75000,
        eligible: true,
      }),
      { onConflict: "user_id" },
    );
  });

  it("uses defaults when no options provided", async () => {
    const chain = mockQuery({ data: null });
    mockFrom.mockReturnValueOnce(chain);

    await CreditService.setupCredit(USER_ID);

    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: USER_ID,
        credit_limit: 50000,
        eligible: false,
      }),
      { onConflict: "user_id" },
    );
  });
});
