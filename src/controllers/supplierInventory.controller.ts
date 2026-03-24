import { Request, Response } from "express";
import { z } from "zod";

import { SupplierInventoryService } from "../services/supplierInventory.service";

const uuidSchema = z.string().uuid("Invalid product ID format");

const stockUpdateSchema = z.object({
  stock_quantity: z
    .number()
    .int("Stock quantity must be an integer")
    .nonnegative("Stock quantity must be >= 0"),
  low_stock_threshold: z.number().int().nonnegative().optional(),
});

const bulkUpdateSchema = z.object({
  updates: z
    .array(
      z.object({
        product_id: z.string().uuid("Invalid product ID"),
        stock_quantity: z
          .number()
          .int("Stock quantity must be an integer")
          .nonnegative("Stock quantity must be >= 0"),
      }),
    )
    .min(1, "At least one update required"),
});

export class SupplierInventoryController {
  static async list(req: Request, res: Response): Promise<void> {
    const supplierId = await SupplierInventoryService.getSupplierIdFromUserId(req.user!.id);
    const result = await SupplierInventoryService.list(supplierId);
    res.status(200).json(result);
  }

  static async updateStock(req: Request, res: Response): Promise<void> {
    const productId = uuidSchema.parse(req.params.productId);
    const { stock_quantity, low_stock_threshold } = stockUpdateSchema.parse(req.body);
    const supplierId = await SupplierInventoryService.getSupplierIdFromUserId(req.user!.id);

    const result = await SupplierInventoryService.updateStock(
      supplierId,
      productId,
      stock_quantity,
      low_stock_threshold,
      req.user!.id,
    );

    res.status(200).json(result);
  }

  static async bulkUpdate(req: Request, res: Response): Promise<void> {
    const { updates } = bulkUpdateSchema.parse(req.body);
    const supplierId = await SupplierInventoryService.getSupplierIdFromUserId(req.user!.id);

    const result = await SupplierInventoryService.bulkUpdate(supplierId, updates, req.user!.id);

    res.status(200).json(result);
  }

  static async lowStock(req: Request, res: Response): Promise<void> {
    const supplierId = await SupplierInventoryService.getSupplierIdFromUserId(req.user!.id);
    const products = await SupplierInventoryService.getLowStock(supplierId);
    res.status(200).json({ products });
  }
}
