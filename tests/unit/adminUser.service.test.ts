const mockFrom = jest.fn();

jest.mock("../../src/config/supabase", () => ({
  supabaseAdmin: {
    from: mockFrom,
  },
}));

jest.mock("../../src/services/email.service", () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../src/utils/securityLogger", () => ({
  logAdminAction: jest.fn(),
}));

import { AdminUserService } from "../../src/services/adminUser.service";
import { sendEmail } from "../../src/services/email.service";
import { logAdminAction } from "../../src/utils/securityLogger";

function mockQuery(result: { data?: unknown; error?: unknown; count?: number | null }) {
  const resolved = {
    data: result.data ?? null,
    error: result.error ?? null,
    count: result.count ?? null,
  };
  const chain: Record<string, jest.Mock> = {};
  const self = () => chain;
  chain.select = jest.fn(self);
  chain.insert = jest.fn(self);
  chain.update = jest.fn(self);
  chain.delete = jest.fn(self);
  chain.eq = jest.fn(self);
  chain.neq = jest.fn(self);
  chain.or = jest.fn(self);
  chain.is = jest.fn(self);
  chain.in = jest.fn(self);
  chain.order = jest.fn(self);
  chain.range = jest.fn(self);
  chain.single = jest.fn().mockResolvedValue(resolved);
  chain.then = jest
    .fn()
    .mockImplementation((resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(resolved).then(resolve, reject),
    );
  return chain;
}

const ADMIN_ID = "admin-uuid-1";

function makeUserRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-uuid-1",
    email: "test@example.com",
    role: "customer",
    status: "pending",
    first_name: "John",
    last_name: "Doe",
    phone: null,
    created_at: "2026-01-01T00:00:00Z",
    last_login: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ── listUsers ──────────────────────────────────────────────────────────

describe("AdminUserService.listUsers", () => {
  it("returns paginated user list with defaults", async () => {
    const users = [makeUserRow(), makeUserRow({ id: "user-uuid-2", email: "u2@example.com" })];
    const q = mockQuery({ data: users, count: 2 });
    mockFrom.mockReturnValue(q);

    const result = await AdminUserService.listUsers();

    expect(mockFrom).toHaveBeenCalledWith("users");
    expect(q.select).toHaveBeenCalled();
    expect(q.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(q.range).toHaveBeenCalledWith(0, 19);
    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.totalPages).toBe(1);
  });

  it("applies status filter", async () => {
    const q = mockQuery({ data: [], count: 0 });
    mockFrom.mockReturnValue(q);

    await AdminUserService.listUsers({ status: "approved" });

    expect(q.eq).toHaveBeenCalledWith("status", "approved");
  });

  it("applies role filter", async () => {
    const q = mockQuery({ data: [], count: 0 });
    mockFrom.mockReturnValue(q);

    await AdminUserService.listUsers({ role: "supplier" });

    expect(q.eq).toHaveBeenCalledWith("role", "supplier");
  });

  it("applies search filter", async () => {
    const q = mockQuery({ data: [], count: 0 });
    mockFrom.mockReturnValue(q);

    await AdminUserService.listUsers({ search: "john" });

    expect(q.or).toHaveBeenCalledWith(
      "email.ilike.%john%,first_name.ilike.%john%,last_name.ilike.%john%",
    );
  });

  it("applies custom sort and pagination", async () => {
    const q = mockQuery({ data: [], count: 0 });
    mockFrom.mockReturnValue(q);

    await AdminUserService.listUsers({ page: 3, limit: 10, sortBy: "email", sortOrder: "asc" });

    expect(q.order).toHaveBeenCalledWith("email", { ascending: true });
    expect(q.range).toHaveBeenCalledWith(20, 29);
  });

  it("throws on database error", async () => {
    const q = mockQuery({ error: { message: "DB down" } });
    mockFrom.mockReturnValue(q);

    await expect(AdminUserService.listUsers()).rejects.toThrow("Failed to list users: DB down");
  });

  it("maps rows to UserListItem format", async () => {
    const user = makeUserRow({ first_name: "Jane", last_name: "Smith" });
    const q = mockQuery({ data: [user], count: 1 });
    mockFrom.mockReturnValue(q);

    const result = await AdminUserService.listUsers();

    expect(result.data[0]).toEqual({
      id: "user-uuid-1",
      email: "test@example.com",
      role: "customer",
      status: "pending",
      firstName: "Jane",
      lastName: "Smith",
      createdAt: "2026-01-01T00:00:00Z",
      lastLogin: null,
    });
  });
});

// ── getUserDetail ──────────────────────────────────────────────────────

describe("AdminUserService.getUserDetail", () => {
  it("returns customer detail with order stats", async () => {
    const user = makeUserRow({ role: "customer" });
    const orders = [
      { id: "o1", total_amount: "100.00" },
      { id: "o2", total_amount: "250.00" },
    ];

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return mockQuery({ data: user });
      return mockQuery({ data: orders });
    });

    const result = await AdminUserService.getUserDetail("user-uuid-1");

    expect(result.phone).toBeNull();
    expect(result.customerStats).toEqual({ totalOrders: 2, totalSpent: 350 });
    expect(result.supplierInfo).toBeUndefined();
  });

  it("returns supplier detail with supplier info", async () => {
    const user = makeUserRow({ role: "supplier" });
    const supplier = {
      business_name: "MedCo",
      tax_id: "TAX123",
      status: "approved",
      commission_rate: "12.00",
      current_balance: "500.00",
      created_at: "2026-01-01T00:00:00Z",
    };

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return mockQuery({ data: user });
      return mockQuery({ data: supplier });
    });

    const result = await AdminUserService.getUserDetail("user-uuid-1");

    expect(result.supplierInfo).toEqual({
      businessName: "MedCo",
      taxId: "TAX123",
      status: "approved",
      commissionRate: 12,
      currentBalance: 500,
      createdAt: "2026-01-01T00:00:00Z",
    });
    expect(result.customerStats).toBeUndefined();
  });

  it("throws 404 when user not found", async () => {
    const q = mockQuery({ error: { message: "not found" } });
    mockFrom.mockReturnValue(q);

    await expect(AdminUserService.getUserDetail("nonexistent")).rejects.toThrow("User not found");
  });

  it("returns admin detail without extra info", async () => {
    const user = makeUserRow({ role: "admin", status: "approved" });
    mockFrom.mockReturnValue(mockQuery({ data: user }));

    const result = await AdminUserService.getUserDetail("user-uuid-1");

    expect(result.supplierInfo).toBeUndefined();
    expect(result.customerStats).toBeUndefined();
  });
});

