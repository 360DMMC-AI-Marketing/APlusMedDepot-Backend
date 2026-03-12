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
      updateUserById: jest.fn(),
    },
    signInWithPassword: jest.fn(),
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

import { UserProfileService } from "../../src/services/userProfile.service";

const customerUser = {
  id: "user-1",
  email: "customer@test.com",
  first_name: "Jane",
  last_name: "Doe",
  role: "customer",
  status: "approved",
  phone: "555-0100",
  company_name: "Test Corp",
  email_verified: true,
  created_at: "2025-01-01T00:00:00Z",
  last_login: "2025-03-01T00:00:00Z",
  updated_at: "2025-02-01T00:00:00Z",
};

const supplierUser = {
  ...customerUser,
  id: "user-2",
  email: "supplier@test.com",
  role: "supplier",
};

const supplierRecord = {
  id: "vendor-1",
  business_name: "Med Supplies Inc",
  commission_rate: "15.00",
  status: "approved",
  current_balance: "1250.50",
};

const adminUser = {
  ...customerUser,
  id: "user-3",
  email: "admin@test.com",
  role: "admin",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateClient.mockReturnValue(mockSupabase);
  mockSendEmail.mockResolvedValue(undefined);
});

describe("UserProfileService.getProfile", () => {
  it("returns customer profile with vendorId=null", async () => {
    mockSupabase.from.mockImplementation(() => {
      const qb = buildQueryBuilder();
      qb.single.mockResolvedValue({ data: customerUser, error: null });
      return qb;
    });

    const profile = await UserProfileService.getProfile("user-1");

    expect(profile.role).toBe("customer");
    expect(profile.vendorId).toBeNull();
    expect(profile.commissionRate).toBeNull();
    expect(profile.currentBalance).toBeNull();
    expect(profile.email).toBe("customer@test.com");
  });

  it("returns supplier profile with vendor data", async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      const qb = buildQueryBuilder();
      if (table === "users") {
        qb.single.mockResolvedValue({ data: supplierUser, error: null });
      }
      if (table === "suppliers") {
        qb.single.mockResolvedValue({ data: supplierRecord, error: null });
      }
      return qb;
    });

    const profile = await UserProfileService.getProfile("user-2");

    expect(profile.role).toBe("supplier");
    expect(profile.vendorId).toBe("vendor-1");
    expect(profile.commissionRate).toBe(15);
    expect(profile.vendorStatus).toBe("approved");
    expect(profile.currentBalance).toBe(1250.5);
  });

  it("returns admin profile without vendor data", async () => {
    mockSupabase.from.mockImplementation(() => {
      const qb = buildQueryBuilder();
      qb.single.mockResolvedValue({ data: adminUser, error: null });
      return qb;
    });

    const profile = await UserProfileService.getProfile("user-3");

    expect(profile.role).toBe("admin");
    expect(profile.vendorId).toBeNull();
  });

  it("converts commission_rate and current_balance to JavaScript numbers", async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      const qb = buildQueryBuilder();
      if (table === "users") {
        qb.single.mockResolvedValue({ data: supplierUser, error: null });
      }
      if (table === "suppliers") {
        qb.single.mockResolvedValue({ data: supplierRecord, error: null });
      }
      return qb;
    });

    const profile = await UserProfileService.getProfile("user-2");

    expect(typeof profile.commissionRate).toBe("number");
    expect(typeof profile.currentBalance).toBe("number");
  });

  it("builds trimmed name from firstName + lastName", async () => {
    mockSupabase.from.mockImplementation(() => {
      const qb = buildQueryBuilder();
      qb.single.mockResolvedValue({ data: customerUser, error: null });
      return qb;
    });

    const profile = await UserProfileService.getProfile("user-1");

    expect(profile.name).toBe("Jane Doe");
  });

  it("throws NOT_FOUND for non-existent userId", async () => {
    mockSupabase.from.mockImplementation(() => {
      const qb = buildQueryBuilder();
      qb.single.mockResolvedValue({ data: null, error: { message: "not found" } });
      return qb;
    });

    await expect(UserProfileService.getProfile("bad-id")).rejects.toMatchObject({
      statusCode: 404,
      code: "NOT_FOUND",
    });
  });
});

