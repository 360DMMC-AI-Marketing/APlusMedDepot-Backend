import { Request, Response } from "express";
import { z } from "zod";

import { AIVerificationService } from "../services/aiVerification.service";

const vendorIdSchema = z.string().uuid();

export class AIVerificationController {
  static async verifyVendor(req: Request, res: Response): Promise<void> {
    const vendorId = vendorIdSchema.parse(req.params.id);
    const result = await AIVerificationService.verifyVendor(vendorId);
    res.status(200).json(result);
  }
}