// ── approveUser ────────────────────────────────────────────────────────

describe("AdminUserService.approveUser", () => {
  it("approves a pending user", async () => {
    const user = makeUserRow({ status: "pending" });
    const selectQ = mockQuery({ data: user });
    const updateQ = mockQuery({});
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return selectQ;
      return updateQ;
    });

    await AdminUserService.approveUser("user-uuid-1", ADMIN_ID);

    expect(updateQ.update).toHaveBeenCalledWith(expect.objectContaining({ status: "approved" }));
    expect(sendEmail).toHaveBeenCalledWith(
      "test@example.com",
      "Your APlusMedDepot Account Has Been Approved",
      expect.any(String),
    );
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user_approved",
        adminId: ADMIN_ID,
        targetUserId: "user-uuid-1",
      }),
    );
  });

  it("also approves supplier record for supplier users", async () => {
    const user = makeUserRow({ status: "pending", role: "supplier" });
    const selectQ = mockQuery({ data: user });
    const updateQ = mockQuery({});
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return selectQ;
      return updateQ;
    });

    await AdminUserService.approveUser("user-uuid-1", ADMIN_ID);

    // Should have 2 update calls: users + suppliers
    expect(mockFrom).toHaveBeenCalledWith("users");
    expect(mockFrom).toHaveBeenCalledWith("suppliers");
  });

  it("throws conflict when user is not pending", async () => {
    const user = makeUserRow({ status: "approved" });
    mockFrom.mockReturnValue(mockQuery({ data: user }));

    await expect(AdminUserService.approveUser("user-uuid-1", ADMIN_ID)).rejects.toThrow(
      "User is not in pending status",
    );
  });

  it("throws on update failure", async () => {
    const user = makeUserRow({ status: "pending" });
    const selectQ = mockQuery({ data: user });
    const updateQ = mockQuery({ error: { message: "update failed" } });
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return selectQ;
      return updateQ;
    });

    await expect(AdminUserService.approveUser("user-uuid-1", ADMIN_ID)).rejects.toThrow(
      "Failed to approve user: update failed",
    );
  });
});

