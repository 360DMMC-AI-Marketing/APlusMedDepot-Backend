import { Request, Response } from "express";

import { SupplierProductService } from "../services/supplierProduct.service";
import {
  supplierProductQuerySchema,
  createSupplierProductSchema,
  updateSupplierProductSchema,
  uuidParamSchema,
} from "../validators/supplierProduct.validator";
import { badRequest } from "../utils/errors";

export class SupplierProductController {
  static async list(req: Request, res: Response): Promise<void> {
    const query = supplierProductQuerySchema.parse(req.query);
    const supplierId = await SupplierProductService.getSupplierIdFromUserId(req.user!.id);

    const result = await SupplierProductService.list(supplierId, query);

    res.status(200).json(result);
  }

  static async create(req: Request, res: Response): Promise<void> {
    const validated = createSupplierProductSchema.parse(req.body);
    const supplierId = await SupplierProductService.getSupplierIdFromUserId(req.user!.id);

    const product = await SupplierProductService.create(supplierId, validated);

    res.status(201).json(product);
  }

  static async update(req: Request, res: Response): Promise<void> {
    const productId = uuidParamSchema.parse(req.params.id);
    const validated = updateSupplierProductSchema.parse(req.body);
    const supplierId = await SupplierProductService.getSupplierIdFromUserId(req.user!.id);

    const product = await SupplierProductService.update(supplierId, productId, validated);

    res.status(200).json(product);
  }

  static async softDelete(req: Request, res: Response): Promise<void> {
    const productId = uuidParamSchema.parse(req.params.id);
    const supplierId = await SupplierProductService.getSupplierIdFromUserId(req.user!.id);

    await SupplierProductService.softDelete(supplierId, productId);

    res.status(200).json({ message: "Product deleted" });
  }

  static async getStats(req: Request, res: Response): Promise<void> {
    const supplierId = await SupplierProductService.getSupplierIdFromUserId(req.user!.id);

    const stats = await SupplierProductService.getStats(supplierId);

    res.status(200).json(stats);
  }

  static async uploadImage(req: Request, res: Response): Promise<void> {
    const productId = uuidParamSchema.parse(req.params.id);
    const supplierId = await SupplierProductService.getSupplierIdFromUserId(req.user!.id);

    if (!req.file) {
      throw badRequest("No image file provided");
    }

    const product = await SupplierProductService.uploadImage(supplierId, productId, req.file);

    res.status(201).json(product);
  }

  static async deleteImage(req: Request, res: Response): Promise<void> {
    const productId = uuidParamSchema.parse(req.params.id);
    const imageIndex = Number(req.params.imageIndex);

    if (Number.isNaN(imageIndex) || imageIndex < 0) {
      throw badRequest("Invalid image index");
    }

    const supplierId = await SupplierProductService.getSupplierIdFromUserId(req.user!.id);

    const product = await SupplierProductService.deleteImage(supplierId, productId, imageIndex);

    res.status(200).json(product);
  }
}
