import { z } from "zod";
import { categoryEnum } from "../constants/categories";

const productStatusEnum = z.enum(["draft", "pending_review", "active", "inactive", "out_of_stock"]);

const skuSchema = z
  .string()
  .min(1, "SKU is required")
  .max(50, "SKU must be 50 characters or less")
  .regex(/^[a-zA-Z0-9-]+$/, "SKU must contain only letters, numbers, and hyphens");

const priceSchema = z
  .number()
  .positive("Price must be positive")
  .multipleOf(0.01, "Price must have at most 2 decimal places");

const dimensionsSchema = z.object({
  length: z.number().positive().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
});

export const createProductSchema = z.object({
  name: z.string().min(1, "Name is required").max(200, "Name must be 200 characters or less"),
  description: z.string().max(5000, "Description must be 5000 characters or less").optional(),
  sku: skuSchema,
  price: priceSchema,
  originalPrice: z.number().positive("Original price must be positive").optional().nullable(),
  stockQuantity: z
    .number()
    .int("Stock quantity must be an integer")
    .nonnegative("Stock quantity must be non-negative"),
  category: z.enum(categoryEnum).optional(),
  images: z
    .array(z.string().url("Each image must be a valid URL"))
    .max(5, "Maximum 5 images allowed")
    .optional(),
  specifications: z.record(z.string(), z.string()).optional(),
  weight: z.number().positive("Weight must be positive").optional(),
  dimensions: dimensionsSchema.optional(),
  status: productStatusEnum.optional().default("draft"),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  sku: skuSchema.optional(),
  price: priceSchema.optional(),
  originalPrice: z.number().positive().optional().nullable(),
  stockQuantity: z.number().int().nonnegative().optional(),
  category: z.enum(categoryEnum).optional(),
  images: z.array(z.string().url()).max(5).optional(),
  specifications: z.record(z.string(), z.string()).optional(),
  weight: z.number().positive().optional(),
  dimensions: dimensionsSchema.optional(),
  status: productStatusEnum.optional(),
});

export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const productQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  category: z.enum(categoryEnum).optional(),
  supplierId: z.string().uuid("Invalid supplier ID").optional(),
  status: productStatusEnum.optional(),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().nonnegative().optional(),
  sortBy: z.enum(["name", "price", "created_at"]).default("created_at"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type ProductQueryInput = z.infer<typeof productQuerySchema>;

export const searchQuerySchema = z.object({
  q: z.string().min(1, "Search query is required"),
  category: z.enum(categoryEnum).optional(),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().nonnegative().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type SearchQueryInput = z.infer<typeof searchQuerySchema>;

export const uuidParamSchema = z.string().uuid("Invalid ID format");
