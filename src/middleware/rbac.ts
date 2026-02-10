import { Request, Response, NextFunction } from "express";

export function authorize(..._roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // TODO: Check user role against allowed roles
    next();
  };
}
