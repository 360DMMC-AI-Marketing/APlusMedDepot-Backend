import { supabaseAdmin } from "../config/supabase";
import { notFound, forbidden, conflict, AppError } from "../utils/errors";
import { StorageService } from "./storage.service";
import type { Product, PaginatedResponse, Dimensions, ProductStatus } from "../types/product.types";
import type {
  CreateProductInput,
  UpdateProductInput,
  ProductQueryInput,
  SearchQueryInput,
} from "../validators/product.validator";

type ProductRow = {
  id: string;
  supplier_id: string;
  name: string;
  description: string | null;
  sku: string;
  price: string;
  original_price: string | null;
  stock_quantity: number;
  category: string | null;
  status: string;
  images: string[] | null;
  specifications: Record<string, string> | null;
  weight: string | null;
  dimensions: Dimensions | null;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  suppliers?: { business_name: string } | null;
};

const PRODUCT_SELECT_FIELDS =
  "id, supplier_id, name, description, sku, price, original_price, stock_quantity, category, status, images, specifications, weight, dimensions, is_deleted, created_at, updated_at";

const PRODUCT_WITH_SUPPLIER = `${PRODUCT_SELECT_FIELDS}, suppliers(business_name)`;

const toProduct = (row: ProductRow): Product => ({
  id: row.id,
  supplierId: row.supplier_id,
  name: row.name,
  description: row.description,
  sku: row.sku,
  price: Number(row.price),
  originalPrice: row.original_price ? Number(row.original_price) : null,
  stockQuantity: row.stock_quantity,
  category: row.category,
  status: row.status as ProductStatus,
  images: (row.images ?? []) as string[],
  specifications: (row.specifications ?? {}) as Record<string, string>,
  weight: row.weight !== null ? Number(row.weight) : null,
  dimensions: row.dimensions,
  isDeleted: row.is_deleted,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  supplierName: row.suppliers?.business_name ?? null,
});

const resolveSignedUrls = async (product: Product): Promise<Product> => {
  if (product.images.length === 0) return product;
  const signedUrls = await StorageService.getSignedUrls(product.images);
  return { ...product, images: signedUrls };
};

export class ProductService {
  static async getSupplierIdForUser(userId: string): Promise<string> {
    const { data, error } = await supabaseAdmin
      .from("suppliers")
      .select("id")
      .eq("user_id", userId)
      .single();

    if (error || !data) {
      throw notFound("Supplier profile");
    }

    return (data as { id: string }).id;
  }

