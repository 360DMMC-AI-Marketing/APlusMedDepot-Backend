import { Request, Response } from "express";
import { z } from "zod";

import { CommissionReportService } from "../services/commissionReport.service";

const earningsSchema = z.object({
  period: z.enum(["week", "month", "quarter", "year"]).default("month"),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

const bySupplierSchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const trendSchema = z.object({
  granularity: z.enum(["daily", "weekly", "monthly"]).default("weekly"),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export class CommissionReportController {
  static async getPlatformEarnings(req: Request, res: Response): Promise<void> {
    const options = earningsSchema.parse(req.query);
    const result = await CommissionReportService.getPlatformEarnings(options);
    res.status(200).json(result);
  }

  static async getBySupplier(req: Request, res: Response): Promise<void> {
    const options = bySupplierSchema.parse(req.query);
    const result = await CommissionReportService.getCommissionBySupplierReport(options);
    res.status(200).json(result);
  }

  static async getTrend(req: Request, res: Response): Promise<void> {
    const options = trendSchema.parse(req.query);
    const result = await CommissionReportService.getCommissionTrend(options);
    res.status(200).json(result);
  }
}