// ── rejectUser ─────────────────────────────────────────────────────────

describe("AdminUserService.rejectUser", () => {
  it("rejects a pending user with reason", async () => {
    const user = makeUserRow({ status: "pending" });
    const selectQ = mockQuery({ data: user });
    const updateQ = mockQuery({});
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return selectQ;
      return updateQ;
    });

    await AdminUserService.rejectUser("user-uuid-1", ADMIN_ID, "Invalid documentation");

    expect(updateQ.update).toHaveBeenCalledWith(expect.objectContaining({ status: "rejected" }));
    expect(sendEmail).toHaveBeenCalledWith(
      "test@example.com",
      "APlusMedDepot Account Application Update",
      expect.stringContaining("Invalid documentation"),
    );
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user_rejected",
        reason: "Invalid documentation",
      }),
    );
  });

  it("also rejects supplier record for supplier users", async () => {
    const user = makeUserRow({ status: "pending", role: "supplier" });
    const selectQ = mockQuery({ data: user });
    const updateQ = mockQuery({});
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return selectQ;
      return updateQ;
    });

    await AdminUserService.rejectUser("user-uuid-1", ADMIN_ID, "Bad documents provided");

    expect(mockFrom).toHaveBeenCalledWith("suppliers");
  });

  it("throws conflict when user is not pending", async () => {
    const user = makeUserRow({ status: "approved" });
    mockFrom.mockReturnValue(mockQuery({ data: user }));

    await expect(
      AdminUserService.rejectUser("user-uuid-1", ADMIN_ID, "some reason here"),
    ).rejects.toThrow("User is not in pending status");
  });
});

// ── suspendUser ────────────────────────────────────────────────────────

describe("AdminUserService.suspendUser", () => {
  it("suspends an approved user with reason", async () => {
    const user = makeUserRow({ status: "approved" });
    const selectQ = mockQuery({ data: user });
    const updateQ = mockQuery({});
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return selectQ;
      return updateQ;
    });

    await AdminUserService.suspendUser("user-uuid-1", ADMIN_ID, "Terms violation");

    expect(updateQ.update).toHaveBeenCalledWith(expect.objectContaining({ status: "suspended" }));
    expect(sendEmail).toHaveBeenCalledWith(
      "test@example.com",
      "APlusMedDepot Account Suspended",
      expect.stringContaining("Terms violation"),
    );
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user_suspended",
        reason: "Terms violation",
      }),
    );
  });

  it("throws conflict when user is not approved", async () => {
    const user = makeUserRow({ status: "pending" });
    mockFrom.mockReturnValue(mockQuery({ data: user }));

    await expect(
      AdminUserService.suspendUser("user-uuid-1", ADMIN_ID, "reason for suspension"),
    ).rejects.toThrow("Only approved users can be suspended");
  });

  it("throws forbidden when trying to suspend admin", async () => {
    const user = makeUserRow({ status: "approved", role: "admin" });
    mockFrom.mockReturnValue(mockQuery({ data: user }));

    await expect(
      AdminUserService.suspendUser("user-uuid-1", ADMIN_ID, "reason for suspension"),
    ).rejects.toThrow("Cannot suspend admin users");
  });

  it("also suspends supplier record for supplier users", async () => {
    const user = makeUserRow({ status: "approved", role: "supplier" });
    const selectQ = mockQuery({ data: user });
    const updateQ = mockQuery({});
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return selectQ;
      return updateQ;
    });

    await AdminUserService.suspendUser("user-uuid-1", ADMIN_ID, "Compliance issue");

    expect(mockFrom).toHaveBeenCalledWith("suppliers");
  });
});

