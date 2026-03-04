import request from "supertest";

const mockVerifyToken = jest.fn();

jest.mock("../../src/services/auth.service", () => ({
  AuthService: {
    signUp: jest.fn(),
    verifyToken: mockVerifyToken,
  },
}));

const mockGetUserNotifications = jest.fn();
const mockMarkAsRead = jest.fn();
const mockMarkAllAsRead = jest.fn();
const mockGetUnreadCount = jest.fn();
const mockDeleteNotification = jest.fn();
const mockSendBulk = jest.fn();
const mockSendToRole = jest.fn();

jest.mock("../../src/services/notification.service", () => ({
  NotificationService: {
    getUserNotifications: mockGetUserNotifications,
    markAsRead: mockMarkAsRead,
    markAllAsRead: mockMarkAllAsRead,
    getUnreadCount: mockGetUnreadCount,
    deleteNotification: mockDeleteNotification,
    sendBulk: mockSendBulk,
    sendToRole: mockSendToRole,
  },
}));

jest.mock(
  "express-rate-limit",
  () => () => (_req: unknown, _res: unknown, next: () => void) => next(),
);

import app from "../../src/index";
import { AppError } from "../../src/utils/errors";

const NOTIF_ID = "a0000000-0000-4000-8000-000000000001";
const USER_ID = "b0000000-0000-4000-8000-000000000001";

const adminUser = {
  id: "admin-user-001",
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
  id: USER_ID,
  email: "customer@example.com",
  firstName: "Jane",
  lastName: "Doe",
  companyName: null,
  phone: null,
  role: "customer" as const,
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

function authAs(user: Record<string, unknown>) {
  mockVerifyToken.mockResolvedValue(user);
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ── User notification routes ────────────────────────────────────────────

describe("User Notification API", () => {
  it("returns 401 without auth token", async () => {
    const res = await request(app).get("/api/notifications");
    expect(res.status).toBe(401);
  });

  describe("GET /notifications", () => {
    it("returns paginated notifications for user", async () => {
      authAs(customerUser);
      mockGetUserNotifications.mockResolvedValue({
        data: [
          {
            id: NOTIF_ID,
            userId: USER_ID,
            type: "order_confirmed",
            title: "Order",
            message: "Done",
            data: {},
            read: false,
            emailSent: true,
            createdAt: "2026-01-01T00:00:00Z",
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });

      const res = await request(app)
        .get("/api/notifications")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].type).toBe("order_confirmed");
      expect(mockGetUserNotifications).toHaveBeenCalledWith(USER_ID, expect.any(Object));
    });

    it("filters by unreadOnly", async () => {
      authAs(customerUser);
      mockGetUserNotifications.mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      });

      await request(app)
        .get("/api/notifications?unreadOnly=true")
        .set("Authorization", "Bearer valid-token");

      expect(mockGetUserNotifications).toHaveBeenCalledWith(
        USER_ID,
        expect.objectContaining({ unreadOnly: true }),
      );
    });
  });

  describe("GET /notifications/unread-count", () => {
    it("returns unread count", async () => {
      authAs(customerUser);
      mockGetUnreadCount.mockResolvedValue(3);

      const res = await request(app)
        .get("/api/notifications/unread-count")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(3);
    });
  });

  describe("PUT /notifications/:id/read", () => {
    it("marks notification as read", async () => {
      authAs(customerUser);
      mockMarkAsRead.mockResolvedValue(undefined);

      const res = await request(app)
        .put(`/api/notifications/${NOTIF_ID}/read`)
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(mockMarkAsRead).toHaveBeenCalledWith(USER_ID, NOTIF_ID);
    });

    it("returns 404 for non-existent notification", async () => {
      authAs(customerUser);
      mockMarkAsRead.mockRejectedValue(new AppError("Notification not found", 404, "NOT_FOUND"));

      const res = await request(app)
        .put(`/api/notifications/${NOTIF_ID}/read`)
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(404);
    });
  });

  describe("PUT /notifications/read-all", () => {
    it("marks all as read", async () => {
      authAs(customerUser);
      mockMarkAllAsRead.mockResolvedValue(undefined);

      const res = await request(app)
        .put("/api/notifications/read-all")
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(mockMarkAllAsRead).toHaveBeenCalledWith(USER_ID);
    });
  });

  describe("DELETE /notifications/:id", () => {
    it("deletes notification", async () => {
      authAs(customerUser);
      mockDeleteNotification.mockResolvedValue(undefined);

      const res = await request(app)
        .delete(`/api/notifications/${NOTIF_ID}`)
        .set("Authorization", "Bearer valid-token");

      expect(res.status).toBe(200);
      expect(mockDeleteNotification).toHaveBeenCalledWith(USER_ID, NOTIF_ID);
    });
  });
});

// ── Admin notification routes ───────────────────────────────────────────

describe("Admin Notification API", () => {
  it("returns 403 for non-admin on bulk send", async () => {
    authAs(supplierUser);
    const res = await request(app)
      .post("/api/admin/notifications/bulk")
      .set("Authorization", "Bearer valid-token")
      .send({ userIds: [USER_ID], type: "system_announcement", title: "Test", message: "Hello" });
    expect(res.status).toBe(403);
  });

  describe("POST /admin/notifications/bulk", () => {
    it("sends bulk notification", async () => {
      authAs(adminUser);
      mockSendBulk.mockResolvedValue({ sent: 2, failed: 0 });

      const res = await request(app)
        .post("/api/admin/notifications/bulk")
        .set("Authorization", "Bearer valid-token")
        .send({
          userIds: [USER_ID, "a0000000-0000-4000-8000-000000000002"],
          type: "system_announcement",
          title: "System Update",
          message: "We have updated the system.",
          sendEmail: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.sent).toBe(2);
      expect(res.body.failed).toBe(0);
    });

    it("returns 400 for empty userIds", async () => {
      authAs(adminUser);
      const res = await request(app)
        .post("/api/admin/notifications/bulk")
        .set("Authorization", "Bearer valid-token")
        .send({ userIds: [], type: "system_announcement", title: "Test", message: "Hello" });
      expect(res.status).toBe(400);
    });
  });

  describe("POST /admin/notifications/role", () => {
    it("sends role notification", async () => {
      authAs(adminUser);
      mockSendToRole.mockResolvedValue({ sent: 10, failed: 0 });

      const res = await request(app)
        .post("/api/admin/notifications/role")
        .set("Authorization", "Bearer valid-token")
        .send({
          role: "customer",
          type: "system_announcement",
          title: "Welcome",
          message: "Welcome to our platform.",
          sendEmail: false,
        });

      expect(res.status).toBe(200);
      expect(res.body.sent).toBe(10);
    });

    it("returns 400 for invalid role", async () => {
      authAs(adminUser);
      const res = await request(app)
        .post("/api/admin/notifications/role")
        .set("Authorization", "Bearer valid-token")
        .send({ role: "admin", type: "system_announcement", title: "Test", message: "Hello" });
      expect(res.status).toBe(400);
    });
  });
});
