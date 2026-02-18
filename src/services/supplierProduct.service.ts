import { supabaseAdmin } from "../config/supabase";
import { notFound, forbidden, conflict, badRequest, AppError } from "../utils/errors";
import type {
  SupplierProduct,
  SupplierProductListResponse,
  CreateSupplierProductRequest,
  UpdateSupplierProductRequest,
} from "../types/supplierProduct.types";
import type { SupplierProductQueryInput } from "../validators/supplierProduct.validator";

type ProductRow = {
  id: string;
  supplier_id: string;
  name: string;
  description: string | null;
  sku: string;
  price: string;
  stock_quantity: number;
  category: string | null;
  status: string;
  images: string[] | null;
  specifications: Record<string, string> | null;
  weight: string | null;
  dimensions: { length?: number; width?: number; height?: number } | null;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
};

const PRODUCT_SELECT_FIELDS =
  "id, supplier_id, name, description, sku, price, stock_quantity, category, status, images, specifications, weight, dimensions, is_deleted, created_at, updated_at";

const toSupplierProduct = (row: ProductRow): SupplierProduct => ({
  id: row.id,
  supplierId: row.supplier_id,
  name: row.name,
  description: row.description,
  sku: row.sku,
  price: Number(row.price),
  stockQuantity: row.stock_quantity,
  category: row.category,
  status: row.status as SupplierProduct["status"],
  images: row.images ?? [],
  specifications: row.specifications ?? {},
  weight: row.weight !== null ? Number(row.weight) : null,
  dimensions: row.dimensions,
  isDeleted: row.is_deleted,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class SupplierProductService {
  static async getSupplierIdFromUserId(userId: string): Promise<string> {
    const { data, error } = await supabaseAdmin
      .from("suppliers")
      .select("id, status")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      throw new AppError("Database error fetching supplier", 500, "DATABASE_ERROR");
    }

    if (!data) {
      throw notFound("Supplier");
    }

    const row = data as { id: string; status: string };

    if (row.status !== "approved") {
      throw forbidden("Supplier not approved");
    }

    return row.id;
  }

  static async list(
    supplierId: string,
    query: SupplierProductQueryInput,
  ): Promise<SupplierProductListResponse> {
    const { page, limit, status, search, category } = query;

    let q = supabaseAdmin
      .from("products")
      .select(PRODUCT_SELECT_FIELDS, { count: "exact" })
      .eq("supplier_id", supplierId)
      .eq("is_deleted", false);

    if (status && status !== "all") {
      q = q.eq("status", status);
    }

    if (category) {
      q = q.eq("category", category);
    }

    if (search) {
      q = q.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    q = q.order("created_at", { ascending: false }).range(from, to);

    const { data, error, count } = await q;

    if (error) {
      throw new AppError(error.message, 500, "DATABASE_ERROR");
    }

    const total = count ?? 0;
    const products = ((data as unknown as ProductRow[] | null) ?? []).map(toSupplierProduct);

    return {
      products,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  static async create(
    supplierId: string,
    input: CreateSupplierProductRequest,
  ): Promise<SupplierProduct> {
    // Check for duplicate SKU within the same supplier
    const { data: existing } = await supabaseAdmin
      .from("products")
      .select("id")
      .eq("supplier_id", supplierId)
      .eq("sku", input.sku)
      .eq("is_deleted", false)
      .maybeSingle();

    if (existing) {
      throw conflict("SKU already exists for this supplier");
    }

    const { data, error } = await supabaseAdmin
      .from("products")
      .insert({
        supplier_id: supplierId,
        name: input.name,
        description: input.description,
        sku: input.sku,
        price: input.price,
        stock_quantity: input.stock_quantity,
        category: input.category,
        status: "pending",
        is_deleted: false,
        images: [],
        specifications: input.specifications ?? {},
        weight: input.weight ?? null,
        dimensions: input.dimensions ?? null,
      })
      .select(PRODUCT_SELECT_FIELDS)
      .single();

    if (error) {
      throw new AppError(error.message, 500, "DATABASE_ERROR");
    }

    if (!data) {
      throw new AppError("Product not created", 500, "DATABASE_ERROR");
    }

    return toSupplierProduct(data as unknown as ProductRow);
  }

  static async update(
    supplierId: string,
    productId: string,
    input: UpdateSupplierProductRequest,
  ): Promise<SupplierProduct> {
    // Fetch existing product to verify ownership and status
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from("products")
      .select("id, supplier_id, status, sku")
      .eq("id", productId)
      .eq("is_deleted", false)
      .maybeSingle();

    if (fetchError) {
      throw new AppError(fetchError.message, 500, "DATABASE_ERROR");
    }

    if (!existing) {
      throw notFound("Product");
    }

    const row = existing as { id: string; supplier_id: string; status: string; sku: string };

    if (row.supplier_id !== supplierId) {
      throw forbidden("Not authorized to update this product");
    }

    const updateData: Record<string, unknown> = {};

    if (row.status === "active") {
      // Active products: ONLY allow stock_quantity and price updates
      const restrictedFields: Array<keyof UpdateSupplierProductRequest> = [
        "name",
        "description",
        "sku",
        "category",
        "specifications",
        "weight",
        "dimensions",
      ];

      for (const field of restrictedFields) {
        if (input[field] !== undefined) {
          throw badRequest(
            `Cannot update ${field} for active products. Active products require re-approval for content changes.`,
          );
        }
      }

      if (input.price !== undefined) updateData.price = input.price;
      if (input.stock_quantity !== undefined) updateData.stock_quantity = input.stock_quantity;
    } else {
      // For pending, rejected, needs_revision — allow full edit
      if (input.name !== undefined) updateData.name = input.name;
      if (input.description !== undefined) updateData.description = input.description;
      if (input.category !== undefined) updateData.category = input.category;
      if (input.specifications !== undefined) updateData.specifications = input.specifications;
      if (input.weight !== undefined) updateData.weight = input.weight;
      if (input.dimensions !== undefined) updateData.dimensions = input.dimensions;
      if (input.price !== undefined) updateData.price = input.price;
      if (input.stock_quantity !== undefined) updateData.stock_quantity = input.stock_quantity;

      // Handle SKU change with per-supplier uniqueness check
      if (input.sku !== undefined && input.sku !== row.sku) {
        const { data: skuExists } = await supabaseAdmin
          .from("products")
          .select("id")
          .eq("supplier_id", supplierId)
          .eq("sku", input.sku)
          .eq("is_deleted", false)
          .maybeSingle();

        if (skuExists) {
          throw conflict("SKU already exists for this supplier");
        }

        updateData.sku = input.sku;
      }

      // Resubmit for review if editing rejected or needs_revision product
      if (row.status === "rejected" || row.status === "needs_revision") {
        updateData.status = "pending";
      }
    }

    if (Object.keys(updateData).length === 0) {
      throw badRequest("No valid fields to update");
    }

    const { data, error } = await supabaseAdmin
      .from("products")
      .update(updateData)
      .eq("id", productId)
      .select(PRODUCT_SELECT_FIELDS)
      .single();

    if (error) {
      throw new AppError(error.message, 500, "DATABASE_ERROR");
    }

    if (!data) {
      throw new AppError("Product not updated", 500, "DATABASE_ERROR");
    }

    return toSupplierProduct(data as unknown as ProductRow);
  }

  static async softDelete(supplierId: string, productId: string): Promise<void> {
    // Verify product ownership
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from("products")
      .select("id, supplier_id")
      .eq("id", productId)
      .eq("is_deleted", false)
      .maybeSingle();

    if (fetchError) {
      throw new AppError(fetchError.message, 500, "DATABASE_ERROR");
    }

    if (!existing) {
      throw notFound("Product");
    }

    const row = existing as { id: string; supplier_id: string };

    if (row.supplier_id !== supplierId) {
      throw forbidden("Not authorized to delete this product");
    }

    // Check for open order items
    const { count, error: countError } = await supabaseAdmin
      .from("order_items")
      .select("*", { count: "exact", head: true })
      .eq("product_id", productId)
      .in("fulfillment_status", ["pending", "processing"]);

    if (countError) {
      throw new AppError(countError.message, 500, "DATABASE_ERROR");
    }

    if ((count ?? 0) > 0) {
      throw badRequest("Cannot delete product with open orders");
    }

    // Soft delete: set is_deleted=true and status='inactive'
    const { error } = await supabaseAdmin
      .from("products")
      .update({ is_deleted: true, status: "inactive" })
      .eq("id", productId);

    if (error) {
      throw new AppError(error.message, 500, "DATABASE_ERROR");
    }
  }
}