// ── reactivateUser ─────────────────────────────────────────────────────

describe("AdminUserService.reactivateUser", () => {
  it("reactivates a suspended user", async () => {
    const user = makeUserRow({ status: "suspended" });
    const selectQ = mockQuery({ data: user });
    const updateQ = mockQuery({});
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return selectQ;
      return updateQ;
    });

    await AdminUserService.reactivateUser("user-uuid-1", ADMIN_ID);

    expect(updateQ.update).toHaveBeenCalledWith(expect.objectContaining({ status: "approved" }));
    expect(sendEmail).toHaveBeenCalledWith(
      "test@example.com",
      "APlusMedDepot Account Reactivated",
      expect.any(String),
    );
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user_reactivated",
        adminId: ADMIN_ID,
        targetUserId: "user-uuid-1",
      }),
    );
  });

  it("also reactivates supplier record for supplier users", async () => {
    const user = makeUserRow({ status: "suspended", role: "supplier" });
    const selectQ = mockQuery({ data: user });
    const updateQ = mockQuery({});
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return selectQ;
      return updateQ;
    });

    await AdminUserService.reactivateUser("user-uuid-1", ADMIN_ID);

    expect(mockFrom).toHaveBeenCalledWith("suppliers");
  });

  it("throws conflict when user is not suspended", async () => {
    const user = makeUserRow({ status: "approved" });
    mockFrom.mockReturnValue(mockQuery({ data: user }));

    await expect(AdminUserService.reactivateUser("user-uuid-1", ADMIN_ID)).rejects.toThrow(
      "Only suspended users can be reactivated",
    );
  });
});

// ── getPendingCount ────────────────────────────────────────────────────

describe("AdminUserService.getPendingCount", () => {
  it("returns pending counts for users, suppliers, and products", async () => {
    const usersQ = mockQuery({ count: 5 });
    const suppliersQ = mockQuery({ count: 3 });
    const productsQ = mockQuery({ count: 8 });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return usersQ;
      if (callCount === 2) return suppliersQ;
      return productsQ;
    });

    const result = await AdminUserService.getPendingCount();

    expect(result).toEqual({ users: 5, suppliers: 3, products: 8 });
  });

  it("returns zero when no pending items", async () => {
    const q = mockQuery({ count: 0 });
    mockFrom.mockReturnValue(q);

    const result = await AdminUserService.getPendingCount();

    expect(result).toEqual({ users: 0, suppliers: 0, products: 0 });
  });
});

// ── fetchUserOrThrow (tested via other methods) ────────────────────────

describe("AdminUserService - fetchUserOrThrow edge cases", () => {
  it("throws 404 when user does not exist (via approve)", async () => {
    const q = mockQuery({ error: { message: "not found" } });
    mockFrom.mockReturnValue(q);

    await expect(AdminUserService.approveUser("nonexistent", ADMIN_ID)).rejects.toThrow(
      "User not found",
    );
  });

  it("throws 404 when data is null (via suspend)", async () => {
    const q = mockQuery({ data: null });
    // Override single to return null data
    q.single = jest.fn().mockResolvedValue({ data: null, error: null });
    mockFrom.mockReturnValue(q);

    await expect(
      AdminUserService.suspendUser("nonexistent", ADMIN_ID, "reason text here"),
    ).rejects.toThrow("User not found");
  });
});
