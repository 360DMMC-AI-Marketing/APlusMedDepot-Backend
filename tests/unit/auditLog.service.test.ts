const mockFrom = jest.fn();

jest.mock("../../src/config/supabase", () => ({
  supabaseAdmin: {
    from: mockFrom,
  },
}));

import { AuditLogService } from "../../src/services/auditLog.service";

function mockQuery(result: { data?: unknown; error?: unknown; count?: number | null }) {
  const resolved = {
    data: result.data ?? null,
    error: result.error ?? null,
    count: result.count ?? null,
  };
  const chain: Record<string, jest.Mock> = {};
  const self = () => chain;
  chain.select = jest.fn(self);
  chain.insert = jest.fn().mockResolvedValue(resolved);
  chain.update = jest.fn(self);
  chain.delete = jest.fn(self);
  chain.eq = jest.fn(self);
  chain.neq = jest.fn(self);
  chain.gte = jest.fn(self);
  chain.lte = jest.fn(self);
  chain.is = jest.fn(self);
  chain.in = jest.fn(self);
  chain.or = jest.fn(self);
  chain.order = jest.fn(self);
  chain.range = jest.fn(self);
  chain.limit = jest.fn(self);
  chain.single = jest.fn().mockResolvedValue(resolved);
  chain.maybeSingle = jest.fn().mockResolvedValue(resolved);
  chain.then = jest
    .fn()
    .mockImplementation((resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(resolved).then(resolve, reject),
    );
  return chain;
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ── log ───────────────────────────────────────────────────────────────

describe("AuditLogService.log", () => {
  it("inserts an audit log entry", async () => {
    const chain = mockQuery({ data: null, error: null });
    mockFrom.mockReturnValue(chain);

    await AuditLogService.log({
      adminId: "admin-001",
      action: "user_approved",
      resourceType: "user",
      resourceId: "user-123",
      details: { role: "supplier" },
      ipAddress: "192.168.1.1",
      userAgent: "Mozilla/5.0",
    });

    expect(mockFrom).toHaveBeenCalledWith("audit_logs");
    expect(chain.insert).toHaveBeenCalledWith({
      admin_id: "admin-001",
      action: "user_approved",
      resource_type: "user",
      resource_id: "user-123",
      details: { role: "supplier" },
      ip_address: "192.168.1.1",
      user_agent: "Mozilla/5.0",
    });
  });

  it("never throws even when insert fails", async () => {
    const chain = mockQuery({ error: { message: "DB down" } });
    mockFrom.mockReturnValue(chain);
    // Simulate an actual throw from the insert
    chain.insert = jest.fn().mockRejectedValue(new Error("DB down"));

    await expect(
      AuditLogService.log({
        adminId: "admin-001",
        action: "user_approved",
        resourceType: "user",
      }),
    ).resolves.toBeUndefined();
  });

  it("defaults optional fields to null", async () => {
    const chain = mockQuery({ data: null, error: null });
    mockFrom.mockReturnValue(chain);

    await AuditLogService.log({
      adminId: "admin-001",
      action: "settings_updated",
      resourceType: "settings",
    });

    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        resource_id: null,
        details: {},
        ip_address: null,
        user_agent: null,
      }),
    );
  });
});

// ── getAuditLogs ──────────────────────────────────────────────────────

