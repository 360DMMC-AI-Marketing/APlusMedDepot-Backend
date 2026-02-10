import { decode, sign } from "jsonwebtoken";
import type { Session, User } from "@supabase/supabase-js";

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
    },
    signInWithPassword: jest.fn(),
    getUser: jest.fn(),
    resetPasswordForEmail: jest.fn(),
    refreshSession: jest.fn(),
  },
  from: jest.fn(),
};

const mockSupabaseClient = mockSupabase;

const setupEnv = (): void => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  process.env.STRIPE_SECRET_KEY = "sk_test_123";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_123";
  process.env.RESEND_API_KEY = "resend_key";
  process.env.JWT_SECRET = "x".repeat(32);
  process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/test";
  process.env.NODE_ENV = "test";
  process.env.PORT = "3001";
};

const setupQueryMocks = () => {
  const usersQuery = buildQueryBuilder();
  const suppliersQuery = buildQueryBuilder();

  mockSupabase.from.mockImplementation((table: string) => {
    if (table === "users") {
      return usersQuery;
    }
    if (table === "suppliers") {
      return suppliersQuery;
    }
    return buildQueryBuilder();
  });

  return { usersQuery, suppliersQuery };
};

const getTokenExp = (token: string): number => {
  const decoded = decode(token, { json: true });
  if (!decoded || typeof decoded !== "object") {
    throw new Error("Invalid token");
  }
  const exp = (decoded as { exp?: unknown }).exp;
  if (typeof exp !== "number") {
    throw new Error("Invalid token");
  }
  return exp;
};

const loadAuthService = async () => {
  const module = await import("../../src/services/auth.service");
  return module.AuthService;
};

