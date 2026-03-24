import { Request, Response } from "express";
import { z } from "zod";

import { CreditService } from "../services/credit.service";
import { Net30Service } from "../services/net30.service";

const net30BodySchema = z.object({
  orderId: z.string().uuid(),
});

export class CreditController {
  static async getCreditInfo(req: Request, res: Response): Promise<void> {
    const result = await CreditService.getCreditInfo(req.user!.id);
    res.status(200).json(result);
  }

  static async placeNet30Order(req: Request, res: Response): Promise<void> {
    const { orderId } = net30BodySchema.parse(req.body);
    const result = await Net30Service.placeNet30Order(orderId, req.user!.id);
    res.status(201).json(result);
  }
}
