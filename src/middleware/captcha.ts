import type { Request, Response, NextFunction } from "express";
import { CaptchaService } from "../services/captcha.service";

export async function verifyCaptcha(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = req.body.captchaToken || req.body.recaptchaToken || req.body.turnstileToken;

  const secretConfigured = !!(process.env.RECAPTCHA_SECRET_KEY || process.env.TURNSTILE_SECRET_KEY);

  if (!secretConfigured) {
    next();
    return;
  }

  // Soft mode: allow requests without token (frontend hasn't added CAPTCHA yet)
  if (!token) {
    next();
    return;
  }

  let isValid = false;
  if (process.env.RECAPTCHA_SECRET_KEY) {
    isValid = await CaptchaService.verifyRecaptcha(token);
  } else if (process.env.TURNSTILE_SECRET_KEY) {
    isValid = await CaptchaService.verifyTurnstile(token);
  }

  if (!isValid) {
    res.status(403).json({
      error: {
        code: "CAPTCHA_FAILED",
        message: "CAPTCHA verification failed. Please try again.",
      },
    });
    return;
  }

  next();
}
