import { Request, Response } from "express";
import { z } from "zod";

import { SupplierAnalyticsService } from "../services/supplierAnalytics.service";

const uuidSchema = z.string().uuid("Invalid product ID format");

const periodSchema = z.enum(["7d", "30d", "90d", "all"]).default("30d");

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
}
