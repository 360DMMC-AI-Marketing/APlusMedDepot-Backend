import { Request, Response, NextFunction, RequestHandler } from "express";

export function authorize(...allowedRoles: string[]): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Missing or invalid authorization header" },
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: { code: "FORBIDDEN", message: "Insufficient permissions" },
      });
      return;
    }

    next();
  };
}
