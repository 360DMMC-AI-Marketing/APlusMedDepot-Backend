const mockFrom = jest.fn();

jest.mock("../../src/config/supabase", () => ({
  supabaseAdmin: {
    from: mockFrom,
  },
}));

jest.mock("../../src/services/email.service", () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
}));

import { NotificationService } from "../../src/services/notification.service";
import { sendEmail } from "../../src/services/email.service";

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
  chain.gte = jest.fn(self);
  chain.lte = jest.fn(self);
  chain.is = jest.fn(self);
  chain.in = jest.fn(self);
  chain.order = jest.fn(self);
  chain.range = jest.fn(self);
  chain.limit = jest.fn(self);
  chain.single = jest.fn().mockResolvedValue(resolved);
  chain.then = jest
    .fn()
    .mockImplementation((resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(resolved).then(resolve, reject),
    );
  return chain;
}

const USER_ID = "user-uuid-1";
const NOTIF_ID = "notif-uuid-1";

beforeEach(() => {
  jest.clearAllMocks();
});

// ── send ───────────────────────────────────────────────────────────────

describe("NotificationService.send", () => {
  it("creates notification in database", async () => {
    const insertQ = mockQuery({});
    const emailQ = mockQuery({ data: { email: "user@example.com" } });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return insertQ;
      return emailQ;
    });

    await NotificationService.send({
      userId: USER_ID,
      type: "order_confirmed",
      title: "Order Confirmed",
      message: "Your order has been confirmed.",
    });

    expect(insertQ.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: USER_ID,
        type: "order_confirmed",
        title: "Order Confirmed",
        email_sent: true,
      }),
    );
  });

  it("does not send email when sendEmail is false", async () => {
    mockFrom.mockReturnValue(mockQuery({}));

    await NotificationService.send({
      userId: USER_ID,
      type: "order_confirmed",
      title: "Test",
      message: "Test message",
      sendEmail: false,
    });

    // Give time for any async email to fire
    await new Promise((r) => setTimeout(r, 50));

    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("email failure does not prevent notification creation", async () => {
    const insertQ = mockQuery({});
    const emailQ = mockQuery({ data: { email: "user@example.com" } });

    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return insertQ;
      return emailQ;
    });

    (sendEmail as jest.Mock).mockRejectedValueOnce(new Error("Email failed"));

    // Should not throw
    await NotificationService.send({
      userId: USER_ID,
      type: "order_confirmed",
      title: "Test",
      message: "Test message",
    });

    expect(insertQ.insert).toHaveBeenCalled();
  });
});

// ── sendBulk ───────────────────────────────────────────────────────────

describe("NotificationService.sendBulk", () => {
  it("sends to multiple users and returns counts", async () => {
    mockFrom.mockReturnValue(mockQuery({}));

    const result = await NotificationService.sendBulk({
      userIds: ["u1", "u2", "u3"],
      type: "system_announcement",
      title: "Announcement",
      message: "Test",
      sendEmail: false,
    });

    expect(result.sent).toBe(3);
    expect(result.failed).toBe(0);
  });

  it("handles partial failures gracefully", async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      // Second notification insert fails
      if (callCount === 2) return mockQuery({ error: { message: "DB error" } });
      return mockQuery({});
    });

    const result = await NotificationService.sendBulk({
      userIds: ["u1", "u2", "u3"],
      type: "system_announcement",
      title: "Test",
      message: "Test",
      sendEmail: false,
    });

    expect(result.sent).toBe(2);
    expect(result.failed).toBe(1);
  });
});

// ── getUserNotifications ───────────────────────────────────────────────

describe("NotificationService.getUserNotifications", () => {
  it("returns paginated notifications", async () => {
    const rows = [
      {
        id: NOTIF_ID,
        user_id: USER_ID,
        type: "order_confirmed",
        title: "Order",
        message: "Confirmed",
        data: {},
        read: false,
        email_sent: true,
        created_at: "2026-01-01T00:00:00Z",
      },
    ];
    mockFrom.mockReturnValue(mockQuery({ data: rows, count: 1 }));

    const result = await NotificationService.getUserNotifications(USER_ID);

    expect(result.data).toHaveLength(1);
    expect(result.data[0].userId).toBe(USER_ID);
    expect(result.data[0].type).toBe("order_confirmed");
    expect(result.total).toBe(1);
  });

  it("filters by unread only", async () => {
    const q = mockQuery({ data: [], count: 0 });
    mockFrom.mockReturnValue(q);

    await NotificationService.getUserNotifications(USER_ID, { unreadOnly: true });

    expect(q.eq).toHaveBeenCalledWith("read", false);
  });
});

// ── markAsRead ─────────────────────────────────────────────────────────

describe("NotificationService.markAsRead", () => {
  it("marks notification as read", async () => {
    const q = mockQuery({ data: { id: NOTIF_ID } });
    mockFrom.mockReturnValue(q);

    await NotificationService.markAsRead(USER_ID, NOTIF_ID);

    expect(q.update).toHaveBeenCalledWith({ read: true });
    expect(q.eq).toHaveBeenCalledWith("id", NOTIF_ID);
    expect(q.eq).toHaveBeenCalledWith("user_id", USER_ID);
  });

  it("throws 404 for non-existent notification", async () => {
    mockFrom.mockReturnValue(mockQuery({ data: null, error: { message: "not found" } }));

    await expect(NotificationService.markAsRead(USER_ID, "nonexistent")).rejects.toThrow(
      "Notification not found",
    );
  });
});

// ── markAllAsRead ──────────────────────────────────────────────────────

describe("NotificationService.markAllAsRead", () => {
  it("marks all unread notifications as read", async () => {
    const q = mockQuery({});
    mockFrom.mockReturnValue(q);

    await NotificationService.markAllAsRead(USER_ID);

    expect(q.update).toHaveBeenCalledWith({ read: true });
    expect(q.eq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(q.eq).toHaveBeenCalledWith("read", false);
  });
});

// ── getUnreadCount ─────────────────────────────────────────────────────

describe("NotificationService.getUnreadCount", () => {
  it("returns correct count", async () => {
    mockFrom.mockReturnValue(mockQuery({ count: 5 }));

    const count = await NotificationService.getUnreadCount(USER_ID);

    expect(count).toBe(5);
  });
});

// ── deleteNotification ─────────────────────────────────────────────────

describe("NotificationService.deleteNotification", () => {
  it("deletes notification", async () => {
    const q = mockQuery({ data: { id: NOTIF_ID } });
    mockFrom.mockReturnValue(q);

    await NotificationService.deleteNotification(USER_ID, NOTIF_ID);

    expect(q.delete).toHaveBeenCalled();
    expect(q.eq).toHaveBeenCalledWith("id", NOTIF_ID);
    expect(q.eq).toHaveBeenCalledWith("user_id", USER_ID);
  });

  it("throws 404 for non-existent notification", async () => {
    mockFrom.mockReturnValue(mockQuery({ data: null, error: { message: "not found" } }));

    await expect(NotificationService.deleteNotification(USER_ID, "nonexistent")).rejects.toThrow(
      "Notification not found",
    );
  });
});
