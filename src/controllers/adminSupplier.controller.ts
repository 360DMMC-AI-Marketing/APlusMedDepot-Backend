import { Request, Response } from "express";

import { AdminSupplierService } from "../services/adminSupplier.service";
import {
  listSuppliersQuerySchema,
  approvalSchema,
  rejectionSchema,
  uuidParamSchema,
  commissionQuerySchema,
} from "../validators/adminSupplier.validator";

export class AdminSupplierController {
  static async list(req: Request, res: Response): Promise<void> {
    const query = listSuppliersQuerySchema.parse(req.query);

    const result = await AdminSupplierService.listSuppliers(query);

    res.status(200).json(result);
  }

  static async getDetail(req: Request, res: Response): Promise<void> {
    const id = uuidParamSchema.parse(req.params.id);

    const supplier = await AdminSupplierService.getSupplierDetail(id);

    res.status(200).json(supplier);
  }

  static async approve(req: Request, res: Response): Promise<void> {
    const id = uuidParamSchema.parse(req.params.id);
    const validated = approvalSchema.parse(req.body);

    const supplier = await AdminSupplierService.updateSupplierStatus(id, "approved", {
      commissionRate: validated.commissionRate,
    });

    res.status(200).json({
      message: "Supplier approved successfully",
      supplier,
    });
  }

  static async reject(req: Request, res: Response): Promise<void> {
    const id = uuidParamSchema.parse(req.params.id);
    const validated = rejectionSchema.parse(req.body);

    const supplier = await AdminSupplierService.updateSupplierStatus(id, "rejected", {
      rejectionReason: validated.rejectionReason,
    });

    res.status(200).json({
      message: "Supplier rejected",
      supplier,
    });
  }

  static async requestRevision(req: Request, res: Response): Promise<void> {
    const id = uuidParamSchema.parse(req.params.id);

    const supplier = await AdminSupplierService.updateSupplierStatus(id, "needs_revision");

    res.status(200).json({
      message: "Revision requested",
      supplier,
    });
  }

  static async startReview(req: Request, res: Response): Promise<void> {
    const id = uuidParamSchema.parse(req.params.id);

    const supplier = await AdminSupplierService.updateSupplierStatus(id, "under_review");

    res.status(200).json({
      message: "Supplier moved to under review",
      supplier,
    });
  }

  static async getCommissions(req: Request, res: Response): Promise<void> {
    const query = commissionQuerySchema.parse(req.query);

    const result = await AdminSupplierService.getCommissionReport(query);

    res.status(200).json(result);
  }
}
