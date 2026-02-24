import { Request, Response } from "express";
import { z } from "zod";

import { OrderService } from "../services/order.service";
import { OrderConfirmationService } from "../services/orderConfirmation.service";
import { ORDER_STATUSES } from "../utils/orderStateMachine";

const createOrderSchema = z.object({
  shipping_address: z.object({
    street: z.string().min(1, "Street is required"),
    city: z.string().min(1, "City is required"),
    state: z.string().min(1, "State is required"),
    zip_code: z
      .string()
      .min(1, "Zip code is required")
      .regex(/^\d{5}(-\d{4})?$/, "Invalid zip code format"),
    country: z.string().min(1, "Country is required"),
  }),
  notes: z.string().max(500).optional(),
});

const orderListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .default(10)
    .transform((v) => Math.min(v, 50)),
  status: z.enum(ORDER_STATUSES).optional(),
  sort_by: z.enum(["created_at"]).default("created_at"),
  sort_order: z.enum(["desc", "asc"]).default("desc"),
});

export class OrderController {
  static async create(req: Request, res: Response): Promise<void> {
    const validated = createOrderSchema.parse(req.body);
    const order = await OrderService.createOrder(
      req.user!.id,
      validated.shipping_address,
      validated.notes,
    );
    res.status(201).json({ order });
  }

  static async list(req: Request, res: Response): Promise<void> {
    const validated = orderListQuerySchema.parse(req.query);
    const result = await OrderService.listOrders(req.user!.id, validated);
    res.status(200).json(result);
  }

  static async updateStatus(req: Request, res: Response): Promise<void> {
    const updateStatusSchema = z.object({
      status: z.enum(ORDER_STATUSES),
      reason: z.string().max(500).optional(),
    });

    const validated = updateStatusSchema.parse(req.body);
    const order = await OrderService.updateOrderStatus(
      req.params.id as string,
      validated.status,
      req.user!.id,
      validated.reason,
    );
    res.status(200).json({ order });
  }

  static async getById(req: Request, res: Response): Promise<void> {
    const order = await OrderService.getOrderById(
      req.params.id as string,
      req.user!.id,
      req.user!.role,
    );
    res.status(200).json({ order });
  }

  static async getConfirmation(req: Request, res: Response): Promise<void> {
    const result = await OrderConfirmationService.getOrderConfirmation(
      req.params.id as string,
      req.user!.id,
    );
    res.status(200).json(result);
  }
}
