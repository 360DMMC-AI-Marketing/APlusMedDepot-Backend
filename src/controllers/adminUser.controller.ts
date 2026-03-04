import { Request, Response } from "express";
import { z } from "zod";

import { AdminUserService } from "../services/adminUser.service";

const uuidSchema = z.string().uuid("Invalid user ID format");

const listUsersSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["pending", "approved", "suspended", "rejected"]).optional(),
  role: z.enum(["customer", "supplier", "admin"]).optional(),
  search: z.string().optional(),
  sortBy: z.enum(["created_at", "email", "status"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

const reasonSchema = z.object({
  reason: z
    .string()
    .min(10, "Reason must be at least 10 characters")
    .max(500, "Reason must not exceed 500 characters"),
});

export class AdminUserController {
  static async list(req: Request, res: Response): Promise<void> {
    const options = listUsersSchema.parse(req.query);
    const result = await AdminUserService.listUsers(options);
    res.status(200).json(result);
  }

  static async getDetail(req: Request, res: Response): Promise<void> {
    const userId = uuidSchema.parse(req.params.id);
    const result = await AdminUserService.getUserDetail(userId);
    res.status(200).json(result);
  }

  static async approve(req: Request, res: Response): Promise<void> {
    const userId = uuidSchema.parse(req.params.id);
    await AdminUserService.approveUser(userId, req.user!.id);
    res.status(200).json({ message: "User approved successfully" });
  }

  static async reject(req: Request, res: Response): Promise<void> {
    const userId = uuidSchema.parse(req.params.id);
    const { reason } = reasonSchema.parse(req.body);
    await AdminUserService.rejectUser(userId, req.user!.id, reason);
    res.status(200).json({ message: "User rejected successfully" });
  }

  static async suspend(req: Request, res: Response): Promise<void> {
    const userId = uuidSchema.parse(req.params.id);
    const { reason } = reasonSchema.parse(req.body);
    await AdminUserService.suspendUser(userId, req.user!.id, reason);
    res.status(200).json({ message: "User suspended successfully" });
  }

  static async reactivate(req: Request, res: Response): Promise<void> {
    const userId = uuidSchema.parse(req.params.id);
    await AdminUserService.reactivateUser(userId, req.user!.id);
    res.status(200).json({ message: "User reactivated successfully" });
  }

  static async getPendingCount(req: Request, res: Response): Promise<void> {
    const result = await AdminUserService.getPendingCount();
    res.status(200).json(result);
  }
}
