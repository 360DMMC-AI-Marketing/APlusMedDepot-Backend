import { Request, Response } from "express";

import { SupplierProductService } from "../services/supplierProduct.service";
import {
  supplierProductQuerySchema,
  createSupplierProductSchema,
  updateSupplierProductSchema,
  uuidParamSchema,
} from "../validators/supplierProduct.validator";

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
}
