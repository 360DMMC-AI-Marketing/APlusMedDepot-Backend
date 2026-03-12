import { Request, Response } from "express";
import { z } from "zod";

import { AdminProductService } from "../services/adminProduct.service";

const uuidSchema = z.string().uuid("Invalid product ID format");

const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const listProductsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["pending", "active", "inactive", "rejected", "needs_revision"]).optional(),
  supplierId: z.string().uuid().optional(),
  category: z.string().optional(),
  search: z.string().max(100).optional(),
  sortBy: z.enum(["created_at", "name", "price", "status"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

const requestChangesSchema = z.object({
  feedback: z
    .string()
    .min(10, "Feedback must be at least 10 characters")
    .max(1000, "Feedback must not exceed 1000 characters"),
});

const rejectSchema = z.object({
  reason: z
    .string()
    .min(10, "Reason must be at least 10 characters")
    .max(1000, "Reason must not exceed 1000 characters"),
});

export class AdminProductController {
  static async listPending(req: Request, res: Response): Promise<void> {
    const { page, limit } = paginationSchema.parse(req.query);
    const result = await AdminProductService.listPending(page, limit);
    res.status(200).json(result);
  }

  static async getReviewDetail(req: Request, res: Response): Promise<void> {
    const productId = uuidSchema.parse(req.params.id);
    const result = await AdminProductService.getReviewDetail(productId);
    res.status(200).json(result);
  }

  static async approve(req: Request, res: Response): Promise<void> {
    const productId = uuidSchema.parse(req.params.id);
    const result = await AdminProductService.approve(productId, req.user!.id, req.auditContext);
    res.status(200).json(result);
  }

  static async requestChanges(req: Request, res: Response): Promise<void> {
    const productId = uuidSchema.parse(req.params.id);
    const { feedback } = requestChangesSchema.parse(req.body);
    const result = await AdminProductService.requestChanges(
      productId,
      req.user!.id,
      feedback,
      req.auditContext,
    );
    res.status(200).json(result);
  }

  static async reject(req: Request, res: Response): Promise<void> {
    const productId = uuidSchema.parse(req.params.id);
    const { reason } = rejectSchema.parse(req.body);
    const result = await AdminProductService.reject(
      productId,
      req.user!.id,
      reason,
      req.auditContext,
    );
    res.status(200).json(result);
  }

  static async list(req: Request, res: Response): Promise<void> {
    const options = listProductsSchema.parse(req.query);
    const result = await AdminProductService.listProducts(options);
    res.status(200).json(result);
  }

  static async getDetail(req: Request, res: Response): Promise<void> {
    const productId = uuidSchema.parse(req.params.id);
    const result = await AdminProductService.getProductDetail(productId);
    res.status(200).json(result);
  }

  static async feature(req: Request, res: Response): Promise<void> {
    const productId = uuidSchema.parse(req.params.id);
    await AdminProductService.featureProduct(productId, req.user!.id, req.auditContext);
    res.status(200).json({ message: "Product featured successfully" });
  }

  static async unfeature(req: Request, res: Response): Promise<void> {
    const productId = uuidSchema.parse(req.params.id);
    await AdminProductService.unfeatureProduct(productId, req.user!.id, req.auditContext);
    res.status(200).json({ message: "Product unfeatured successfully" });
  }
}
