import { Request, Response } from "express";

import { SupplierService } from "../services/supplier.service";
import { supplierRegistrationSchema } from "../validators/supplier.validator";

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
}
