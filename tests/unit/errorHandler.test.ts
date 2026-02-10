import { Request, Response, NextFunction } from "express";
import { z } from "zod";

import { errorHandler } from "../../src/middleware/errorHandler";
import { AppError } from "../../src/utils/errors";

const buildReq = (): Request => ({}) as unknown as Request;

const buildRes = (): Response => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
};

const noop = jest.fn() as unknown as NextFunction;

beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("errorHandler middleware", () => {
  it("handles ZodError with 400 and VALIDATION_ERROR code", () => {
    const schema = z.object({
      email: z.string().min(1, "Email is required"),
      password: z.string().min(8, "Password must be at least 8 characters"),
    });

    const result = schema.safeParse({ email: "", password: "short" });
    if (result.success) {
      throw new Error("Expected validation to fail");
    }

    const req = buildReq();
    const res = buildRes();

    errorHandler(result.error, req, res, noop);

    expect(res.status).toHaveBeenCalledWith(400);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toBe("Invalid request data");
    expect(body.error.details.email).toBe("Email is required");
    expect(body.error.details.password).toBe("Password must be at least 8 characters");
  });

  it("handles AppError with its own statusCode and code", () => {
    const appError = new AppError("Product not found", 404, "NOT_FOUND");

    const req = buildReq();
    const res = buildRes();

    errorHandler(appError, req, res, noop);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: "NOT_FOUND",
        message: "Product not found",
      },
    });
  });

  it("handles generic Error with 500 and no stack trace in response", () => {
    const genericError = new Error("something broke internally");

    const req = buildReq();
    const res = buildRes();

    errorHandler(genericError, req, res, noop);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred",
      },
    });
    const responseBody = (res.json as jest.Mock).mock.calls[0][0];
    expect(responseBody.error.stack).toBeUndefined();
    expect(responseBody.stack).toBeUndefined();
  });

  it("logs the error to console.error for debugging", () => {
    const genericError = new Error("debug me");

    const req = buildReq();
    const res = buildRes();

    errorHandler(genericError, req, res, noop);

    expect(console.error).toHaveBeenCalledWith(genericError);
  });
});
