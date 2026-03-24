import { supabaseAdmin } from "../config/supabase";
import { SupplierProductService } from "./supplierProduct.service";
import { AppError, notFound, forbidden, badRequest } from "../utils/errors";

export interface InventoryProduct {
  id: string;
  name: string;
  sku: string;
  stock_quantity: number;
  low_stock_threshold: number;
  is_low_stock: boolean;
  last_restocked_at: string | null;
}

export interface InventoryListResponse {
  products: InventoryProduct[];
  summary: {
    total_items: number;
    low_stock_count: number;
    out_of_stock_count: number;
  };
}

export interface StockUpdateResult {
  id: string;
  name: string;
  sku: string;
  stock_quantity: number;
  low_stock_threshold: number;
  is_low_stock: boolean;
  last_restocked_at: string | null;
}

interface ProductRow {
  id: string;
  name: string;
  sku: string;
  stock_quantity: number;
  low_stock_threshold: number;
  last_restocked_at: string | null;
}

const INVENTORY_FIELDS = "id, name, sku, stock_quantity, low_stock_threshold, last_restocked_at";

function toInventoryProduct(row: ProductRow): InventoryProduct {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    stock_quantity: row.stock_quantity,
    low_stock_threshold: row.low_stock_threshold,
    is_low_stock: row.stock_quantity <= row.low_stock_threshold,
    last_restocked_at: row.last_restocked_at,
  };
}

export class SupplierInventoryService {
  /**
   * Resolve the supplier_id from a user_id. Re-uses SupplierProductService
   * for consistency (checks approved status).
   */
  static async getSupplierIdFromUserId(userId: string): Promise<string> {
    return SupplierProductService.getSupplierIdFromUserId(userId);
  }

  /**
   * GET /api/suppliers/inventory
   */
  static async list(supplierId: string): Promise<InventoryListResponse> {
    const { data, error } = await supabaseAdmin
      .from("products")
      .select(INVENTORY_FIELDS)
      .eq("supplier_id", supplierId)
      .eq("is_deleted", false)
      .order("stock_quantity", { ascending: true });

    if (error) {
      throw new AppError(error.message, 500, "DATABASE_ERROR");
    }

    const rows = (data ?? []) as ProductRow[];
    const products = rows.map(toInventoryProduct);

    const lowStockCount = products.filter((p) => p.stock_quantity > 0 && p.is_low_stock).length;
    const outOfStockCount = products.filter((p) => p.stock_quantity === 0).length;

    return {
      products,
      summary: {
        total_items: products.length,
        low_stock_count: lowStockCount,
        out_of_stock_count: outOfStockCount,
      },
    };
  }

  /**
   * PUT /api/suppliers/inventory/:productId
   * Uses SELECT FOR UPDATE to prevent race with concurrent checkout.
   */
  static async updateStock(
    supplierId: string,
    productId: string,
    stockQuantity: number,
    lowStockThreshold?: number,
    userId?: string,
  ): Promise<StockUpdateResult> {
    // 1. Verify product ownership (non-locking read)
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from("products")
      .select("id, supplier_id, stock_quantity")
      .eq("id", productId)
      .eq("is_deleted", false)
      .maybeSingle();

    if (fetchError) {
      throw new AppError(fetchError.message, 500, "DATABASE_ERROR");
    }
    if (!existing) {
      throw notFound("Product");
    }

    const row = existing as { id: string; supplier_id: string; stock_quantity: number };
    if (row.supplier_id !== supplierId) {
      throw forbidden("Not authorized to update this product's inventory");
    }

    // 2. Lock the row via RPC (SELECT FOR UPDATE)
    const { data: lockedRows, error: lockError } = await supabaseAdmin.rpc(
      "lock_products_for_update",
      { product_ids: [productId] },
    );

    if (lockError) {
      throw new AppError(lockError.message, 500, "DATABASE_ERROR");
    }

    const locked = (lockedRows as Array<{ id: string; stock_quantity: number }>) ?? [];
    if (locked.length === 0) {
      throw notFound("Product");
    }

    const oldQuantity = locked[0].stock_quantity;

    // 3. Build update payload
    const updateData: Record<string, unknown> = { stock_quantity: stockQuantity };
    if (lowStockThreshold !== undefined) {
      updateData.low_stock_threshold = lowStockThreshold;
    }
    if (stockQuantity > oldQuantity) {
      updateData.last_restocked_at = new Date().toISOString();
    }

    // 4. Perform the update
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("products")
      .update(updateData)
      .eq("id", productId)
      .select(INVENTORY_FIELDS)
      .single();

    if (updateError) {
      throw new AppError(updateError.message, 500, "DATABASE_ERROR");
    }

    // 5. Record audit log entry
    await supabaseAdmin.from("stock_audit_log").insert({
      product_id: productId,
      supplier_id: supplierId,
      old_quantity: oldQuantity,
      new_quantity: stockQuantity,
      change_source: "supplier_update",
      changed_by: userId ?? null,
    });

    const result = updated as unknown as ProductRow;
    return {
      id: result.id,
      name: result.name,
      sku: result.sku,
      stock_quantity: result.stock_quantity,
      low_stock_threshold: result.low_stock_threshold,
      is_low_stock: result.stock_quantity <= result.low_stock_threshold,
      last_restocked_at: result.last_restocked_at,
    };
  }

