import { Request, Response } from "express";
import { z } from "zod";

import { AuditLogService } from "../services/auditLog.service";

const listSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  action: z.string().optional(),
  resourceType: z.string().optional(),
  adminId: z.string().uuid().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

const adminActivitySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export class AuditLogController {
  static async list(req: Request, res: Response): Promise<void> {
    const options = listSchema.parse(req.query);
    const result = await AuditLogService.getAuditLogs(options);
    res.status(200).json(result);
  }

  static async getByResource(req: Request, res: Response): Promise<void> {
    const resourceType = z.string().min(1).parse(req.params.type);
    const resourceId = z.string().min(1).parse(req.params.id);
    const result = await AuditLogService.getAuditLogsByResource(resourceType, resourceId);
    res.status(200).json({ data: result });
  }

  static async getAdminActivity(req: Request, res: Response): Promise<void> {
    const adminId = z.string().uuid().parse(req.params.adminId);
    const options = adminActivitySchema.parse(req.query);
    const result = await AuditLogService.getAdminActivity(adminId, options);
    res.status(200).json(result);
  }
}
