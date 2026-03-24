import { Request, Response } from "express";

import { SupplierService } from "../services/supplier.service";
import {
  supplierRegistrationSchema,
  supplierUpdateSchema,
  documentUploadSchema,
} from "../validators/supplier.validator";
import { badRequest } from "../utils/errors";

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

  static async uploadDocument(req: Request, res: Response): Promise<void> {
    const validated = documentUploadSchema.parse(req.body);

    if (!req.file) {
      throw badRequest("No file uploaded");
    }

    const document = await SupplierService.uploadDocument(
      req.supplier!.id,
      req.file,
      validated.documentType,
    );

    res.status(201).json({
      message: "Document uploaded successfully",
      document,
    });
  }

  static async listDocuments(req: Request, res: Response): Promise<void> {
    const documents = await SupplierService.listDocuments(req.supplier!.id);

    res.status(200).json({
      documents,
    });
  }

  static async deleteDocument(req: Request, res: Response): Promise<void> {
    const documentId = req.params.documentId as string;

    await SupplierService.deleteDocument(req.supplier!.id, documentId);

    res.status(204).send();
  }

  static async resubmitApplication(req: Request, res: Response): Promise<void> {
    const supplier = await SupplierService.resubmitApplication(req.supplier!.id);

    res.status(200).json({
      message: "Application resubmitted successfully",
      supplier,
    });
  }
}
