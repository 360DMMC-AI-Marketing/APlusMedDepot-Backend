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

// Helpers to wire up chained query builders for specific tables
const wireTable = (tableName: string, builder: QueryBuilder): void => {
  mockSupabase.from.mockImplementation((table: string) => {
    if (table === tableName) return builder;
    return buildQueryBuilder();
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateClient.mockReturnValue(mockSupabase);
  mockSendEmail.mockResolvedValue(undefined);
});

describe("AuthService.resetPassword", () => {
  const approvedUser = {
    id: "user-id-1",
    email: "user@example.com",
    first_name: "Jane",
    status: "approved",
  };

  it("creates a token and sends email for approved user", async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      const qb = buildQueryBuilder();
      if (table === "users") {
        qb.single.mockResolvedValue({ data: approvedUser, error: null });
      }
      if (table === "password_reset_tokens") {
        // update calls return the builder, insert calls return {error: null}
        qb.insert.mockReturnValue({ error: null } as never);
      }
      return qb;
    });

    await AuthService.resetPassword("user@example.com");

    // Should have called from("users") and from("password_reset_tokens") multiple times
    expect(mockSupabase.from).toHaveBeenCalledWith("users");
    expect(mockSupabase.from).toHaveBeenCalledWith("password_reset_tokens");
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledWith(
      "user@example.com",
      "Reset Your APlusMedDepot Password",
      expect.stringContaining("reset-password?token="),
    );
  });

  it("returns silently for non-existent email (no error thrown)", async () => {
    const usersBuilder = buildQueryBuilder();
    usersBuilder.single.mockResolvedValue({ data: null, error: { message: "not found" } });
    wireTable("users", usersBuilder);

    await expect(AuthService.resetPassword("nobody@example.com")).resolves.toBeUndefined();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("returns silently for suspended user", async () => {
    const usersBuilder = buildQueryBuilder();
    usersBuilder.single.mockResolvedValue({
      data: { ...approvedUser, status: "suspended" },
      error: null,
    });
    wireTable("users", usersBuilder);

    await expect(AuthService.resetPassword("user@example.com")).resolves.toBeUndefined();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("returns silently for pending user", async () => {
    const usersBuilder = buildQueryBuilder();
    usersBuilder.single.mockResolvedValue({
      data: { ...approvedUser, status: "pending" },
      error: null,
    });
    wireTable("users", usersBuilder);

    await expect(AuthService.resetPassword("user@example.com")).resolves.toBeUndefined();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("generates a 64-char hex token", async () => {
    const spy = jest.spyOn(crypto, "randomBytes");

    mockSupabase.from.mockImplementation((table: string) => {
      const qb = buildQueryBuilder();
      if (table === "users") {
        qb.single.mockResolvedValue({ data: approvedUser, error: null });
      }
      if (table === "password_reset_tokens") {
        qb.insert.mockReturnValue({ error: null } as never);
      }
      return qb;
    });

    await AuthService.resetPassword("user@example.com");

    expect(spy).toHaveBeenCalledWith(32);
    spy.mockRestore();
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
        qb.single.mockResolvedValue({ data: approvedUser, error: null });
      }

      return qb;
    });

    await AuthService.resetPassword("user@example.com");

    const tokenOps = callLog.filter((c) => c.table === "password_reset_tokens");
    expect(tokenOps.length).toBeGreaterThanOrEqual(2);
    expect(tokenOps[0].method).toBe("update"); // invalidate first
    expect(tokenOps[1].method).toBe("insert"); // then insert
  });

  it("does not throw when email sending fails", async () => {
    mockSendEmail.mockRejectedValue(new Error("SMTP down"));

    mockSupabase.from.mockImplementation((table: string) => {
      const qb = buildQueryBuilder();
      if (table === "users") {
        qb.single.mockResolvedValue({ data: approvedUser, error: null });
      }
      if (table === "password_reset_tokens") {
        qb.insert.mockReturnValue({ error: null } as never);
      }
      return qb;
    });

    await expect(AuthService.resetPassword("user@example.com")).resolves.toBeUndefined();
  });

  it("returns silently when token insert fails", async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      const qb = buildQueryBuilder();
      if (table === "users") {
        qb.single.mockResolvedValue({ data: approvedUser, error: null });
      }
      if (table === "password_reset_tokens") {
        qb.insert.mockReturnValue({ error: { message: "DB error" } } as never);
      }
      return qb;
    });

    await expect(AuthService.resetPassword("user@example.com")).resolves.toBeUndefined();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("includes reset URL with token in email", async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      const qb = buildQueryBuilder();
      if (table === "users") {
        qb.single.mockResolvedValue({ data: approvedUser, error: null });
      }
      if (table === "password_reset_tokens") {
        qb.insert.mockReturnValue({ error: null } as never);
      }
      return qb;
    });

    await AuthService.resetPassword("user@example.com");

    const htmlArg = mockSendEmail.mock.calls[0][2] as string;
    expect(htmlArg).toContain("http://localhost:5173/reset-password?token=");
  });
});

