import { Request, Response } from "express";
import { z } from "zod";

import { PaymentService } from "../services/payment.service";

const createPaymentIntentSchema = z.object({
  orderId: z.string().uuid(),
});

const confirmPaymentSchema = z.object({
  orderId: z.string().uuid(),
});

const orderIdParamSchema = z.string().uuid();

export class PaymentController {
  static async createPaymentIntent(req: Request, res: Response): Promise<void> {
    const { orderId } = createPaymentIntentSchema.parse(req.body);
    const result = await PaymentService.createPaymentIntent(orderId, req.user!.id);
    res.status(201).json(result);
  }

  static async confirmPayment(req: Request, res: Response): Promise<void> {
    const { orderId } = confirmPaymentSchema.parse(req.body);
    const result = await PaymentService.confirmPayment(orderId, req.user!.id);
    res.status(200).json(result);
  }

  static async getPaymentStatus(req: Request, res: Response): Promise<void> {
    const orderId = orderIdParamSchema.parse(req.params.orderId);
    const result = await PaymentService.getPaymentStatus(orderId, req.user!.id);
    res.status(200).json(result);
  }

  static async cancelOrder(req: Request, res: Response): Promise<void> {
    const cancelSchema = z.object({
      orderId: z.string().uuid(),
      reason: z.string().max(500).optional(),
    });

    const validated = cancelSchema.parse(req.body);
    const result = await PaymentService.refundPayment(
      validated.orderId,
      req.user!.id,
      validated.reason,
    );
    res.status(200).json(result);
  }

  static async retryPayment(req: Request, res: Response): Promise<void> {
    const retrySchema = z.object({
      orderId: z.string().uuid(),
    });

    const { orderId } = retrySchema.parse(req.body);
    const result = await PaymentService.retryPayment(orderId, req.user!.id);
    res.status(201).json(result);
  }

  static async getPaymentAttempts(req: Request, res: Response): Promise<void> {
    const orderId = orderIdParamSchema.parse(req.params.orderId);
    const result = await PaymentService.getPaymentAttempts(orderId, req.user!.id);
    res.status(200).json(result);
  }
}
