import { Request, Response } from "express";
import { z } from "zod";

import { PayPalService } from "../services/paypal.service";

const orderIdBodySchema = z.object({
  orderId: z.string().uuid(),
});

export class PayPalController {
  static async createOrder(req: Request, res: Response): Promise<void> {
    const { orderId } = orderIdBodySchema.parse(req.body);
    const result = await PayPalService.createOrder(orderId, req.user!.id);
    res.status(201).json(result);
  }

  static async captureOrder(req: Request, res: Response): Promise<void> {
    const { orderId } = orderIdBodySchema.parse(req.body);
    const result = await PayPalService.captureOrder(orderId, req.user!.id);
    res.status(200).json(result);
  }
}
