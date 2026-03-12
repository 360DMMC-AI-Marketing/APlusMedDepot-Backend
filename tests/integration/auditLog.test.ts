import request from "supertest";

const mockVerifyToken = jest.fn();

jest.mock("../../src/services/auth.service", () => ({
  AuthService: {
    signUp: jest.fn(),
    verifyToken: mockVerifyToken,
  },
}));

const mockGetAuditLogs = jest.fn();
const mockGetAuditLogsByResource = jest.fn();
const mockGetAdminActivity = jest.fn();

jest.mock("../../src/services/auditLog.service", () => ({
  AuditLogService: {
    log: jest.fn(),
    getAuditLogs: mockGetAuditLogs,
    getAuditLogsByResource: mockGetAuditLogsByResource,
    getAdminActivity: mockGetAdminActivity,
  },
}));

jest.mock(
  "express-rate-limit",
  () => () => (_req: unknown, _res: unknown, next: () => void) => next(),
);

import app from "../../src/index";
import { AppError } from "../../src/utils/errors";

const ADMIN_ID = "a0000000-0000-4000-8000-000000000001";

const adminUser = {
  id: ADMIN_ID,
  email: "admin@example.com",
  firstName: "Admin",
  lastName: "User",
  companyName: null,
  phone: null,
  role: "admin" as const,
  status: "approved" as const,
  lastLogin: null,
};

const customerUser = {
  id: "c0000000-0000-4000-8000-000000000001",
  email: "customer@example.com",
  firstName: "Jane",
  lastName: "Doe",
  companyName: null,
  phone: null,
  role: "customer" as const,
  status: "approved" as const,
  lastLogin: null,
};

function authAs(user: Record<string, unknown>) {
  mockVerifyToken.mockResolvedValue(user);
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ── GET /api/admin/audit-logs ─────────────────────────────────────────

describe("GET /api/admin/audit-logs", () => {
  it("returns paginated audit logs for admin", async () => {
    authAs(adminUser);
    const result = {
      data: [
        {
          id: "log-1",
          adminId: ADMIN_ID,
          adminEmail: "admin@example.com",
          action: "user_approved",
          resourceType: "user",
          resourceId: "user-123",
          details: {},
          ipAddress: "1.2.3.4",
          userAgent: "Chrome",
          createdAt: "2026-01-01T00:00:00Z",
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    };
    mockGetAuditLogs.mockResolvedValue(result);

    const res = await request(app)
      .get("/api/admin/audit-logs")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].action).toBe("user_approved");
    expect(res.body.total).toBe(1);
  });

  it("passes query filters to service", async () => {
    authAs(adminUser);
    mockGetAuditLogs.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 10,
      totalPages: 0,
    });

    await request(app)
      .get("/api/admin/audit-logs?action=user_suspended&resourceType=user&page=2&limit=10")
      .set("Authorization", "Bearer valid-token");

    expect(mockGetAuditLogs).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user_suspended",
        resourceType: "user",
        page: 2,
        limit: 10,
      }),
    );
  });

  it("rejects non-admin users with 403", async () => {
    authAs(customerUser);

    const res = await request(app)
      .get("/api/admin/audit-logs")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(403);
  });

  it("rejects unauthenticated requests with 401", async () => {
    const res = await request(app).get("/api/admin/audit-logs");

    expect(res.status).toBe(401);
  });

  it("returns 500 on service error", async () => {
    authAs(adminUser);
    mockGetAuditLogs.mockRejectedValue(new Error("DB error"));

    const res = await request(app)
      .get("/api/admin/audit-logs")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(500);
  });
});

// ── GET /api/admin/audit-logs/resource/:type/:id ──────────────────────

describe("GET /api/admin/audit-logs/resource/:type/:id", () => {
  it("returns audit logs for a specific resource", async () => {
    authAs(adminUser);
    const logs = [
      {
        id: "log-1",
        adminId: ADMIN_ID,
        adminEmail: "admin@example.com",
        action: "product_approved",
        resourceType: "product",
        resourceId: "prod-123",
        details: {},
        ipAddress: null,
        userAgent: null,
        createdAt: "2026-01-01T00:00:00Z",
      },
    ];
    mockGetAuditLogsByResource.mockResolvedValue(logs);

    const res = await request(app)
      .get("/api/admin/audit-logs/resource/product/prod-123")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].resourceType).toBe("product");
    expect(mockGetAuditLogsByResource).toHaveBeenCalledWith("product", "prod-123");
  });

  it("rejects non-admin users", async () => {
    authAs(customerUser);

    const res = await request(app)
      .get("/api/admin/audit-logs/resource/user/user-123")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(403);
  });
});

// ── GET /api/admin/audit-logs/admin/:adminId ──────────────────────────

describe("GET /api/admin/audit-logs/admin/:adminId", () => {
  it("returns activity for a specific admin", async () => {
    authAs(adminUser);
    const result = {
      data: [
        {
          id: "log-1",
          adminId: ADMIN_ID,
          adminEmail: "admin@example.com",
          action: "user_approved",
          resourceType: "user",
          resourceId: "user-123",
          details: {},
          ipAddress: "10.0.0.1",
          userAgent: "Firefox",
          createdAt: "2026-02-01T00:00:00Z",
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    };
    mockGetAdminActivity.mockResolvedValue(result);

    const res = await request(app)
      .get(`/api/admin/audit-logs/admin/${ADMIN_ID}`)
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(mockGetAdminActivity).toHaveBeenCalledWith(
      ADMIN_ID,
      expect.objectContaining({ page: 1, limit: 20 }),
    );
  });

  it("rejects invalid UUID admin ID with 400", async () => {
    authAs(adminUser);

    const res = await request(app)
      .get("/api/admin/audit-logs/admin/not-a-uuid")
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(400);
  });

  it("rejects non-admin users", async () => {
    authAs(customerUser);

    const res = await request(app)
      .get(`/api/admin/audit-logs/admin/${ADMIN_ID}`)
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(403);
  });

  it("returns 500 on service error", async () => {
    authAs(adminUser);
    mockGetAdminActivity.mockRejectedValue(new AppError("DB error", 500, "DATABASE_ERROR"));

    const res = await request(app)
      .get(`/api/admin/audit-logs/admin/${ADMIN_ID}`)
      .set("Authorization", "Bearer valid-token");

    expect(res.status).toBe(500);
  });
});
