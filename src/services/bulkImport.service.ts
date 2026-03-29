import { z } from "zod";
import { supabaseAdmin } from "../config/supabase";
import { AppError } from "../utils/errors";
import { categoryEnum } from "../constants/categories";
import type { BulkProductInput, BulkImportResult } from "../types/bulkImport.types";

const productSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(5000).optional(),
  sku: z.string().min(1).max(100),
  price: z.number().positive(),
  originalPrice: z.number().positive().optional().nullable(),
  stockQuantity: z.number().int().min(0),
  category: z.enum(categoryEnum),
  specifications: z.record(z.string(), z.string()).optional(),
});

export class BulkImportService {
  static async importProducts(
    supplierId: string,
    products: BulkProductInput[],
  ): Promise<BulkImportResult> {
    if (products.length === 0) {
      throw new AppError("No products provided", 400, "VALIDATION_ERROR");
    }

    if (products.length > 100) {
      throw new AppError("Maximum 100 products per batch", 400, "VALIDATION_ERROR");
    }

    const errors: Array<{ row: number; sku: string; reason: string }> = [];
    const validProducts: Array<{ data: z.infer<typeof productSchema>; row: number }> = [];

    // Validate each product
    for (let i = 0; i < products.length; i++) {
      const result = productSchema.safeParse(products[i]);
      if (!result.success) {
        errors.push({
          row: i + 1,
          sku: products[i].sku || "N/A",
          reason: result.error.issues[0].message,
        });
      } else {
        validProducts.push({ data: result.data, row: i + 1 });
      }
    }

    // Check for duplicate SKUs within the batch
    const seenSkus = new Map<string, number>();
    const deduped: typeof validProducts = [];

    for (const item of validProducts) {
      const prevRow = seenSkus.get(item.data.sku);
      if (prevRow !== undefined) {
        errors.push({
          row: item.row,
          sku: item.data.sku,
          reason: "Duplicate SKU in batch",
        });
      } else {
        seenSkus.set(item.data.sku, item.row);
        deduped.push(item);
      }
    }

    // Check for existing SKUs in the database
    const toInsert = [...deduped];

    if (toInsert.length > 0) {
      const skus = toInsert.map((p) => p.data.sku);
      const { data: existingData } = await supabaseAdmin
        .from("products")
        .select("sku")
        .eq("supplier_id", supplierId)
        .in("sku", skus);

      const existingSkus = new Set(
        ((existingData ?? []) as Array<{ sku: string }>).map((r) => r.sku),
      );

      const filtered: typeof toInsert = [];
      for (const item of toInsert) {
        if (existingSkus.has(item.data.sku)) {
          errors.push({
            row: item.row,
            sku: item.data.sku,
            reason: `SKU '${item.data.sku}' already exists for this supplier`,
          });
        } else {
          filtered.push(item);
        }
      }
      toInsert.length = 0;
      toInsert.push(...filtered);
    }

    // Bulk insert valid products
    let importedCount = 0;

    if (toInsert.length > 0) {
      const insertData = toInsert.map((p) => ({
        supplier_id: supplierId,
        name: p.data.name,
        description: p.data.description || "",
        sku: p.data.sku,
        price: p.data.price,
        original_price: p.data.originalPrice ?? null,
        stock_quantity: p.data.stockQuantity,
        category: p.data.category,
        specifications: p.data.specifications ?? {},
        status: "pending",
      }));

      const { error } = await supabaseAdmin.from("products").insert(insertData);

      if (error) {
        for (const item of toInsert) {
          errors.push({
            row: item.row,
            sku: item.data.sku,
            reason: "Database insert failed",
          });
        }
        importedCount = 0;
      } else {
        importedCount = toInsert.length;
      }
    }

    errors.sort((a, b) => a.row - b.row);

    return {
      imported: importedCount,
      failed: errors.length,
      total: products.length,
      errors,
    };
  }
}
