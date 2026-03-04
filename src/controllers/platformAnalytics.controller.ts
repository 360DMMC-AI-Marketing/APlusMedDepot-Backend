import { Request, Response } from "express";
import { z } from "zod";

import { PlatformAnalyticsService } from "../services/platformAnalytics.service";

const periodSchema = z.enum(["today", "week", "month", "quarter", "year", "all"]).default("month");

const trendSchema = z.object({
  period: z.enum(["daily", "weekly", "monthly"]).default("daily"),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

const supplierRevenueSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(10),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

const dateRangeSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

const limitSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export class PlatformAnalyticsController {
  static async getRevenue(req: Request, res: Response): Promise<void> {
    const period = periodSchema.parse(req.query.period);
    const result = await PlatformAnalyticsService.getRevenueMetrics(period);
    res.status(200).json(result);
  }

  static async getRevenueBySupplier(req: Request, res: Response): Promise<void> {
    const options = supplierRevenueSchema.parse(req.query);
    const result = await PlatformAnalyticsService.getRevenueBySupplier(options);
    res.status(200).json(result);
  }

  static async getRevenueByCategory(req: Request, res: Response): Promise<void> {
    const options = dateRangeSchema.parse(req.query);
    const result = await PlatformAnalyticsService.getRevenueByCategory(options);
    res.status(200).json(result);
  }

  static async getRevenueTrend(req: Request, res: Response): Promise<void> {
    const options = trendSchema.parse(req.query);
    const result = await PlatformAnalyticsService.getRevenueTrend(options);
    res.status(200).json(result);
  }

  static async getOrderMetrics(req: Request, res: Response): Promise<void> {
    const period = periodSchema.parse(req.query.period);
    const result = await PlatformAnalyticsService.getOrderMetrics(period);
    res.status(200).json(result);
  }

  static async getTopProducts(req: Request, res: Response): Promise<void> {
    const { limit } = limitSchema.parse(req.query);
    const result = await PlatformAnalyticsService.getTopProducts(limit);
    res.status(200).json(result);
  }
}
