import { Request, Response } from "express";
import { z } from "zod";

import { SupplierAnalyticsService } from "../services/supplierAnalytics.service";

const uuidSchema = z.string().uuid("Invalid product ID format");

const periodSchema = z.enum(["7d", "30d", "90d", "all"]).default("30d");

const trendPeriodSchema = z.enum(["week", "month", "3months"]).default("month");

const topProductsLimitSchema = z.coerce.number().int().min(1).max(20).default(5);

export class SupplierAnalyticsController {
  static async getProductAnalytics(req: Request, res: Response): Promise<void> {
    const productId = uuidSchema.parse(req.params.id);
    const period = periodSchema.parse(req.query.period ?? "30d");
    const supplierId = await SupplierAnalyticsService.getSupplierIdFromUserId(req.user!.id);
    const result = await SupplierAnalyticsService.getProductAnalytics(
      supplierId,
      productId,
      period,
    );
    res.status(200).json(result);
  }

  static async getAggregateAnalytics(req: Request, res: Response): Promise<void> {
    const supplierId = await SupplierAnalyticsService.getSupplierIdFromUserId(req.user!.id);
    const result = await SupplierAnalyticsService.getAggregateAnalytics(supplierId);
    res.status(200).json(result);
  }

  static async getDashboardStats(req: Request, res: Response): Promise<void> {
    const supplierId = await SupplierAnalyticsService.getSupplierIdFromUserId(req.user!.id);
    const result = await SupplierAnalyticsService.getDashboardStats(supplierId);
    res.status(200).json(result);
  }

  static async getTopProducts(req: Request, res: Response): Promise<void> {
    const limit = topProductsLimitSchema.parse(req.query.limit ?? 5);
    const supplierId = await SupplierAnalyticsService.getSupplierIdFromUserId(req.user!.id);
    const result = await SupplierAnalyticsService.getTopProducts(supplierId, limit);
    res.status(200).json(result);
  }

  static async getRevenueTrend(req: Request, res: Response): Promise<void> {
    const period = trendPeriodSchema.parse(req.query.period ?? "month");
    const supplierId = await SupplierAnalyticsService.getSupplierIdFromUserId(req.user!.id);
    const result = await SupplierAnalyticsService.getRevenueTrend(supplierId, period);
    res.status(200).json(result);
  }

  static async getOrderStatusBreakdown(req: Request, res: Response): Promise<void> {
    const supplierId = await SupplierAnalyticsService.getSupplierIdFromUserId(req.user!.id);
    const result = await SupplierAnalyticsService.getOrderStatusBreakdown(supplierId);
    res.status(200).json(result);
  }
}
