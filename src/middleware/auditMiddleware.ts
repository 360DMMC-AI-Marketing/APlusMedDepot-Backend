import { Request, Response, NextFunction } from "express";

export interface AuditContext {
  ipAddress: string;
  userAgent: string;
}

/**
 * Middleware that captures IP address and user-agent from the request
 * and attaches them to req.auditContext for use by services.
 */
export function withAuditContext(req: Request, _res: Response, next: NextFunction): void {
  const forwarded = req.headers["x-forwarded-for"];
  const forwardedIp = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const ip = req.ip || forwardedIp || "unknown";
  const userAgent = req.headers["user-agent"] || "unknown";

  req.auditContext = { ipAddress: ip, userAgent };
  next();
}
