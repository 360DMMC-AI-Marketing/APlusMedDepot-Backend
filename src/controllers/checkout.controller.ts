import { Request, Response } from "express";
import { z } from "zod";

import { CheckoutService } from "../services/checkout.service";

const shippingAddressSchema = z.object({
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
});

export class CheckoutController {
  static async validate(req: Request, res: Response): Promise<void> {
    const validated = shippingAddressSchema.parse(req.body);
    const result = await CheckoutService.validateCheckout(req.user!.id, validated.shipping_address);
    res.status(200).json(result);
  }
}
