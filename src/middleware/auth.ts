import { Request, Response, NextFunction } from "express";

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  // TODO: Verify JWT token from Authorization header
  // TODO: Attach user to request object
  next();
}