describe("UserProfileService.updateProfile", () => {
  it("updates firstName only", async () => {
    const getProfileSpy = jest.spyOn(UserProfileService, "getProfile").mockResolvedValue({
      ...({} as ReturnType<typeof UserProfileService.getProfile> extends Promise<infer T>
        ? T
        : never),
      id: "user-1",
      email: "customer@test.com",
      firstName: "Updated",
      lastName: "Doe",
      name: "Updated Doe",
      role: "customer",
      status: "approved",
      phone: "555-0100",
      company: "Test Corp",
      emailVerified: true,
      vendorId: null,
      commissionRate: null,
      vendorStatus: null,
      currentBalance: null,
      createdAt: "2025-01-01T00:00:00Z",
      lastLogin: "2025-03-01T00:00:00Z",
    });

    mockSupabase.from.mockImplementation(() => {
      const qb = buildQueryBuilder();
      return qb;
    });

    const profile = await UserProfileService.updateProfile("user-1", { firstName: "Updated" });

    expect(profile.firstName).toBe("Updated");
    getProfileSpy.mockRestore();
  });

  it("updates multiple fields", async () => {
    const getProfileSpy = jest.spyOn(UserProfileService, "getProfile").mockResolvedValue({
      id: "user-1",
      email: "customer@test.com",
      firstName: "New",
      lastName: "Name",
      name: "New Name",
      role: "customer",
      status: "approved",
      phone: "555-9999",
      company: "Test Corp",
      emailVerified: true,
      vendorId: null,
      commissionRate: null,
      vendorStatus: null,
      currentBalance: null,
      createdAt: "2025-01-01T00:00:00Z",
      lastLogin: null,
    });

    mockSupabase.from.mockImplementation(() => {
      const qb = buildQueryBuilder();
      return qb;
    });

    const profile = await UserProfileService.updateProfile("user-1", {
      firstName: "New",
      lastName: "Name",
      phone: "555-9999",
    });

    expect(profile.firstName).toBe("New");
    expect(profile.lastName).toBe("Name");
    expect(profile.phone).toBe("555-9999");
    getProfileSpy.mockRestore();
  });

  it("allows setting phone to null", async () => {
    const getProfileSpy = jest.spyOn(UserProfileService, "getProfile").mockResolvedValue({
      id: "user-1",
      email: "customer@test.com",
      firstName: "Jane",
      lastName: "Doe",
      name: "Jane Doe",
      role: "customer",
      status: "approved",
      phone: null,
      company: null,
      emailVerified: true,
      vendorId: null,
      commissionRate: null,
      vendorStatus: null,
      currentBalance: null,
      createdAt: "2025-01-01T00:00:00Z",
      lastLogin: null,
    });

    mockSupabase.from.mockImplementation(() => {
      const qb = buildQueryBuilder();
      return qb;
    });

    const profile = await UserProfileService.updateProfile("user-1", { phone: null });

    expect(profile.phone).toBeNull();
    getProfileSpy.mockRestore();
  });

  it("throws BAD_REQUEST for empty update (no fields)", async () => {
    await expect(UserProfileService.updateProfile("user-1", {})).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});

describe("UserProfileService.changePassword", () => {
  it("updates password when current is correct and new is valid", async () => {
    mockSupabase.from.mockImplementation(() => {
      const qb = buildQueryBuilder();
      qb.single.mockResolvedValue({
        data: { email: "user@test.com", first_name: "Jane" },
        error: null,
      });
      return qb;
    });
    mockSupabase.auth.signInWithPassword.mockResolvedValue({ error: null });
    mockSupabase.auth.admin.updateUserById.mockResolvedValue({ error: null });

    await UserProfileService.changePassword("user-1", "OldStr0ng!Pass", "NewStr0ng!Pass");

    expect(mockSupabase.auth.admin.updateUserById).toHaveBeenCalledWith("user-1", {
      password: "NewStr0ng!Pass",
    });
  });

  it("throws 401 for wrong current password", async () => {
    mockSupabase.from.mockImplementation(() => {
      const qb = buildQueryBuilder();
      qb.single.mockResolvedValue({
        data: { email: "user@test.com", first_name: "Jane" },
        error: null,
      });
      return qb;
    });
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      error: { message: "Invalid login credentials" },
    });

    await expect(
      UserProfileService.changePassword("user-1", "WrongPass1!", "NewStr0ng!Pass"),
    ).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
      statusCode: 401,
    });
  });

  it("throws 400 for same password", async () => {
    mockSupabase.from.mockImplementation(() => {
      const qb = buildQueryBuilder();
      qb.single.mockResolvedValue({
        data: { email: "user@test.com", first_name: "Jane" },
        error: null,
      });
      return qb;
    });
    mockSupabase.auth.signInWithPassword.mockResolvedValue({ error: null });

    await expect(
      UserProfileService.changePassword("user-1", "SameStr0ng!Pass", "SameStr0ng!Pass"),
    ).rejects.toMatchObject({
      code: "SAME_PASSWORD",
      statusCode: 400,
    });
  });

  it("throws 400 for weak new password (no uppercase)", async () => {
    mockSupabase.from.mockImplementation(() => {
      const qb = buildQueryBuilder();
      qb.single.mockResolvedValue({
        data: { email: "user@test.com", first_name: "Jane" },
        error: null,
      });
      return qb;
    });
    mockSupabase.auth.signInWithPassword.mockResolvedValue({ error: null });

    await expect(
      UserProfileService.changePassword("user-1", "OldStr0ng!Pass", "weakpass1!"),
    ).rejects.toMatchObject({
      code: "WEAK_PASSWORD",
      statusCode: 400,
    });
  });

  it("throws 400 for weak new password (no number)", async () => {
    mockSupabase.from.mockImplementation(() => {
      const qb = buildQueryBuilder();
      qb.single.mockResolvedValue({
        data: { email: "user@test.com", first_name: "Jane" },
        error: null,
      });
      return qb;
    });
    mockSupabase.auth.signInWithPassword.mockResolvedValue({ error: null });

    await expect(
      UserProfileService.changePassword("user-1", "OldStr0ng!Pass", "WeakPass!"),
    ).rejects.toMatchObject({
      code: "WEAK_PASSWORD",
      statusCode: 400,
    });
  });

  it("throws 400 for weak new password (too short)", async () => {
    mockSupabase.from.mockImplementation(() => {
      const qb = buildQueryBuilder();
      qb.single.mockResolvedValue({
        data: { email: "user@test.com", first_name: "Jane" },
        error: null,
      });
      return qb;
    });
    mockSupabase.auth.signInWithPassword.mockResolvedValue({ error: null });

    await expect(
      UserProfileService.changePassword("user-1", "OldStr0ng!Pass", "Ab1!"),
    ).rejects.toMatchObject({
      code: "WEAK_PASSWORD",
      statusCode: 400,
    });
  });

  it("sends confirmation email after success", async () => {
    mockSupabase.from.mockImplementation(() => {
      const qb = buildQueryBuilder();
      qb.single.mockResolvedValue({
        data: { email: "user@test.com", first_name: "Jane" },
        error: null,
      });
      return qb;
    });
    mockSupabase.auth.signInWithPassword.mockResolvedValue({ error: null });
    mockSupabase.auth.admin.updateUserById.mockResolvedValue({ error: null });

    await UserProfileService.changePassword("user-1", "OldStr0ng!Pass", "NewStr0ng!Pass");

    expect(mockSendEmail).toHaveBeenCalledWith(
      "user@test.com",
      "Your APlusMedDepot Password Has Been Changed",
      expect.stringContaining("successfully changed"),
    );
  });

  it("does not throw when email fails", async () => {
    mockSendEmail.mockRejectedValue(new Error("SMTP down"));

    mockSupabase.from.mockImplementation(() => {
      const qb = buildQueryBuilder();
      qb.single.mockResolvedValue({
        data: { email: "user@test.com", first_name: "Jane" },
        error: null,
      });
      return qb;
    });
    mockSupabase.auth.signInWithPassword.mockResolvedValue({ error: null });
    mockSupabase.auth.admin.updateUserById.mockResolvedValue({ error: null });

    await expect(
      UserProfileService.changePassword("user-1", "OldStr0ng!Pass", "NewStr0ng!Pass"),
    ).resolves.toBeUndefined();
  });
});
