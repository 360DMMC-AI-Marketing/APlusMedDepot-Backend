import { Request, Response } from "express";

import { AuthService } from "../services/auth.service";
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  refreshTokenSchema,
} from "../validators/auth.validator";
import { unauthorized } from "../utils/errors";

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

  static async login(req: Request, res: Response): Promise<void> {
    const validated = loginSchema.parse(req.body);

    const { user, session } = await AuthService.signIn(validated.email, validated.password);

    res.status(200).json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        status: user.status,
      },
      session: {
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        expiresAt: session.expiresAt,
      },
    });
  }

  static async getSession(req: Request, res: Response): Promise<void> {
    const token = req.headers.authorization!.slice(7);

    const { user, session } = await AuthService.getSession(token);

    res.status(200).json({ user, session });
  }

  static async logout(req: Request, res: Response): Promise<void> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw unauthorized("Missing or invalid authorization header");
    }
    const token = authHeader.slice(7);

    await AuthService.signOut(token);

    res.status(200).json({ message: "Logged out successfully" });
  }

  static async refreshToken(req: Request, res: Response): Promise<void> {
    const validated = refreshTokenSchema.parse(req.body);

    const session = await AuthService.refreshSession(validated.refreshToken);

    res.status(200).json({
      session: {
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        expiresAt: session.expiresAt,
      },
    });
  }

  static async forgotPassword(req: Request, res: Response): Promise<void> {
    const validated = forgotPasswordSchema.parse(req.body);

    // Deliberately catch errors — never reveal whether an email exists
    try {
      await AuthService.resetPassword(validated.email);
    } catch {
      // Swallow intentionally for security
    }

    res.status(200).json({
      message: "If an account exists with this email, a reset link has been sent.",
    });
  }

  static async resetPassword(req: Request, res: Response): Promise<void> {
    const validated = resetPasswordSchema.parse(req.body);

    await AuthService.updatePasswordWithToken(validated.token, validated.newPassword);

    res.status(200).json({ message: "Password has been reset successfully." });
  }
}
