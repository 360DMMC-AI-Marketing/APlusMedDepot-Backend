import { Request, Response } from "express";
import { z } from "zod";

import { supabaseAdmin } from "../config/supabase";
import { BulkImportService } from "../services/bulkImport.service";
import { forbidden } from "../utils/errors";

const bulkImportSchema = z.object({
  products: z
    .array(
      z.object({
        name: z.string(),
        description: z.string().optional(),
        sku: z.string(),
        price: z.number(),
        originalPrice: z.number().optional().nullable(),
        stockQuantity: z.number(),
        category: z.string(),
        specifications: z.record(z.string(), z.string()).optional(),
      }),
    )
    .min(1, "At least one product required")
    .max(100, "Maximum 100 products per batch"),
});

export class BulkImportController {
  static async importProducts(req: Request, res: Response): Promise<void> {
    // Resolve supplier from authenticated user
    const { data: supplierData, error: supplierError } = await supabaseAdmin
      .from("suppliers")
      .select("id, status")
      .eq("user_id", req.user!.id)
      .maybeSingle();

    if (supplierError || !supplierData) {
      throw forbidden("Only approved suppliers can import products");
    }

    const supplier = supplierData as { id: string; status: string };

    if (supplier.status !== "approved") {
      throw forbidden("Only approved suppliers can import products");
    }

    const validated = bulkImportSchema.parse(req.body);

    const result = await BulkImportService.importProducts(supplier.id, validated.products);
    res.status(200).json(result);
  }
}
