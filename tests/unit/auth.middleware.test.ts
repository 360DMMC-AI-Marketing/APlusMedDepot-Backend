import { Request, Response, NextFunction } from "express";

import type { AuthUser } from "../../src/types/auth.types";

const mockVerifyToken = jest.fn();

jest.mock("../../src/services/auth.service", () => ({
  AuthService: {
    verifyToken: mockVerifyToken,
  },
}));

import { authenticate } from "../../src/middleware/auth";

const buildReq = (authHeader?: string): Request =>
  ({
    headers: authHeader !== undefined ? { authorization: authHeader } : {},
  }) as unknown as Request;

const buildRes = (): Response => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
};

const approvedUser: AuthUser = {
  id: "user-1",
  email: "test@example.com",
  firstName: "Test",
  lastName: "User",
  companyName: null,
  phone: null,
  role: "customer",
  status: "approved",
  lastLogin: null,
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("authenticate middleware", () => {
  it("populates req.user and calls next() for valid token with approved user", async () => {
    mockVerifyToken.mockResolvedValue(approvedUser);
    const req = buildReq("Bearer valid-token");
    const res = buildRes();
    const next = jest.fn() as unknown as NextFunction;

    await authenticate(req, res, next);

    expect(mockVerifyToken).toHaveBeenCalledWith("valid-token");
    expect(req.user).toEqual(approvedUser);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 401 when no Authorization header is present", async () => {
    const req = buildReq();
    const res = buildRes();
    const next = jest.fn() as unknown as NextFunction;

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: "UNAUTHORIZED", message: "Missing or invalid authorization header" },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when Bearer prefix is present but token is empty", async () => {
    const req = buildReq("Bearer ");
    const res = buildRes();
    const next = jest.fn() as unknown as NextFunction;

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: "UNAUTHORIZED", message: "Missing or invalid authorization header" },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when using Basic scheme instead of Bearer", async () => {
    const req = buildReq("Basic xyz");
    const res = buildRes();
    const next = jest.fn() as unknown as NextFunction;

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: "UNAUTHORIZED", message: "Missing or invalid authorization header" },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when AuthService.verifyToken throws", async () => {
    mockVerifyToken.mockRejectedValue(new Error("Invalid token"));
    const req = buildReq("Bearer bad-token");
    const res = buildRes();
    const next = jest.fn() as unknown as NextFunction;

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: "UNAUTHORIZED", message: "Invalid or expired token" },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 when user status is pending", async () => {
    mockVerifyToken.mockResolvedValue({ ...approvedUser, status: "pending" });
    const req = buildReq("Bearer valid-token");
    const res = buildRes();
    const next = jest.fn() as unknown as NextFunction;

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: "FORBIDDEN", message: "Account is not active" },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 when user status is suspended", async () => {
    mockVerifyToken.mockResolvedValue({ ...approvedUser, status: "suspended" });
    const req = buildReq("Bearer valid-token");
    const res = buildRes();
    const next = jest.fn() as unknown as NextFunction;

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: "FORBIDDEN", message: "Account is not active" },
    });
    expect(next).not.toHaveBeenCalled();
  });
});
