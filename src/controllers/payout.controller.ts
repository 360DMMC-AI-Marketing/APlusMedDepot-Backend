import { Request, Response } from "express";
import { z } from "zod";

import { PayoutService } from "../services/payout.service";
import { SupplierProductService } from "../services/supplierProduct.service";

const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const createPayoutSchema = z.object({
  supplierId: z.string().uuid("Invalid supplier ID"),
  amount: z.number().positive("Amount must be positive"),
  periodStart: z.string().min(1, "Period start is required"),
  periodEnd: z.string().min(1, "Period end is required"),
  commissionTotal: z.number().nonnegative("Commission total must be non-negative"),
  itemsCount: z.number().int().nonnegative("Items count must be non-negative"),
});

export class PayoutController {
  /** GET /api/suppliers/me/payouts/balance */
  static async getBalance(req: Request, res: Response): Promise<void> {
    const supplierId = await SupplierProductService.getSupplierIdFromUserId(req.user!.id);
    const balance = await PayoutService.getSupplierBalance(supplierId);
    res.status(200).json(balance);
  }

  /** GET /api/suppliers/me/payouts/history */
  static async getHistory(req: Request, res: Response): Promise<void> {
    const query = paginationSchema.parse(req.query);
    const supplierId = await SupplierProductService.getSupplierIdFromUserId(req.user!.id);
    const result = await PayoutService.getPayoutHistory(supplierId, {
      page: query.page,
      limit: query.limit,
    });
    res.status(200).json(result);
  }

  /** GET /api/suppliers/me/payouts/summary */
  static async getSummary(req: Request, res: Response): Promise<void> {
    const supplierId = await SupplierProductService.getSupplierIdFromUserId(req.user!.id);
    const summary = await PayoutService.getPayoutSummary(supplierId);
    res.status(200).json(summary);
  }

  /** POST /api/admin/payouts */
  static async createPayout(req: Request, res: Response): Promise<void> {
    const validated = createPayoutSchema.parse(req.body);
    const record = await PayoutService.createPayoutRecord(validated.supplierId, {
      amount: validated.amount,
      periodStart: validated.periodStart,
      periodEnd: validated.periodEnd,
      commissionTotal: validated.commissionTotal,
      itemsCount: validated.itemsCount,
    });
    res.status(201).json(record);
  }
}
