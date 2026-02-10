import { Request, Response, NextFunction } from "express";

import { AuthService } from "../services/auth.service";

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Missing or invalid authorization header" },
      });
      return;
    }

    const token = authHeader.slice(7);
    if (!token) {
      res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Missing or invalid authorization header" },
      });
      return;
    }

    const user = await AuthService.verifyToken(token);

    if (user.status !== "approved") {
      res.status(403).json({
        error: { code: "FORBIDDEN", message: "Account is not active" },
      });
      return;
    }

    req.user = user;
    next();
  } catch {
    res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "Invalid or expired token" },
    });
  }
}
