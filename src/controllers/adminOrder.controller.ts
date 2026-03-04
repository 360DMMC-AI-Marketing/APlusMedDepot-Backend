import { Request, Response } from "express";
import { z } from "zod";

import { AdminOrderService } from "../services/adminOrder.service";

const uuidSchema = z.string().uuid("Invalid order ID format");

const listOrdersSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z
    .enum([
      "pending_payment",
      "payment_processing",
      "payment_confirmed",
      "awaiting_fulfillment",
      "partially_shipped",
      "fully_shipped",
      "delivered",
      "cancelled",
      "refunded",
    ])
    .optional(),
  paymentStatus: z
    .enum(["pending", "processing", "paid", "failed", "refunded", "partially_refunded"])
    .optional(),
  customerId: z.string().uuid().optional(),
  supplierId: z.string().uuid().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  search: z.string().max(100).optional(),
  sortBy: z.enum(["created_at", "total_amount", "order_number"]).default("created_at"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  masterOnly: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
});

const searchSchema = z.object({
  q: z.string().min(1, "Search query is required").max(100),
});

export class AdminOrderController {
  static async list(req: Request, res: Response): Promise<void> {
    const options = listOrdersSchema.parse(req.query);
    const result = await AdminOrderService.listOrders(options);
    res.status(200).json(result);
  }

  static async getDetail(req: Request, res: Response): Promise<void> {
    const orderId = uuidSchema.parse(req.params.id);
    const result = await AdminOrderService.getOrderDetail(orderId);
    res.status(200).json(result);
  }

  static async search(req: Request, res: Response): Promise<void> {
    const { q } = searchSchema.parse(req.query);
    const result = await AdminOrderService.searchOrders(q);
    res.status(200).json(result);
  }

  static async getStatusCounts(req: Request, res: Response): Promise<void> {
    const result = await AdminOrderService.getOrdersByStatus();
    res.status(200).json(result);
  }
}
