import request from "supertest";

const mockVerifyToken = jest.fn();

jest.mock("../../src/services/auth.service", () => ({
  AuthService: {
    signUp: jest.fn(),
    verifyToken: mockVerifyToken,
  },
}));

const mockApproveUser = jest.fn();
const mockRejectUser = jest.fn();

jest.mock("../../src/services/adminUser.service", () => ({
  AdminUserService: {
    listUsers: jest
      .fn()
      .mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 }),
    getUserDetail: jest.fn(),
    approveUser: mockApproveUser,
    rejectUser: mockRejectUser,
    suspendUser: jest.fn(),
    reactivateUser: jest.fn(),
    getPendingCount: jest.fn().mockResolvedValue({ users: 0, suppliers: 0, products: 0 }),
  },
}));

jest.mock(
  "express-rate-limit",
  () => () => (_req: unknown, _res: unknown, next: () => void) => next(),
);

import app from "../../src/index";

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

beforeEach(() => {
  jest.clearAllMocks();
});

describe("Vendor Approval/Rejection Updates", () => {
  // ── Approve with commissionRate ───────────────────────────────────────

  describe("PUT /api/admin/users/:id/approve with commissionRate", () => {
    it("approves with commissionRate = 12", async () => {
      mockVerifyToken.mockResolvedValue(adminUser);
      mockApproveUser.mockResolvedValue(undefined);

      const res = await request(app)
        .put(`/api/admin/users/${USER_ID}/approve`)
        .set("Authorization", "Bearer valid-token")
        .send({ commissionRate: 12 });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe("User approved successfully");
      expect(mockApproveUser).toHaveBeenCalledWith(USER_ID, ADMIN_USER_ID, expect.anything(), {
        commissionRate: 12,
      });
    });

    it("approves without commissionRate (backward compat)", async () => {
      mockVerifyToken.mockResolvedValue(adminUser);
      mockApproveUser.mockResolvedValue(undefined);

      const res = await request(app)
        .put(`/api/admin/users/${USER_ID}/approve`)
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(mockApproveUser).toHaveBeenCalledWith(USER_ID, ADMIN_USER_ID, expect.anything(), {
        commissionRate: undefined,
      });
    });

    it("returns 400 for commissionRate > 50", async () => {
      mockVerifyToken.mockResolvedValue(adminUser);

      const res = await request(app)
        .put(`/api/admin/users/${USER_ID}/approve`)
        .set("Authorization", "Bearer valid-token")
        .send({ commissionRate: 55 });

      expect(res.status).toBe(400);
    });

    it("returns 400 for commissionRate < 1", async () => {
      mockVerifyToken.mockResolvedValue(adminUser);

      const res = await request(app)
        .put(`/api/admin/users/${USER_ID}/approve`)
        .set("Authorization", "Bearer valid-token")
        .send({ commissionRate: 0.5 });

      expect(res.status).toBe(400);
    });
  });

  // ── Reject with structured reasons ────────────────────────────────────

  describe("PUT /api/admin/users/:id/reject with structured reasons", () => {
    it("rejects with reasons array", async () => {
      mockVerifyToken.mockResolvedValue(adminUser);
      mockRejectUser.mockResolvedValue(undefined);

      const res = await request(app)
        .put(`/api/admin/users/${USER_ID}/reject`)
        .set("Authorization", "Bearer valid-token")
        .send({ reasons: ["Incomplete documentation", "Missing ID"] });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe("User rejected successfully");
      expect(mockRejectUser).toHaveBeenCalledWith(
        USER_ID,
        ADMIN_USER_ID,
        expect.objectContaining({
          reasons: ["Incomplete documentation", "Missing ID"],
          sendEmail: true,
        }),
        expect.anything(),
      );
    });

    it("rejects with reasons + customReason", async () => {
      mockVerifyToken.mockResolvedValue(adminUser);
      mockRejectUser.mockResolvedValue(undefined);

      const res = await request(app)
        .put(`/api/admin/users/${USER_ID}/reject`)
        .set("Authorization", "Bearer valid-token")
        .send({
          reasons: ["Invalid documentation"],
          customReason: "Additional review notes",
        });

      expect(res.status).toBe(200);
      expect(mockRejectUser).toHaveBeenCalledWith(
        USER_ID,
        ADMIN_USER_ID,
        expect.objectContaining({
          reasons: ["Invalid documentation"],
          customReason: "Additional review notes",
        }),
        expect.anything(),
      );
    });

    it("rejects with sendEmail = false", async () => {
      mockVerifyToken.mockResolvedValue(adminUser);
      mockRejectUser.mockResolvedValue(undefined);

      const res = await request(app)
        .put(`/api/admin/users/${USER_ID}/reject`)
        .set("Authorization", "Bearer valid-token")
        .send({
          reasons: ["Incomplete documentation"],
          sendEmail: false,
        });

      expect(res.status).toBe(200);
      expect(mockRejectUser).toHaveBeenCalledWith(
        USER_ID,
        ADMIN_USER_ID,
        expect.objectContaining({ sendEmail: false }),
        expect.anything(),
      );
    });

    it("old format { reason: string } still accepted", async () => {
      mockVerifyToken.mockResolvedValue(adminUser);
      mockRejectUser.mockResolvedValue(undefined);

      const res = await request(app)
        .put(`/api/admin/users/${USER_ID}/reject`)
        .set("Authorization", "Bearer valid-token")
        .send({ reason: "Invalid documentation submitted" });

      expect(res.status).toBe(200);
      expect(mockRejectUser).toHaveBeenCalledWith(
        USER_ID,
        ADMIN_USER_ID,
        "Invalid documentation submitted",
        expect.anything(),
      );
    });

    it("returns 400 for empty reasons array", async () => {
      mockVerifyToken.mockResolvedValue(adminUser);

      const res = await request(app)
        .put(`/api/admin/users/${USER_ID}/reject`)
        .set("Authorization", "Bearer valid-token")
        .send({ reasons: [] });

      expect(res.status).toBe(400);
    });
  });
});
