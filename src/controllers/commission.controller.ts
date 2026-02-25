import { Request, Response } from "express";

import { CommissionService } from "../services/commission.service";
import { SupplierProductService } from "../services/supplierProduct.service";
import { commissionQuerySchema, uuidParamSchema } from "../validators/commission.validator";

export class CommissionController {
  /** GET /api/suppliers/commissions — supplier sees own commissions */
  static async getMyCommissions(req: Request, res: Response): Promise<void> {
    const query = commissionQuerySchema.parse(req.query);
    const supplierId = await SupplierProductService.getSupplierIdFromUserId(req.user!.id);

    const commissions = await CommissionService.getCommissionsBySupplier(supplierId, {
      startDate: query.startDate,
      endDate: query.endDate,
      status: query.status,
    });

    res.status(200).json({ commissions });
  }

  /** GET /api/suppliers/commissions/summary — supplier commission summary */
  static async getCommissionSummary(req: Request, res: Response): Promise<void> {
    const supplierId = await SupplierProductService.getSupplierIdFromUserId(req.user!.id);

    const summary = await CommissionService.getCommissionSummary(supplierId);

    res.status(200).json(summary);
  }

  /** GET /api/admin/commissions/order/:orderId — admin views commissions for an order */
  static async getOrderCommissions(req: Request, res: Response): Promise<void> {
    const orderId = uuidParamSchema.parse(req.params.orderId);

    const commissions = await CommissionService.getCommissionsByOrder(orderId);

    res.status(200).json({ commissions });
  }

  /** GET /api/admin/commissions/supplier/:supplierId — admin views commissions for a supplier */
  static async getPlatformCommissions(req: Request, res: Response): Promise<void> {
    const supplierId = uuidParamSchema.parse(req.params.supplierId);
    const query = commissionQuerySchema.parse(req.query);

    const commissions = await CommissionService.getCommissionsBySupplier(supplierId, {
      startDate: query.startDate,
      endDate: query.endDate,
      status: query.status,
    });

    res.status(200).json({ commissions });
  }
}