describe("AuditLogService.getAuditLogs", () => {
  it("returns paginated audit logs", async () => {
    const rows = [
      {
        id: "log-1",
        admin_id: "admin-001",
        action: "user_approved",
        resource_type: "user",
        resource_id: "user-123",
        details: {},
        ip_address: "1.2.3.4",
        user_agent: "Chrome",
        created_at: "2026-01-01T00:00:00Z",
        users: { email: "admin@test.com" },
      },
    ];
    const chain = mockQuery({ data: rows, error: null, count: 1 });
    mockFrom.mockReturnValue(chain);

    const result = await AuditLogService.getAuditLogs({ page: 1, limit: 10 });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].adminEmail).toBe("admin@test.com");
    expect(result.data[0].action).toBe("user_approved");
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.totalPages).toBe(1);
  });

  it("applies action filter", async () => {
    const chain = mockQuery({ data: [], error: null, count: 0 });
    mockFrom.mockReturnValue(chain);

    await AuditLogService.getAuditLogs({ action: "user_approved" });

    expect(chain.eq).toHaveBeenCalledWith("action", "user_approved");
  });

  it("applies resourceType filter", async () => {
    const chain = mockQuery({ data: [], error: null, count: 0 });
    mockFrom.mockReturnValue(chain);

    await AuditLogService.getAuditLogs({ resourceType: "product" });

    expect(chain.eq).toHaveBeenCalledWith("resource_type", "product");
  });

  it("applies date range filters", async () => {
    const chain = mockQuery({ data: [], error: null, count: 0 });
    mockFrom.mockReturnValue(chain);

    await AuditLogService.getAuditLogs({
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    });

    expect(chain.gte).toHaveBeenCalledWith("created_at", "2026-01-01");
    expect(chain.lte).toHaveBeenCalledWith("created_at", "2026-01-31");
  });

  it("throws on database error", async () => {
    const chain = mockQuery({ error: { message: "DB error" } });
    mockFrom.mockReturnValue(chain);

    await expect(AuditLogService.getAuditLogs()).rejects.toThrow("Failed to list audit logs");
  });
});

// ── getAuditLogsByResource ────────────────────────────────────────────

describe("AuditLogService.getAuditLogsByResource", () => {
  it("returns logs for a specific resource", async () => {
    const rows = [
      {
        id: "log-1",
        admin_id: "admin-001",
        action: "product_approved",
        resource_type: "product",
        resource_id: "prod-123",
        details: {},
        ip_address: null,
        user_agent: null,
        created_at: "2026-01-01T00:00:00Z",
        users: { email: "admin@test.com" },
      },
    ];
    const chain = mockQuery({ data: rows, error: null });
    mockFrom.mockReturnValue(chain);

    const result = await AuditLogService.getAuditLogsByResource("product", "prod-123");

    expect(result).toHaveLength(1);
    expect(result[0].resourceType).toBe("product");
    expect(result[0].resourceId).toBe("prod-123");
    expect(chain.eq).toHaveBeenCalledWith("resource_type", "product");
    expect(chain.eq).toHaveBeenCalledWith("resource_id", "prod-123");
  });

  it("throws on database error", async () => {
    const chain = mockQuery({ error: { message: "DB error" } });
    mockFrom.mockReturnValue(chain);

    await expect(AuditLogService.getAuditLogsByResource("user", "u-1")).rejects.toThrow(
      "Failed to get audit logs by resource",
    );
  });
});

// ── getAdminActivity ──────────────────────────────────────────────────

describe("AuditLogService.getAdminActivity", () => {
  it("returns paginated activity for a specific admin", async () => {
    const rows = [
      {
        id: "log-1",
        admin_id: "admin-001",
        action: "user_suspended",
        resource_type: "user",
        resource_id: "user-456",
        details: { reason: "test" },
        ip_address: "10.0.0.1",
        user_agent: "Safari",
        created_at: "2026-02-01T00:00:00Z",
        users: { email: "admin@test.com" },
      },
    ];
    const chain = mockQuery({ data: rows, error: null, count: 1 });
    mockFrom.mockReturnValue(chain);

    const result = await AuditLogService.getAdminActivity("admin-001", {
      page: 1,
      limit: 10,
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].adminId).toBe("admin-001");
    expect(result.total).toBe(1);
    expect(chain.eq).toHaveBeenCalledWith("admin_id", "admin-001");
  });

  it("throws on database error", async () => {
    const chain = mockQuery({ error: { message: "DB error" } });
    mockFrom.mockReturnValue(chain);

    await expect(AuditLogService.getAdminActivity("admin-001")).rejects.toThrow(
      "Failed to get admin activity",
    );
  });
});
