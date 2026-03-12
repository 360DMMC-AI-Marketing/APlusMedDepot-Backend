import request from "supertest";

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports that reference them
// ---------------------------------------------------------------------------
const mockVerifyToken = jest.fn();

jest.mock("../../src/services/auth.service", () => ({
  AuthService: {
    signUp: jest.fn(),
    verifyToken: mockVerifyToken,
  },
}));

const mockListUsers = jest.fn();
const mockGetUserDetail = jest.fn();
const mockApproveUser = jest.fn();
const mockRejectUser = jest.fn();
const mockSuspendUser = jest.fn();
const mockReactivateUser = jest.fn();
const mockGetPendingCount = jest.fn();

jest.mock("../../src/services/adminUser.service", () => ({
  AdminUserService: {
    listUsers: mockListUsers,
    getUserDetail: mockGetUserDetail,
    approveUser: mockApproveUser,
    rejectUser: mockRejectUser,
    suspendUser: mockSuspendUser,
    reactivateUser: mockReactivateUser,
    getPendingCount: mockGetPendingCount,
  },
}));

jest.mock(
  "express-rate-limit",
  () => () => (_req: unknown, _res: unknown, next: () => void) => next(),
);

import app from "../../src/index";
import { AppError } from "../../src/utils/errors";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const USER_ID = "a0000000-0000-4000-8000-000000000001";
const ADMIN_USER_ID = "admin-user-001";

const adminUser = {
  id: ADMIN_USER_ID,
  email: "admin@example.com",
  firstName: "Admin",
  lastName: "User",
  companyName: null,
  phone: null,
  role: "admin" as const,
  status: "approved" as const,
  lastLogin: null,
};

const supplierUser = {
  id: "supplier-user-001",
  email: "supplier@example.com",
  firstName: "Sam",
  lastName: "Supply",
  companyName: null,
  phone: null,
  role: "supplier" as const,
  status: "approved" as const,
  lastLogin: null,
};

const customerUser = {
  id: "customer-user-001",
  email: "customer@example.com",
  firstName: "Jane",
  lastName: "Doe",
  companyName: null,
  phone: null,
  role: "customer" as const,
  status: "approved" as const,
  lastLogin: null,
};

const userListResponse = {
  data: [
    {
      id: USER_ID,
      email: "john@example.com",
      role: "customer",
      status: "pending",
      firstName: "John",
      lastName: "Doe",
      createdAt: "2026-01-01T00:00:00Z",
      lastLogin: null,
    },
  ],
  total: 1,
  page: 1,
  limit: 20,
  totalPages: 1,
};

