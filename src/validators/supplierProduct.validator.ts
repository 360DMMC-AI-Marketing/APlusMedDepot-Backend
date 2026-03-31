import { z } from "zod";
import { categoryEnum } from "../constants/categories";

const supplierProductStatusEnum = z.enum([
  "all",
  "pending",
  "active",
  "inactive",
  "rejected",
  "needs_revision",
]);

const dimensionsSchema = z.object({
  length: z.number().positive().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
});

const skuSchema = z
  .string()
  .min(1, "SKU is required")
  .max(50, "SKU must be 50 characters or less")
  .regex(/^[a-zA-Z0-9-]+$/, "SKU must contain only letters, numbers, and hyphens");

const priceSchema = z
  .number()
  .positive("Price must be positive")
  .multipleOf(0.01, "Price must have at most 2 decimal places");

export const supplierProductQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: supplierProductStatusEnum.optional(),
  search: z.string().optional(),
  category: z.enum(categoryEnum).optional(),
  sort_by: z.enum(["name", "price", "stock_quantity", "created_at"]).default("created_at"),
  sort_order: z.enum(["asc", "desc"]).default("desc"),
  in_stock: z
    .preprocess(
      (v) => (v === "true" ? true : v === "false" ? false : undefined),
      z.boolean().optional(),
    )
    .optional(),
  price_min: z.coerce.number().nonnegative("price_min must be non-negative").optional(),
  price_max: z.coerce.number().nonnegative("price_max must be non-negative").optional(),
});

export type SupplierProductQueryInput = z.infer<typeof supplierProductQuerySchema>;

export const createSupplierProductSchema = z.object({
  name: z.string().min(1, "Name is required").max(200, "Name must be 200 characters or less"),
  description: z.string().max(5000, "Description must be 5000 characters or less").optional(),
  sku: skuSchema,
  price: priceSchema,
  original_price: z.number().positive("Original price must be positive").optional().nullable(),
  stock_quantity: z
    .number()
    .int("Stock quantity must be an integer")
    .nonnegative("Stock quantity must be non-negative"),
  category: z.enum(categoryEnum).optional(),
  specifications: z.record(z.string(), z.string()).optional(),
  weight: z.number().positive("Weight must be positive").optional(),
  dimensions: dimensionsSchema.optional(),
});

export type CreateSupplierProductInput = z.infer<typeof createSupplierProductSchema>;

export const updateSupplierProductSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  sku: skuSchema.optional(),
  price: priceSchema.optional(),
  original_price: z.number().positive().optional().nullable(),
  stock_quantity: z.number().int().nonnegative().optional(),
  category: z.enum(categoryEnum).optional(),
  specifications: z.record(z.string(), z.string()).optional(),
  weight: z.number().positive().optional(),
  dimensions: dimensionsSchema.optional(),
});

export type UpdateSupplierProductInput = z.infer<typeof updateSupplierProductSchema>;

export const uuidParamSchema = z.string().uuid("Invalid ID format");
