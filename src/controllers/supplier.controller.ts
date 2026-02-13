import { Request, Response } from "express";

import { SupplierService } from "../services/supplier.service";
import { supplierRegistrationSchema, supplierUpdateSchema } from "../validators/supplier.validator";

export class SupplierController {
  static async register(req: Request, res: Response): Promise<void> {
    const validated = supplierRegistrationSchema.parse(req.body);

    const files = (req.files as Express.Multer.File[]) || [];

    const supplier = await SupplierService.register(req.user!.id, validated, files);

    res.status(201).json({
      message: "Supplier registration submitted successfully. Pending admin review.",
      supplier: {
        id: supplier.id,
        userId: supplier.userId,
        businessName: supplier.businessName,
        businessType: supplier.businessType,
        status: supplier.status,
        commissionRate: supplier.commissionRate,
        createdAt: supplier.createdAt,
      },
    });
  }

  static async getProfile(req: Request, res: Response): Promise<void> {
    const profile = await SupplierService.getProfile(req.supplier!.id);

    res.status(200).json(profile);
  }

  static async updateProfile(req: Request, res: Response): Promise<void> {
    const validated = supplierUpdateSchema.parse(req.body);

    const supplier = await SupplierService.updateProfile(req.supplier!.id, validated);

    res.status(200).json({
      message: "Supplier profile updated successfully",
      supplier,
    });
  }
}
