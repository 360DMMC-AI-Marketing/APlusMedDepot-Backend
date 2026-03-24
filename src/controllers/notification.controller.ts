import { Request, Response } from "express";
import { z } from "zod";

import { NotificationService } from "../services/notification.service";

const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  unreadOnly: z
    .string()
    .optional()
    .transform((v) => v === "true"),
});

const uuidSchema = z.string().uuid("Invalid ID format");

const bulkSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(1000),
  type: z.string(),
  title: z.string().min(1).max(255),
  message: z.string().min(1).max(2000),
  sendEmail: z.boolean().default(true),
});

const roleSchema = z.object({
  role: z.enum(["customer", "supplier"]),
  type: z.string(),
  title: z.string().min(1).max(255),
  message: z.string().min(1).max(2000),
  sendEmail: z.boolean().default(true),
});

export class NotificationController {
  static async getMyNotifications(req: Request, res: Response): Promise<void> {
    const options = paginationSchema.parse(req.query);
    const result = await NotificationService.getUserNotifications(req.user!.id, options);
    res.status(200).json(result);
  }

  static async markAsRead(req: Request, res: Response): Promise<void> {
    const notificationId = uuidSchema.parse(req.params.id);
    await NotificationService.markAsRead(req.user!.id, notificationId);
    res.status(200).json({ message: "Notification marked as read" });
  }

  static async markAllAsRead(req: Request, res: Response): Promise<void> {
    await NotificationService.markAllAsRead(req.user!.id);
    res.status(200).json({ message: "All notifications marked as read" });
  }

  static async getUnreadCount(req: Request, res: Response): Promise<void> {
    const count = await NotificationService.getUnreadCount(req.user!.id);
    res.status(200).json({ count });
  }

  static async deleteNotification(req: Request, res: Response): Promise<void> {
    const notificationId = uuidSchema.parse(req.params.id);
    await NotificationService.deleteNotification(req.user!.id, notificationId);
    res.status(200).json({ message: "Notification deleted" });
  }

  static async sendBulkNotification(req: Request, res: Response): Promise<void> {
    const body = bulkSchema.parse(req.body);
    const result = await NotificationService.sendBulk({
      userIds: body.userIds,
      type: body.type as Parameters<typeof NotificationService.send>[0]["type"],
      title: body.title,
      message: body.message,
      sendEmail: body.sendEmail,
    });
    res.status(200).json(result);
  }

  static async sendRoleNotification(req: Request, res: Response): Promise<void> {
    const body = roleSchema.parse(req.body);
    const result = await NotificationService.sendToRole({
      role: body.role,
      type: body.type as Parameters<typeof NotificationService.send>[0]["type"],
      title: body.title,
      message: body.message,
      sendEmail: body.sendEmail,
    });
    res.status(200).json(result);
  }
}
