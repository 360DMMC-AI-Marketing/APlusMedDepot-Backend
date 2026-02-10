import { Request, Response } from "express";

import { AuthService } from "../services/auth.service";
import { registerSchema } from "../validators/auth.validator";

export class AuthController {
  static async register(req: Request, res: Response): Promise<void> {
    const validated = registerSchema.parse(req.body);

    const companyName = "companyName" in validated ? validated.companyName : null;

    const { user } = await AuthService.signUp(
      validated.email,
      validated.password,
      validated.firstName,
      validated.lastName,
      companyName,
      validated.phone ?? null,
      validated.role,
    );

    res.status(201).json({
      message: "Registration successful. Your account is pending admin approval.",
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        companyName: user.companyName,
        role: user.role,
        status: user.status,
      },
    });
  }
}
