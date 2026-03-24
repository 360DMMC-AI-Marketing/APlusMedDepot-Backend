import { supabaseAdmin } from "../config/supabase";
import { sendEmail } from "./email.service";
import { baseLayout, escapeHtml } from "../templates/baseLayout";
import { notFound } from "../utils/errors";
import type { NotificationType, NotificationRecord, PaginatedResult } from "../types/admin.types";

type NotificationRow = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  data: Record<string, unknown>;
  read: boolean;
  email_sent: boolean;
  created_at: string;
};

function mapRow(row: NotificationRow): NotificationRecord {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type as NotificationType,
    title: row.title,
    message: row.message,
    data: row.data ?? {},
    read: row.read,
    emailSent: row.email_sent,
    createdAt: row.created_at,
  };
}

export class NotificationService {
  static async send(options: {
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    data?: Record<string, unknown>;
    sendEmail?: boolean;
    emailSubject?: string;
  }): Promise<void> {
    const shouldEmail = options.sendEmail !== false;

    const { error } = await supabaseAdmin.from("notifications").insert({
      user_id: options.userId,
      type: options.type,
      title: options.title,
      message: options.message,
      data: options.data ?? {},
      email_sent: shouldEmail,
    });

    if (error) {
      throw new Error(`Failed to create notification: ${error.message}`);
    }

    if (shouldEmail) {
      // Fire-and-forget email
      void (async () => {
        try {
          const { data: user } = await supabaseAdmin
            .from("users")
            .select("email")
            .eq("id", options.userId)
            .single();

          if (user) {
            const userRow = user as unknown as { email: string };
            const subject = options.emailSubject ?? options.title;
            const html = baseLayout({
              title: escapeHtml(options.title),
              preheader: escapeHtml(options.title),
              body: `<p>${escapeHtml(options.message)}</p>`,
            });
            await sendEmail(userRow.email, subject, html);
          }
        } catch {
          // Email failure should not affect notification creation
        }
      })();
    }
  }

  static async sendBulk(options: {
    userIds: string[];
    type: NotificationType;
    title: string;
    message: string;
    data?: Record<string, unknown>;
    sendEmail?: boolean;
  }): Promise<{ sent: number; failed: number }> {
    const results = await Promise.allSettled(
      options.userIds.map((userId) =>
        NotificationService.send({
          userId,
          type: options.type,
          title: options.title,
          message: options.message,
          data: options.data,
          sendEmail: options.sendEmail,
        }),
      ),
    );

    let sent = 0;
    let failed = 0;
    for (const result of results) {
      if (result.status === "fulfilled") sent++;
      else failed++;
    }

    return { sent, failed };
  }

  static async sendToRole(options: {
    role: "customer" | "supplier";
    type: NotificationType;
    title: string;
    message: string;
    sendEmail?: boolean;
  }): Promise<{ sent: number; failed: number }> {
    const { data: users, error } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("role", options.role)
      .eq("status", "approved");

    if (error) {
      throw new Error(`Failed to fetch users by role: ${error.message}`);
    }

    const userIds = ((users ?? []) as Array<{ id: string }>).map((u) => u.id);

    if (userIds.length === 0) {
      return { sent: 0, failed: 0 };
    }

    return NotificationService.sendBulk({
      userIds,
      type: options.type,
      title: options.title,
      message: options.message,
      sendEmail: options.sendEmail,
    });
  }

  static async getUserNotifications(
    userId: string,
    options?: {
      page?: number;
      limit?: number;
      unreadOnly?: boolean;
    },
  ): Promise<PaginatedResult<NotificationRecord>> {
    const page = options?.page ?? 1;
    const limit = options?.limit ?? 20;
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from("notifications")
      .select("id, user_id, type, title, message, data, read, email_sent, created_at", {
        count: "exact",
      })
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (options?.unreadOnly) {
      query = query.eq("read", false);
    }

    const { data, error, count } = await query;

    if (error) {
      throw new Error(`Failed to fetch notifications: ${error.message}`);
    }

    const rows = (data ?? []) as unknown as NotificationRow[];
    const total = count ?? 0;

    return {
      data: rows.map(mapRow),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  static async markAsRead(userId: string, notificationId: string): Promise<void> {
    const { data, error } = await supabaseAdmin
      .from("notifications")
      .update({ read: true })
      .eq("id", notificationId)
      .eq("user_id", userId)
      .select("id")
      .single();

    if (error || !data) {
      throw notFound("Notification");
    }
  }

  static async markAllAsRead(userId: string): Promise<void> {
    await supabaseAdmin
      .from("notifications")
      .update({ read: true })
      .eq("user_id", userId)
      .eq("read", false);
  }

  static async getUnreadCount(userId: string): Promise<number> {
    const { count, error } = await supabaseAdmin
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("read", false);

    if (error) {
      throw new Error(`Failed to get unread count: ${error.message}`);
    }

    return count ?? 0;
  }

  static async deleteNotification(userId: string, notificationId: string): Promise<void> {
    const { data, error } = await supabaseAdmin
      .from("notifications")
      .delete()
      .eq("id", notificationId)
      .eq("user_id", userId)
      .select("id")
      .single();

    if (error || !data) {
      throw notFound("Notification");
    }
  }
}
