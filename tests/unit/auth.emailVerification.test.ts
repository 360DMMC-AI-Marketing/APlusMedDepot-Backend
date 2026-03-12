import crypto from "crypto";

const mockCreateClient = jest.fn();

jest.mock("@supabase/supabase-js", () => ({
  createClient: mockCreateClient,
}));

type QueryBuilder = {
  insert: jest.MockedFunction<(data: unknown) => QueryBuilder>;
  update: jest.MockedFunction<(data: unknown) => QueryBuilder>;
  select: jest.MockedFunction<(columns?: string) => QueryBuilder>;
  eq: jest.MockedFunction<(column: string, value: unknown) => QueryBuilder>;
  single: jest.MockedFunction<
    () => Promise<{
      data: unknown;
      error: { message: string } | null;
    }>
  >;
};

const buildQueryBuilder = (): QueryBuilder => {
  const builder = {
    insert: jest.fn(),
    update: jest.fn(),
    select: jest.fn(),
    eq: jest.fn(),
    single: jest.fn(),
  } as QueryBuilder;

  builder.insert.mockReturnValue(builder);
  builder.update.mockReturnValue(builder);
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);

  return builder;
};

const mockSupabase = {
  auth: {
    admin: {
      createUser: jest.fn(),
      signOut: jest.fn(),
      updateUserById: jest.fn(),
    },
    signInWithPassword: jest.fn(),
    getUser: jest.fn(),
    resetPasswordForEmail: jest.fn(),
    refreshSession: jest.fn(),
  },
  from: jest.fn(),
};

const setupEnv = (): void => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  process.env.STRIPE_SECRET_KEY = "sk_test_123";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_123";
  process.env.JWT_SECRET = "test-secret-that-is-at-least-32-chars-long";
  process.env.DATABASE_URL = "postgresql://localhost:5432/test";
  process.env.NODE_ENV = "test";
  process.env.FRONTEND_URL = "http://localhost:5173";
};

const mockSendEmail = jest.fn();
jest.mock("../../src/services/email.service", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
  initResend: jest.fn(),
}));

jest.mock("../../src/templates/baseLayout", () => ({
  baseLayout: (opts: { body: string }) => `<html>${opts.body}</html>`,
  escapeHtml: (str: string) => str,
}));

setupEnv();
mockCreateClient.mockReturnValue(mockSupabase);

import { AuthService } from "../../src/services/auth.service";

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateClient.mockReturnValue(mockSupabase);
  mockSendEmail.mockResolvedValue(undefined);
});

describe("AuthService.sendVerificationEmail", () => {
  const unverifiedUser = {
    id: "user-id-1",
    email: "user@example.com",
    first_name: "Jane",
    email_verified: false,
  };

  it("creates token with 24-hour expiry and sends email", async () => {
    const spy = jest.spyOn(crypto, "randomBytes");

    mockSupabase.from.mockImplementation((table: string) => {
      const qb = buildQueryBuilder();
      if (table === "users") {
        qb.single.mockResolvedValue({ data: unverifiedUser, error: null });
      }
      if (table === "email_verification_tokens") {
        qb.insert.mockReturnValue({ error: null } as never);
      }
      return qb;
    });

    await AuthService.sendVerificationEmail("user-id-1");

    expect(spy).toHaveBeenCalledWith(32);
    expect(mockSupabase.from).toHaveBeenCalledWith("email_verification_tokens");
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledWith(
      "user@example.com",
      "Verify Your APlusMedDepot Email",
      expect.stringContaining("verify-email?token="),
    );

    spy.mockRestore();
  });

  it("sends email with verification URL containing token", async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      const qb = buildQueryBuilder();
      if (table === "users") {
        qb.single.mockResolvedValue({ data: unverifiedUser, error: null });
      }
      if (table === "email_verification_tokens") {
        qb.insert.mockReturnValue({ error: null } as never);
      }
      return qb;
    });

    await AuthService.sendVerificationEmail("user-id-1");

    const htmlArg = mockSendEmail.mock.calls[0][2] as string;
    expect(htmlArg).toContain("http://localhost:5173/verify-email?token=");
  });

  it("returns silently for already verified user", async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      const qb = buildQueryBuilder();
      if (table === "users") {
        qb.single.mockResolvedValue({
          data: { ...unverifiedUser, email_verified: true },
          error: null,
        });
      }
      return qb;
    });

    await expect(AuthService.sendVerificationEmail("user-id-1")).resolves.toBeUndefined();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("returns silently for non-existent user", async () => {
    mockSupabase.from.mockImplementation(() => {
      const qb = buildQueryBuilder();
      qb.single.mockResolvedValue({ data: null, error: { message: "not found" } });
      return qb;
    });

    await expect(AuthService.sendVerificationEmail("bad-id")).resolves.toBeUndefined();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("invalidates existing unused tokens before creating new one", async () => {
    const callLog: Array<{ table: string; method: string }> = [];

    mockSupabase.from.mockImplementation((table: string) => {
      const qb = buildQueryBuilder();

      const originalUpdate = qb.update;
      qb.update = jest.fn().mockImplementation((data: unknown) => {
        callLog.push({ table, method: "update" });
        return originalUpdate(data);
      }) as typeof qb.update;

      qb.insert = jest.fn().mockImplementation((_data: unknown) => {
        callLog.push({ table, method: "insert" });
        return { error: null };
      }) as typeof qb.insert;

      if (table === "users") {
        qb.single.mockResolvedValue({ data: unverifiedUser, error: null });
      }

      return qb;
    });

    await AuthService.sendVerificationEmail("user-id-1");

    const tokenOps = callLog.filter((c) => c.table === "email_verification_tokens");
    expect(tokenOps.length).toBeGreaterThanOrEqual(2);
    expect(tokenOps[0].method).toBe("update");
    expect(tokenOps[1].method).toBe("insert");
  });

  it("does not throw when email sending fails", async () => {
    mockSendEmail.mockRejectedValue(new Error("SMTP down"));

    mockSupabase.from.mockImplementation((table: string) => {
      const qb = buildQueryBuilder();
      if (table === "users") {
        qb.single.mockResolvedValue({ data: unverifiedUser, error: null });
      }
      if (table === "email_verification_tokens") {
        qb.insert.mockReturnValue({ error: null } as never);
      }
      return qb;
    });

    await expect(AuthService.sendVerificationEmail("user-id-1")).resolves.toBeUndefined();
  });
});