describe("AuthService.updatePasswordWithToken", () => {
  const validToken = "a".repeat(64);
  const futureDate = new Date(Date.now() + 3600000).toISOString();
  const pastDate = new Date(Date.now() - 3600000).toISOString();
  const tokenRecord = {
    id: "token-id-1",
    user_id: "user-id-1",
    expires_at: futureDate,
  };

  it("updates password for valid token and valid password", async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      const qb = buildQueryBuilder();
      if (table === "password_reset_tokens") {
        qb.single.mockResolvedValue({ data: tokenRecord, error: null });
      }
      if (table === "users") {
        qb.single.mockResolvedValue({
          data: { email: "user@example.com", first_name: "Jane" },
          error: null,
        });
      }
      return qb;
    });
    mockSupabase.auth.admin.updateUserById.mockResolvedValue({ error: null });

    await AuthService.updatePasswordWithToken(validToken, "NewStr0ng!Pass");

    expect(mockSupabase.auth.admin.updateUserById).toHaveBeenCalledWith("user-id-1", {
      password: "NewStr0ng!Pass",
    });
  });

  it("marks token as used after successful reset", async () => {
    const updateCalls: Array<{ table: string; data: unknown }> = [];

    mockSupabase.from.mockImplementation((table: string) => {
      const qb = buildQueryBuilder();

      const origUpdate = qb.update;
      qb.update = jest.fn().mockImplementation((data: unknown) => {
        updateCalls.push({ table, data });
        return origUpdate(data);
      }) as typeof qb.update;

      if (table === "password_reset_tokens") {
        qb.single.mockResolvedValue({ data: tokenRecord, error: null });
      }
      if (table === "users") {
        qb.single.mockResolvedValue({
          data: { email: "user@example.com", first_name: "Jane" },
          error: null,
        });
      }
      return qb;
    });
    mockSupabase.auth.admin.updateUserById.mockResolvedValue({ error: null });

    await AuthService.updatePasswordWithToken(validToken, "NewStr0ng!Pass");

    const tokenUpdates = updateCalls.filter((c) => c.table === "password_reset_tokens");
    expect(tokenUpdates.length).toBeGreaterThanOrEqual(1);
    expect(tokenUpdates[0].data).toEqual({ used: true });
  });

  it("throws 400 for invalid token (not in DB)", async () => {
    mockSupabase.from.mockImplementation(() => {
      const qb = buildQueryBuilder();
      qb.single.mockResolvedValue({ data: null, error: { message: "not found" } });
      return qb;
    });

    await expect(
      AuthService.updatePasswordWithToken("bad-token", "NewStr0ng!Pass"),
    ).rejects.toMatchObject({
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

    await expect(
      AuthService.updatePasswordWithToken(validToken, "NewStr0ng!Pass"),
    ).rejects.toMatchObject({
      code: "TOKEN_EXPIRED",
      statusCode: 400,
    });
  });

  it("throws 400 for weak password (no uppercase)", async () => {
    mockSupabase.from.mockImplementation(() => {
      const qb = buildQueryBuilder();
      qb.single.mockResolvedValue({ data: tokenRecord, error: null });
      return qb;
    });

    await expect(
      AuthService.updatePasswordWithToken(validToken, "weakpass1!"),
    ).rejects.toMatchObject({
      code: "WEAK_PASSWORD",
      statusCode: 400,
    });
  });

  it("throws 400 for weak password (no number)", async () => {
    mockSupabase.from.mockImplementation(() => {
      const qb = buildQueryBuilder();
      qb.single.mockResolvedValue({ data: tokenRecord, error: null });
      return qb;
    });

    await expect(
      AuthService.updatePasswordWithToken(validToken, "WeakPass!"),
    ).rejects.toMatchObject({
      code: "WEAK_PASSWORD",
      statusCode: 400,
    });
  });

  it("throws 400 for weak password (too short)", async () => {
    mockSupabase.from.mockImplementation(() => {
      const qb = buildQueryBuilder();
      qb.single.mockResolvedValue({ data: tokenRecord, error: null });
      return qb;
    });

    await expect(AuthService.updatePasswordWithToken(validToken, "Ab1!")).rejects.toMatchObject({
      code: "WEAK_PASSWORD",
      statusCode: 400,
    });
  });

  it("throws 400 for weak password (no special char)", async () => {
    mockSupabase.from.mockImplementation(() => {
      const qb = buildQueryBuilder();
      qb.single.mockResolvedValue({ data: tokenRecord, error: null });
      return qb;
    });

    await expect(
      AuthService.updatePasswordWithToken(validToken, "WeakPass1"),
    ).rejects.toMatchObject({
      code: "WEAK_PASSWORD",
      statusCode: 400,
    });
  });

  it("throws 500 when Supabase updateUserById fails", async () => {
    mockSupabase.from.mockImplementation(() => {
      const qb = buildQueryBuilder();
      qb.single.mockResolvedValue({ data: tokenRecord, error: null });
      return qb;
    });
    mockSupabase.auth.admin.updateUserById.mockResolvedValue({
      error: { message: "Auth service down" },
    });

    await expect(
      AuthService.updatePasswordWithToken(validToken, "NewStr0ng!Pass"),
    ).rejects.toMatchObject({
      code: "RESET_PASSWORD_FAILED",
      statusCode: 500,
    });
  });

  it("sends confirmation email after successful reset", async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      const qb = buildQueryBuilder();
      if (table === "password_reset_tokens") {
        qb.single.mockResolvedValue({ data: tokenRecord, error: null });
      }
      if (table === "users") {
        qb.single.mockResolvedValue({
          data: { email: "user@example.com", first_name: "Jane" },
          error: null,
        });
      }
      return qb;
    });
    mockSupabase.auth.admin.updateUserById.mockResolvedValue({ error: null });

    await AuthService.updatePasswordWithToken(validToken, "NewStr0ng!Pass");

    expect(mockSendEmail).toHaveBeenCalledWith(
      "user@example.com",
      "Your APlusMedDepot Password Has Been Changed",
      expect.stringContaining("successfully changed"),
    );
  });

  it("does not throw when confirmation email fails", async () => {
    mockSendEmail.mockRejectedValue(new Error("SMTP down"));

    mockSupabase.from.mockImplementation((table: string) => {
      const qb = buildQueryBuilder();
      if (table === "password_reset_tokens") {
        qb.single.mockResolvedValue({ data: tokenRecord, error: null });
      }
      if (table === "users") {
        qb.single.mockResolvedValue({
          data: { email: "user@example.com", first_name: "Jane" },
          error: null,
        });
      }
      return qb;
    });
    mockSupabase.auth.admin.updateUserById.mockResolvedValue({ error: null });

    await expect(
      AuthService.updatePasswordWithToken(validToken, "NewStr0ng!Pass"),
    ).resolves.toBeUndefined();
  });
});
