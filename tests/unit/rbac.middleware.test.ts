import { Request, Response, NextFunction } from "express";

import { authorize } from "../../src/middleware/rbac";
import type { AuthUser } from "../../src/types/auth.types";

const buildReq = (user?: AuthUser): Request =>
  ({
    user,
  }) as unknown as Request;

const buildRes = (): Response => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
};

const makeUser = (role: AuthUser["role"]): AuthUser => ({
  id: "user-1",
  email: "test@example.com",
  firstName: "Test",
  lastName: "User",
  companyName: null,
  phone: null,
  role,
  status: "approved",
  lastLogin: null,
});

describe("authorize middleware", () => {
  it("calls next() when user role matches single allowed role", () => {
    const middleware = authorize("admin");
    const req = buildReq(makeUser("admin"));
    const res = buildRes();
    const next = jest.fn() as unknown as NextFunction;

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 403 when user role does not match allowed role", () => {
    const middleware = authorize("admin");
    const req = buildReq(makeUser("customer"));
    const res = buildRes();
    const next = jest.fn() as unknown as NextFunction;

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: "FORBIDDEN", message: "Insufficient permissions" },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next() when user role matches one of multiple allowed roles", () => {
    const middleware = authorize("supplier", "admin");
    const req = buildReq(makeUser("supplier"));
    const res = buildRes();
    const next = jest.fn() as unknown as NextFunction;

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 403 when user role does not match any of multiple allowed roles", () => {
    const middleware = authorize("supplier", "admin");
    const req = buildReq(makeUser("customer"));
    const res = buildRes();
    const next = jest.fn() as unknown as NextFunction;

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: "FORBIDDEN", message: "Insufficient permissions" },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when no user is on the request", () => {
    const middleware = authorize("admin");
    const req = buildReq();
    const res = buildRes();
    const next = jest.fn() as unknown as NextFunction;

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: "UNAUTHORIZED", message: "Missing or invalid authorization header" },
    });
    expect(next).not.toHaveBeenCalled();
  });
});