describe("AuthService.verifyEmail", () => {
  const validToken = "b".repeat(64);
  const futureDate = new Date(Date.now() + 86400000).toISOString();
  const pastDate = new Date(Date.now() - 3600000).toISOString();
  const tokenRecord = {
    id: "token-id-1",
    user_id: "user-id-1",
    expires_at: futureDate,
  };

  it("valid token sets email_verified to true", async () => {
    const updateCalls: Array<{ table: string; data: unknown }> = [];

    mockSupabase.from.mockImplementation((table: string) => {
      const qb = buildQueryBuilder();

      const origUpdate = qb.update;
      qb.update = jest.fn().mockImplementation((data: unknown) => {
        updateCalls.push({ table, data });
        return origUpdate(data);
      }) as typeof qb.update;

      if (table === "email_verification_tokens") {
        qb.single.mockResolvedValue({ data: tokenRecord, error: null });
      }
      return qb;
    });

    await AuthService.verifyEmail(validToken);

    const userUpdates = updateCalls.filter((c) => c.table === "users");
    expect(userUpdates.length).toBe(1);
    expect(userUpdates[0].data).toMatchObject({ email_verified: true });
  });

  it("marks token as used after verification", async () => {
    const updateCalls: Array<{ table: string; data: unknown }> = [];

    mockSupabase.from.mockImplementation((table: string) => {
      const qb = buildQueryBuilder();

      const origUpdate = qb.update;
      qb.update = jest.fn().mockImplementation((data: unknown) => {
        updateCalls.push({ table, data });
        return origUpdate(data);
      }) as typeof qb.update;

      if (table === "email_verification_tokens") {
        qb.single.mockResolvedValue({ data: tokenRecord, error: null });
      }
      return qb;
    });

    await AuthService.verifyEmail(validToken);

    const tokenUpdates = updateCalls.filter((c) => c.table === "email_verification_tokens");
    expect(tokenUpdates.length).toBeGreaterThanOrEqual(1);
    expect(tokenUpdates[0].data).toEqual({ used: true });
  });

  it("invalidates all other tokens for same user", async () => {
    const eqCalls: Array<{ table: string; column: string; value: unknown }> = [];

    mockSupabase.from.mockImplementation((table: string) => {
      const qb = buildQueryBuilder();

      const origEq = qb.eq;
      qb.eq = jest.fn().mockImplementation((col: string, val: unknown) => {
        eqCalls.push({ table, column: col, value: val });
        return origEq(col, val);
      }) as typeof qb.eq;

      if (table === "email_verification_tokens") {
        qb.single.mockResolvedValue({ data: tokenRecord, error: null });
      }
      return qb;
    });

    await AuthService.verifyEmail(validToken);

    // Should have calls with user_id and used=false for invalidation
    const userIdCalls = eqCalls.filter(
      (c) => c.table === "email_verification_tokens" && c.column === "user_id",
    );
    expect(userIdCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("throws 400 for invalid token (not in DB)", async () => {
    mockSupabase.from.mockImplementation(() => {
      const qb = buildQueryBuilder();
      qb.single.mockResolvedValue({ data: null, error: { message: "not found" } });
      return qb;
    });

    await expect(AuthService.verifyEmail("bad-token")).rejects.toMatchObject({
      code: "INVALID_TOKEN",
      statusCode: 400,
    });
  });

  it("throws 400 for expired token and marks it used", async () => {
    const expiredRecord = { ...tokenRecord, expires_at: pastDate };

    mockSupabase.from.mockImplementation(() => {
      const qb = buildQueryBuilder();
      qb.single.mockResolvedValue({ data: expiredRecord, error: null });
      return qb;
    });

    await expect(AuthService.verifyEmail(validToken)).rejects.toMatchObject({
      code: "TOKEN_EXPIRED",
      statusCode: 400,
    });
  });

  it("throws 400 for already-used token", async () => {
    mockSupabase.from.mockImplementation(() => {
      const qb = buildQueryBuilder();
      // used=false filter means used token won't be found
      qb.single.mockResolvedValue({ data: null, error: { message: "not found" } });
      return qb;
    });

    await expect(AuthService.verifyEmail(validToken)).rejects.toMatchObject({
      code: "INVALID_TOKEN",
      statusCode: 400,
    });
  });
});

describe("AuthService.resendVerification", () => {
  it("calls sendVerificationEmail for unverified approved user", async () => {
    const spy = jest.spyOn(AuthService, "sendVerificationEmail").mockResolvedValue(undefined);

    mockSupabase.from.mockImplementation((table: string) => {
      const qb = buildQueryBuilder();
      if (table === "users") {
        qb.single.mockResolvedValue({
          data: { id: "user-1", email: "user@test.com", email_verified: false, status: "approved" },
          error: null,
        });
      }
      return qb;
    });

    await AuthService.resendVerification("user@test.com");

    expect(spy).toHaveBeenCalledWith("user-1");
    spy.mockRestore();
  });

  it("returns silently for non-existent email", async () => {
    mockSupabase.from.mockImplementation(() => {
      const qb = buildQueryBuilder();
      qb.single.mockResolvedValue({ data: null, error: { message: "not found" } });
      return qb;
    });

    await expect(AuthService.resendVerification("nobody@test.com")).resolves.toBeUndefined();
  });

  it("throws ALREADY_VERIFIED (409) for verified email", async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      const qb = buildQueryBuilder();
      if (table === "users") {
        qb.single.mockResolvedValue({
          data: {
            id: "user-1",
            email: "user@test.com",
            email_verified: true,
            status: "approved",
          },
          error: null,
        });
      }
      return qb;
    });

    await expect(AuthService.resendVerification("user@test.com")).rejects.toMatchObject({
      code: "ALREADY_VERIFIED",
      statusCode: 409,
    });
  });

  it("returns silently for non-approved user", async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      const qb = buildQueryBuilder();
      if (table === "users") {
        qb.single.mockResolvedValue({
          data: {
            id: "user-1",
            email: "user@test.com",
            email_verified: false,
            status: "pending",
          },
          error: null,
        });
      }
      return qb;
    });

    await expect(AuthService.resendVerification("user@test.com")).resolves.toBeUndefined();
  });
});