  /**
   * POST /api/suppliers/inventory/bulk-update
   * All-or-nothing: locks all rows, verifies ownership, updates all.
   */
  static async bulkUpdate(
    supplierId: string,
    updates: Array<{ product_id: string; stock_quantity: number }>,
    userId?: string,
  ): Promise<{ updated: number; products: StockUpdateResult[] }> {
    if (updates.length > 50) {
      throw badRequest("Maximum 50 items per bulk update");
    }

    const productIds = updates.map((u) => u.product_id);

    // 1. Lock all rows atomically (SELECT FOR UPDATE)
    const { data: lockedRows, error: lockError } = await supabaseAdmin.rpc(
      "lock_products_for_update",
      { product_ids: productIds },
    );

    if (lockError) {
      throw new AppError(lockError.message, 500, "DATABASE_ERROR");
    }

    const locked = (lockedRows as Array<{ id: string; stock_quantity: number }>) ?? [];
    const lockedMap = new Map<string, number>();
    for (const r of locked) {
      lockedMap.set(r.id, r.stock_quantity);
    }

    // 2. Verify ALL products exist and are owned by this supplier
    // Fetch supplier_id for each product to confirm ownership
    const { data: ownershipRows, error: ownershipError } = await supabaseAdmin
      .from("products")
      .select("id, supplier_id")
      .in("id", productIds)
      .eq("is_deleted", false);

    if (ownershipError) {
      throw new AppError(ownershipError.message, 500, "DATABASE_ERROR");
    }

    const ownershipMap = new Map<string, string>();
    for (const r of (ownershipRows ?? []) as Array<{ id: string; supplier_id: string }>) {
      ownershipMap.set(r.id, r.supplier_id);
    }

    for (const u of updates) {
      if (!ownershipMap.has(u.product_id)) {
        throw notFound(`Product ${u.product_id}`);
      }
      if (ownershipMap.get(u.product_id) !== supplierId) {
        throw forbidden("Not authorized to update one or more products — entire batch cancelled");
      }
    }

    // 3. Update each product and record audit entries
    const auditEntries: Array<{
      product_id: string;
      supplier_id: string;
      old_quantity: number;
      new_quantity: number;
      change_source: string;
      changed_by: string | null;
    }> = [];

    const results: StockUpdateResult[] = [];

    for (const u of updates) {
      const oldQuantity = lockedMap.get(u.product_id) ?? 0;
      const updateData: Record<string, unknown> = { stock_quantity: u.stock_quantity };
      if (u.stock_quantity > oldQuantity) {
        updateData.last_restocked_at = new Date().toISOString();
      }

      const { data: updated, error: updateError } = await supabaseAdmin
        .from("products")
        .update(updateData)
        .eq("id", u.product_id)
        .select(INVENTORY_FIELDS)
        .single();

      if (updateError) {
        throw new AppError(updateError.message, 500, "DATABASE_ERROR");
      }

      const row = updated as unknown as ProductRow;
      results.push({
        id: row.id,
        name: row.name,
        sku: row.sku,
        stock_quantity: row.stock_quantity,
        low_stock_threshold: row.low_stock_threshold,
        is_low_stock: row.stock_quantity <= row.low_stock_threshold,
        last_restocked_at: row.last_restocked_at,
      });

      auditEntries.push({
        product_id: u.product_id,
        supplier_id: supplierId,
        old_quantity: oldQuantity,
        new_quantity: u.stock_quantity,
        change_source: "bulk_update",
        changed_by: userId ?? null,
      });
    }

    // 4. Batch insert audit log entries
    if (auditEntries.length > 0) {
      await supabaseAdmin.from("stock_audit_log").insert(auditEntries);
    }

    return { updated: results.length, products: results };
  }

  /**
   * GET /api/suppliers/inventory/low-stock
   */
  static async getLowStock(supplierId: string): Promise<InventoryProduct[]> {
    // We need products where stock_quantity <= low_stock_threshold.
    // Supabase doesn't support column-to-column comparisons in .lte(),
    // so fetch all non-deleted products and filter in JS.
    const { data, error } = await supabaseAdmin
      .from("products")
      .select(INVENTORY_FIELDS)
      .eq("supplier_id", supplierId)
      .eq("is_deleted", false)
      .order("stock_quantity", { ascending: true });

    if (error) {
      throw new AppError(error.message, 500, "DATABASE_ERROR");
    }

    const rows = (data ?? []) as ProductRow[];
    return rows.filter((r) => r.stock_quantity <= r.low_stock_threshold).map(toInventoryProduct);
  }
}
