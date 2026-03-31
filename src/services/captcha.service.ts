type RecaptchaResponse = {
  success: boolean;
  score?: number;
  "error-codes"?: string[];
};

type TurnstileResponse = {
  success: boolean;
  "error-codes"?: string[];
};

export class CaptchaService {
  static async verifyRecaptcha(token: string): Promise<boolean> {
    const secret = process.env.RECAPTCHA_SECRET_KEY;
    if (!secret) {
      return true;
    }

    try {
      const response = await fetch("https://www.google.com/recaptcha/api/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `secret=${encodeURIComponent(secret)}&response=${encodeURIComponent(token)}`,
      });

      const data = (await response.json()) as RecaptchaResponse;

      if (!data.success) {
        console.error("CAPTCHA verification failed:", data["error-codes"]);
        return false;
      }

      if (data.score !== undefined && data.score < 0.5) {
        console.warn("CAPTCHA score too low:", data.score);
        return false;
      }

      return true;
    } catch (error) {
      console.error("CAPTCHA verification error:", error);
      return true;
    }
  }

  static async verifyTurnstile(token: string): Promise<boolean> {
    const secret = process.env.TURNSTILE_SECRET_KEY;
    if (!secret) {
      return true;
    }

    try {
      const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret, response: token }),
      });

      const data = (await response.json()) as TurnstileResponse;

      if (!data.success) {
        console.error("Turnstile verification failed:", data["error-codes"]);
        return false;
      }

      return true;
    } catch (error) {
      console.error("Turnstile verification error:", error);
      return true;
    }
  }
}
