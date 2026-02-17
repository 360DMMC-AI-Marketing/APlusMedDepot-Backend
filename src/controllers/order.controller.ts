import { Request, Response } from "express";
import { z } from "zod";

import { OrderService } from "../services/order.service";

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
}