describe("AuthService", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.resetAllMocks();
    setupEnv();
    mockCreateClient.mockReturnValue(mockSupabaseClient);
  });

  it("signUp success customer", async () => {
    const AuthService = await loadAuthService();
    const { usersQuery, suppliersQuery } = setupQueryMocks();

    const authUser = {
      id: "user-1",
      email: "customer@example.com",
      password_hash: "hashed-password",
    } as unknown as User;
    const session = {
      access_token: "access-token",
      refresh_token: "refresh-token",
      expires_at: 1700000000,
    } as unknown as Session;
    const userRow = {
      id: authUser.id,
      email: authUser.email,
      first_name: "Jane",
      last_name: "Doe",
      company_name: null,
      phone: null,
      role: "customer",
      status: "pending",
      last_login: null,
    };

    mockSupabase.auth.admin.createUser.mockResolvedValue({ data: { user: authUser }, error: null });
    usersQuery.single.mockResolvedValueOnce({ data: userRow, error: null });
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: authUser, session },
      error: null,
    });

    const result = await AuthService.signUp(
      "customer@example.com",
      "password123",
      "Jane",
      "Doe",
      null,
      null,
      "customer",
    );

    expect(result.user).toEqual({
      id: "user-1",
      email: "customer@example.com",
      firstName: "Jane",
      lastName: "Doe",
      companyName: null,
      phone: null,
      role: "customer",
      status: "pending",
      lastLogin: null,
    });
    expect(result.session).toEqual({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresAt: 1700000000,
    });
    expect(suppliersQuery.insert).not.toHaveBeenCalled();
  });

  it("signUp success supplier creates supplier record", async () => {
    const AuthService = await loadAuthService();
    const { usersQuery, suppliersQuery } = setupQueryMocks();

    const authUser = {
      id: "user-2",
      email: "supplier@example.com",
      password_hash: "hashed-password",
    } as unknown as User;
    const session = {
      access_token: "access-token",
      refresh_token: "refresh-token",
      expires_at: 1700000001,
    } as unknown as Session;
    const userRow = {
      id: authUser.id,
      email: authUser.email,
      first_name: "Sam",
      last_name: "Supplier",
      company_name: "Supply Co",
      phone: "555-0101",
      role: "supplier",
      status: "pending",
      last_login: null,
    };

    mockSupabase.auth.admin.createUser.mockResolvedValue({ data: { user: authUser }, error: null });
    usersQuery.single.mockResolvedValueOnce({ data: userRow, error: null });
    suppliersQuery.single.mockResolvedValueOnce({ data: { id: "supplier-1" }, error: null });
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: authUser, session },
      error: null,
    });

    const result = await AuthService.signUp(
      "supplier@example.com",
      "password123",
      "Sam",
      "Supplier",
      "Supply Co",
      "555-0101",
      "supplier",
    );

    expect(result.user.role).toBe("supplier");
    expect(suppliersQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-2",
        business_name: "Supply Co",
        status: "pending",
      }),
    );
  });

  it("signUp duplicate email error", async () => {
    const AuthService = await loadAuthService();
    setupQueryMocks();

    mockSupabase.auth.admin.createUser.mockResolvedValue({
      data: { user: null },
      error: { message: "User already registered" },
    });

    await expect(
      AuthService.signUp("dup@example.com", "password123", "Dupe", "User", null, null, "customer"),
    ).rejects.toThrow("Email already in use");
  });

  it("signIn success updates last_login", async () => {
    const AuthService = await loadAuthService();
    const { usersQuery } = setupQueryMocks();

    const authUser = {
      id: "user-3",
      email: "approved@example.com",
    } as unknown as User;
    const session = {
      access_token: "access-token",
      refresh_token: "refresh-token",
      expires_at: 1700000002,
    } as unknown as Session;
    const userRow = {
      id: authUser.id,
      email: authUser.email,
      first_name: "Approved",
      last_name: "User",
      company_name: null,
      phone: null,
      role: "customer",
      status: "approved",
      last_login: null,
    };
    const updatedRow = {
      ...userRow,
      last_login: "2026-02-10T00:00:00.000Z",
    };

    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: authUser, session },
      error: null,
    });
    usersQuery.single
      .mockResolvedValueOnce({ data: userRow, error: null })
      .mockResolvedValueOnce({ data: updatedRow, error: null });

    const result = await AuthService.signIn("approved@example.com", "password123");

    expect(usersQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        last_login: expect.any(String),
      }),
    );
    expect(result.user.lastLogin).toBe("2026-02-10T00:00:00.000Z");
  });

  it("signIn wrong password", async () => {
    const AuthService = await loadAuthService();
    setupQueryMocks();

    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Invalid login credentials" },
    });

    await expect(AuthService.signIn("nope@example.com", "badpass")).rejects.toThrow(
      "Invalid email or password",
    );
  });

  it("signIn pending user rejected", async () => {
    const AuthService = await loadAuthService();
    const { usersQuery } = setupQueryMocks();

    const authUser = {
      id: "user-4",
      email: "pending@example.com",
    } as unknown as User;
    const session = {
      access_token: "access-token",
      refresh_token: "refresh-token",
      expires_at: 1700000003,
    } as unknown as Session;
    const pendingRow = {
      id: authUser.id,
      email: authUser.email,
      first_name: "Pending",
      last_name: "User",
      company_name: null,
      phone: null,
      role: "customer",
      status: "pending",
      last_login: null,
    };

    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: authUser, session },
      error: null,
    });
    usersQuery.single.mockResolvedValueOnce({ data: pendingRow, error: null });

    await expect(AuthService.signIn("pending@example.com", "password123")).rejects.toThrow(
      "Account pending approval",
    );
    expect(usersQuery.update).not.toHaveBeenCalled();
  });

  it("getSession valid token returns user and session", async () => {
    const AuthService = await loadAuthService();
    const { usersQuery } = setupQueryMocks();

    const authUser = {
      id: "user-5",
      email: "session@example.com",
    } as unknown as User;
    const userRow = {
      id: authUser.id,
      email: authUser.email,
      first_name: "Session",
      last_name: "User",
      company_name: null,
      phone: null,
      role: "customer",
      status: "approved",
      last_login: null,
    };

    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: authUser }, error: null });
    usersQuery.single.mockResolvedValueOnce({ data: userRow, error: null });

    const token = sign({ sub: authUser.id }, process.env.JWT_SECRET ?? "x".repeat(32), {
      expiresIn: "1h",
    });
    const exp = getTokenExp(token);

    const result = await AuthService.getSession(token);

    expect(result.user.email).toBe("session@example.com");
    expect(result.session).toEqual({
      accessToken: token,
      refreshToken: "",
      expiresAt: exp,
    });
  });

  it("getSession invalid token throws", async () => {
    const AuthService = await loadAuthService();
    setupQueryMocks();

    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "Invalid JWT" },
    });

    await expect(AuthService.getSession("bad-token")).rejects.toThrow("Invalid token");
  });

  it("verifyToken valid token returns user", async () => {
    const AuthService = await loadAuthService();
    const { usersQuery } = setupQueryMocks();

    const authUser = {
      id: "user-6",
      email: "verify@example.com",
    } as unknown as User;
    const userRow = {
      id: authUser.id,
      email: authUser.email,
      first_name: "Verify",
      last_name: "User",
      company_name: null,
      phone: null,
      role: "customer",
      status: "approved",
      last_login: null,
    };

    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: authUser }, error: null });
    usersQuery.single.mockResolvedValueOnce({ data: userRow, error: null });

    const result = await AuthService.verifyToken("valid-token");
    expect(result.email).toBe("verify@example.com");
  });

  it("verifyToken expired token throws", async () => {
    const AuthService = await loadAuthService();
    setupQueryMocks();

    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "JWT expired" },
    });

    await expect(AuthService.verifyToken("expired-token")).rejects.toThrow("Token expired");
  });

  it("verifyToken invalid token throws", async () => {
    const AuthService = await loadAuthService();
    setupQueryMocks();

    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "invalid signature" },
    });

    await expect(AuthService.verifyToken("invalid-token")).rejects.toThrow("Invalid token");
  });
});