  static async list(query: ProductQueryInput): Promise<PaginatedResponse<Product>> {
    const {
      page,
      limit,
      search,
      category,
      supplierId,
      status,
      minPrice,
      maxPrice,
      sortBy,
      sortOrder,
    } = query;

    let q = supabaseAdmin
      .from("products")
      .select(PRODUCT_WITH_SUPPLIER, { count: "exact" })
      .eq("is_deleted", false);

    if (status) q = q.eq("status", status);
    if (category) q = q.eq("category", category);
    if (supplierId) q = q.eq("supplier_id", supplierId);
    if (minPrice !== undefined) q = q.gte("price", minPrice);
    if (maxPrice !== undefined) q = q.lte("price", maxPrice);
    if (search) q = q.ilike("name", `%${search}%`);

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    q = q.order(sortBy, { ascending: sortOrder === "asc" }).range(from, to);

    const { data, error, count } = await q;

    if (error) {
      throw new AppError(error.message, 500, "DATABASE_ERROR");
    }

    const total = count ?? 0;
    const products = ((data as unknown as ProductRow[] | null) ?? []).map(toProduct);
    const resolved = await Promise.all(products.map(resolveSignedUrls));

    return {
      data: resolved,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  static async search(query: SearchQueryInput): Promise<PaginatedResponse<Product>> {
    const { q: searchTerm, category, minPrice, maxPrice, page, limit } = query;

    let dbQuery = supabaseAdmin
      .from("products")
      .select(PRODUCT_WITH_SUPPLIER, { count: "exact" })
      .eq("is_deleted", false)
      .eq("status", "active")
      .textSearch("name", searchTerm, { config: "english", type: "plain" });

    if (category) dbQuery = dbQuery.eq("category", category);
    if (minPrice !== undefined) dbQuery = dbQuery.gte("price", minPrice);
    if (maxPrice !== undefined) dbQuery = dbQuery.lte("price", maxPrice);

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    dbQuery = dbQuery.range(from, to);

    const { data, error, count } = await dbQuery;

    if (error) {
      throw new AppError(error.message, 500, "DATABASE_ERROR");
    }

    const total = count ?? 0;
    const products = ((data as unknown as ProductRow[] | null) ?? []).map(toProduct);
    const resolved = await Promise.all(products.map(resolveSignedUrls));

    return {
      data: resolved,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  static async getById(id: string): Promise<Product | null> {
    const { data, error } = await supabaseAdmin
      .from("products")
      .select(PRODUCT_WITH_SUPPLIER)
      .eq("id", id)
      .eq("is_deleted", false)
      .single();

    if (error || !data) {
      return null;
    }

    const product = toProduct(data as unknown as ProductRow);
    return resolveSignedUrls(product);
  }

  static async create(input: CreateProductInput, supplierId: string): Promise<Product> {
    const { data, error } = await supabaseAdmin
      .from("products")
      .insert({
        supplier_id: supplierId,
        name: input.name,
        description: input.description ?? null,
        sku: input.sku,
        price: input.price,
        original_price: input.originalPrice ?? null,
        stock_quantity: input.stockQuantity,
        category: input.category ?? null,
        status: input.status ?? "draft",
        images: input.images ?? [],
        specifications: input.specifications ?? {},
        weight: input.weight ?? null,
        dimensions: input.dimensions ?? null,
      })
      .select(PRODUCT_SELECT_FIELDS)
      .single();

    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes("duplicate") || msg.includes("unique") || msg.includes("already")) {
        throw conflict("SKU already exists");
      }
      throw new AppError(error.message, 500, "DATABASE_ERROR");
    }

    if (!data) {
      throw new AppError("Product not created", 500, "DATABASE_ERROR");
    }

    return toProduct(data as unknown as ProductRow);
  }

  static async update(
    id: string,
    input: UpdateProductInput,
    supplierId: string | null,
    isAdmin: boolean,
  ): Promise<Product> {
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from("products")
      .select("id, supplier_id")
      .eq("id", id)
      .eq("is_deleted", false)
      .single();

    if (fetchError || !existing) {
      throw notFound("Product");
    }

    const row = existing as { id: string; supplier_id: string };
    if (!isAdmin && row.supplier_id !== supplierId) {
      throw forbidden("Not authorized to update this product");
    }

    const updateData: Record<string, unknown> = {};
    if (input.name !== undefined) updateData.name = input.name;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.sku !== undefined) updateData.sku = input.sku;
    if (input.price !== undefined) updateData.price = input.price;
    if (input.originalPrice !== undefined) updateData.original_price = input.originalPrice;
    if (input.stockQuantity !== undefined) updateData.stock_quantity = input.stockQuantity;
    if (input.category !== undefined) updateData.category = input.category;
    if (input.status !== undefined) updateData.status = input.status;
    if (input.images !== undefined) updateData.images = input.images;
    if (input.specifications !== undefined) updateData.specifications = input.specifications;
    if (input.weight !== undefined) updateData.weight = input.weight;
    if (input.dimensions !== undefined) updateData.dimensions = input.dimensions;

    const { data, error } = await supabaseAdmin
      .from("products")
      .update(updateData)
      .eq("id", id)
      .select(PRODUCT_SELECT_FIELDS)
      .single();

    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes("duplicate") || msg.includes("unique") || msg.includes("already")) {
        throw conflict("SKU already exists");
      }
      throw new AppError(error.message, 500, "DATABASE_ERROR");
    }

    if (!data) {
      throw new AppError("Product not updated", 500, "DATABASE_ERROR");
    }

    return toProduct(data as unknown as ProductRow);
  }

  static async softDelete(id: string, supplierId: string | null, isAdmin: boolean): Promise<void> {
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from("products")
      .select("id, supplier_id")
      .eq("id", id)
      .eq("is_deleted", false)
      .single();

    if (fetchError || !existing) {
      throw notFound("Product");
    }

    const row = existing as { id: string; supplier_id: string };
    if (!isAdmin && row.supplier_id !== supplierId) {
      throw forbidden("Not authorized to delete this product");
    }

    const { error } = await supabaseAdmin
      .from("products")
      .update({ is_deleted: true })
      .eq("id", id);

    if (error) {
      throw new AppError(error.message, 500, "DATABASE_ERROR");
    }
  }

  static async appendImage(productId: string, storagePath: string): Promise<void> {
    const { data, error: fetchError } = await supabaseAdmin
      .from("products")
      .select("images")
      .eq("id", productId)
      .single();

    if (fetchError || !data) {
      throw notFound("Product");
    }

    const row = data as { images: string[] | null };
    const images = [...(row.images ?? []), storagePath];

    const { error } = await supabaseAdmin.from("products").update({ images }).eq("id", productId);

    if (error) {
      throw new AppError(error.message, 500, "DATABASE_ERROR");
    }
  }

  static async removeImage(productId: string, imageIndex: number): Promise<void> {
    const { data, error: fetchError } = await supabaseAdmin
      .from("products")
      .select("images")
      .eq("id", productId)
      .single();

    if (fetchError || !data) {
      throw notFound("Product");
    }

    const row = data as { images: string[] | null };
    const images = [...(row.images ?? [])];
    images.splice(imageIndex, 1);

    const { error } = await supabaseAdmin.from("products").update({ images }).eq("id", productId);

    if (error) {
      throw new AppError(error.message, 500, "DATABASE_ERROR");
    }
  }
}