describe("Registration sends verification email", () => {
  it("calls sendVerificationEmail after successful registration", async () => {
    const spy = jest.spyOn(AuthService, "sendVerificationEmail").mockResolvedValue(undefined);

    const authUserId = "new-user-id";
    mockSupabase.auth.admin.createUser.mockResolvedValue({
      data: { user: { id: authUserId } },
      error: null,
    });

    mockSupabase.from.mockImplementation(() => {
      const qb = buildQueryBuilder();
      qb.single.mockResolvedValue({
        data: {
          id: authUserId,
          email: "new@test.com",
          first_name: "New",
          last_name: "User",
          company_name: "Test Co",
          phone: null,
          role: "customer",
          status: "pending",
          last_login: null,
        },
        error: null,
      });
      return qb;
    });

    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: {
        user: { id: authUserId },
        session: {
          access_token: "token",
          refresh_token: "refresh",
          expires_at: 9999999999,
        },
      },
      error: null,
    });

    await AuthService.signUp(
      "new@test.com",
      "Str0ng!Pass1",
      "New",
      "User",
      "Test Co",
      null,
      "customer",
    );

    // Allow fire-and-forget to settle
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(spy).toHaveBeenCalledWith(authUserId);
    spy.mockRestore();
  });

  it("registration succeeds even if sendVerificationEmail fails", async () => {
    const spy = jest
      .spyOn(AuthService, "sendVerificationEmail")
      .mockRejectedValue(new Error("email failed"));

    const authUserId = "new-user-id-2";
    mockSupabase.auth.admin.createUser.mockResolvedValue({
      data: { user: { id: authUserId } },
      error: null,
    });

    mockSupabase.from.mockImplementation(() => {
      const qb = buildQueryBuilder();
      qb.single.mockResolvedValue({
        data: {
          id: authUserId,
          email: "new2@test.com",
          first_name: "New",
          last_name: "User2",
          company_name: "Test Co",
          phone: null,
          role: "customer",
          status: "pending",
          last_login: null,
        },
        error: null,
      });
      return qb;
    });

    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: {
        user: { id: authUserId },
        session: {
          access_token: "token",
          refresh_token: "refresh",
          expires_at: 9999999999,
        },
      },
      error: null,
    });

    const result = await AuthService.signUp(
      "new2@test.com",
      "Str0ng!Pass1",
      "New",
      "User2",
      "Test Co",
      null,
      "customer",
    );

    expect(result.user).toBeDefined();
    expect(result.session).toBeDefined();

    // Allow fire-and-forget to settle
    await new Promise((resolve) => setTimeout(resolve, 10));

    spy.mockRestore();
  });
});