const userDetailResponse = {
  id: USER_ID,
  email: "john@example.com",
  role: "customer",
  status: "approved",
  firstName: "John",
  lastName: "Doe",
  createdAt: "2026-01-01T00:00:00Z",
  lastLogin: null,
  phone: "+1234567890",
  customerStats: { totalOrders: 5, totalSpent: 1250.0 },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function authAs(user: Record<string, unknown>) {
  mockVerifyToken.mockResolvedValue(user);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("Admin User Management API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // Auth / RBAC
  // =========================================================================
  describe("Auth & RBAC", () => {
    it("returns 401 when no auth token is provided", async () => {
      const res = await request(app).get("/api/admin/users");
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHORIZED");
    });

    it("returns 403 when a supplier tries to access admin user routes", async () => {
      authAs(supplierUser);
      const res = await request(app)
        .get("/api/admin/users")
        .set("Authorization", "Bearer valid-token");
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("returns 403 when a customer tries to access admin user routes", async () => {
      authAs(customerUser);
      const res = await request(app)
        .put(`/api/admin/users/${USER_ID}/approve`)
        .set("Authorization", "Bearer valid-token");
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });
  });

  // =========================================================================
  // GET /api/admin/users
  // =========================================================================
  describe("GET /api/admin/users", () => {
    it("returns paginated user list", async () => {
      authAs(adminUser);
      mockListUsers.mockResolvedValue(userListResponse);

      const res = await request(app)
        .get("/api/admin/users")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.total).toBe(1);
      expect(res.body.page).toBe(1);
      expect(mockListUsers).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 20 }));
    });

    it("passes query filters to service", async () => {
      authAs(adminUser);
      mockListUsers.mockResolvedValue({ data: [], total: 0, page: 1, limit: 10, totalPages: 0 });

      const res = await request(app)
        .get(
          "/api/admin/users?page=2&limit=10&status=pending&role=supplier&search=med&sortBy=email&sortOrder=asc",
        )
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(mockListUsers).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 2,
          limit: 10,
          status: "pending",
          role: "supplier",
          search: "med",
          sortBy: "email",
          sortOrder: "asc",
        }),
      );
    });

    it("returns 400 for invalid status filter", async () => {
      authAs(adminUser);

      const res = await request(app)
        .get("/api/admin/users?status=invalid")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid pagination (limit > 100)", async () => {
      authAs(adminUser);

      const res = await request(app)
        .get("/api/admin/users?limit=999")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(400);
    });
  });

  // =========================================================================
  // GET /api/admin/users/:id
  // =========================================================================
  describe("GET /api/admin/users/:id", () => {
    it("returns user detail with customer stats", async () => {
      authAs(adminUser);
      mockGetUserDetail.mockResolvedValue(userDetailResponse);

      const res = await request(app)
        .get(`/api/admin/users/${USER_ID}`)
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(USER_ID);
      expect(res.body.customerStats.totalOrders).toBe(5);
      expect(mockGetUserDetail).toHaveBeenCalledWith(USER_ID);
    });

    it("returns 404 for non-existent user", async () => {
      authAs(adminUser);
      mockGetUserDetail.mockRejectedValue(new AppError("User not found", 404, "NOT_FOUND"));

      const res = await request(app)
        .get(`/api/admin/users/${USER_ID}`)
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(404);
    });

    it("returns 400 for invalid UUID format", async () => {
      authAs(adminUser);

      const res = await request(app)
        .get("/api/admin/users/not-a-uuid")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(400);
    });
  });

  // =========================================================================
  // PUT /api/admin/users/:id/approve
  // =========================================================================
  describe("PUT /api/admin/users/:id/approve", () => {
    it("approves a pending user", async () => {
      authAs(adminUser);
      mockApproveUser.mockResolvedValue(undefined);

      const res = await request(app)
        .put(`/api/admin/users/${USER_ID}/approve`)
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body.message).toBe("User approved successfully");
      expect(mockApproveUser).toHaveBeenCalledWith(USER_ID, ADMIN_USER_ID, expect.anything(), {
        commissionRate: undefined,
      });
    });

    it("returns 409 when user is not pending", async () => {
      authAs(adminUser);
      mockApproveUser.mockRejectedValue(
        new AppError("User is not in pending status", 409, "CONFLICT"),
      );

      const res = await request(app)
        .put(`/api/admin/users/${USER_ID}/approve`)
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(409);
    });
  });

  // =========================================================================
  // PUT /api/admin/users/:id/reject
  // =========================================================================
  describe("PUT /api/admin/users/:id/reject", () => {
    it("rejects a pending user with valid reason", async () => {
      authAs(adminUser);
      mockRejectUser.mockResolvedValue(undefined);

      const res = await request(app)
        .put(`/api/admin/users/${USER_ID}/reject`)
        .set("Authorization", "Bearer valid-token")
        .send({ reason: "Invalid documentation submitted" });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe("User rejected successfully");
      expect(mockRejectUser).toHaveBeenCalledWith(
        USER_ID,
        ADMIN_USER_ID,
        "Invalid documentation submitted",
        expect.anything(),
      );
    });

    it("returns 400 when reason is missing", async () => {
      authAs(adminUser);

      const res = await request(app)
        .put(`/api/admin/users/${USER_ID}/reject`)
        .set("Authorization", "Bearer valid-token")
        .send({});

      expect(res.status).toBe(400);
    });

    it("returns 400 when reason is too short (< 10 chars)", async () => {
      authAs(adminUser);

      const res = await request(app)
        .put(`/api/admin/users/${USER_ID}/reject`)
        .set("Authorization", "Bearer valid-token")
        .send({ reason: "Too short" });

      expect(res.status).toBe(400);
    });

    it("returns 400 when reason exceeds 500 characters", async () => {
      authAs(adminUser);

      const res = await request(app)
        .put(`/api/admin/users/${USER_ID}/reject`)
        .set("Authorization", "Bearer valid-token")
        .send({ reason: "x".repeat(501) });

      expect(res.status).toBe(400);
    });
  });

  // =========================================================================
  // PUT /api/admin/users/:id/suspend
  // =========================================================================
  describe("PUT /api/admin/users/:id/suspend", () => {
    it("suspends an approved user with valid reason", async () => {
      authAs(adminUser);
      mockSuspendUser.mockResolvedValue(undefined);

      const res = await request(app)
        .put(`/api/admin/users/${USER_ID}/suspend`)
        .set("Authorization", "Bearer valid-token")
        .send({ reason: "Violation of terms of service" });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe("User suspended successfully");
      expect(mockSuspendUser).toHaveBeenCalledWith(
        USER_ID,
        ADMIN_USER_ID,
        "Violation of terms of service",
        expect.anything(),
      );
    });

    it("returns 409 when user is not approved", async () => {
      authAs(adminUser);
      mockSuspendUser.mockRejectedValue(
        new AppError("Only approved users can be suspended", 409, "CONFLICT"),
      );

      const res = await request(app)
        .put(`/api/admin/users/${USER_ID}/suspend`)
        .set("Authorization", "Bearer valid-token")
        .send({ reason: "Violation of terms of service" });

      expect(res.status).toBe(409);
    });

    it("returns 403 when trying to suspend an admin", async () => {
      authAs(adminUser);
      mockSuspendUser.mockRejectedValue(
        new AppError("Cannot suspend admin users", 403, "FORBIDDEN"),
      );

      const res = await request(app)
        .put(`/api/admin/users/${USER_ID}/suspend`)
        .set("Authorization", "Bearer valid-token")
        .send({ reason: "Attempting to suspend admin user" });

      expect(res.status).toBe(403);
    });

    it("returns 400 when reason is missing", async () => {
      authAs(adminUser);

      const res = await request(app)
        .put(`/api/admin/users/${USER_ID}/suspend`)
        .set("Authorization", "Bearer valid-token")
        .send({});

      expect(res.status).toBe(400);
    });
  });

  // =========================================================================
  // PUT /api/admin/users/:id/reactivate
  // =========================================================================
  describe("PUT /api/admin/users/:id/reactivate", () => {
    it("reactivates a suspended user", async () => {
      authAs(adminUser);
      mockReactivateUser.mockResolvedValue(undefined);

      const res = await request(app)
        .put(`/api/admin/users/${USER_ID}/reactivate`)
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body.message).toBe("User reactivated successfully");
      expect(mockReactivateUser).toHaveBeenCalledWith(USER_ID, ADMIN_USER_ID, expect.anything());
    });

    it("returns 409 when user is not suspended", async () => {
      authAs(adminUser);
      mockReactivateUser.mockRejectedValue(
        new AppError("Only suspended users can be reactivated", 409, "CONFLICT"),
      );

      const res = await request(app)
        .put(`/api/admin/users/${USER_ID}/reactivate`)
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(409);
    });
  });

  // =========================================================================
  // GET /api/admin/users/pending-count
  // =========================================================================
  describe("GET /api/admin/users/pending-count", () => {
    it("returns pending counts", async () => {
      authAs(adminUser);
      mockGetPendingCount.mockResolvedValue({ users: 5, suppliers: 3, products: 8 });

      const res = await request(app)
        .get("/api/admin/users/pending-count")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ users: 5, suppliers: 3, products: 8 });
    });
  });
});
