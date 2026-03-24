import { Request, Response, NextFunction } from "express";

import { withAuditContext } from "../../src/middleware/auditMiddleware";

function createMockReq(overrides: Partial<Request> = {}): Request {
  return {
    ip: "127.0.0.1",
    headers: {
      "user-agent": "TestAgent/1.0",
    },
    ...overrides,
  } as unknown as Request;
}

describe("withAuditContext middleware", () => {
  it("attaches audit context with IP and user-agent from req", () => {
    const req = createMockReq();
    const next = jest.fn();

    withAuditContext(req, {} as Response, next);

    expect(req.auditContext).toEqual({
      ipAddress: "127.0.0.1",
      userAgent: "TestAgent/1.0",
    });
    expect(next).toHaveBeenCalled();
  });

  it("uses x-forwarded-for when req.ip is missing", () => {
    const req = createMockReq({
      ip: undefined,
      headers: {
        "x-forwarded-for": "203.0.113.50",
        "user-agent": "ProxyAgent",
      },
    });
    const next = jest.fn();

    withAuditContext(req, {} as Response, next);

    expect(req.auditContext?.ipAddress).toBe("203.0.113.50");
  });

  it("uses first IP from x-forwarded-for array", () => {
    const req = createMockReq({
      ip: undefined,
      headers: {
        "x-forwarded-for": ["10.0.0.1", "10.0.0.2"],
        "user-agent": "MultiProxy",
      },
    });
    const next = jest.fn();

    withAuditContext(req, {} as Response, next as NextFunction);

    expect(req.auditContext?.ipAddress).toBe("10.0.0.1");
  });

  it("defaults to unknown when no IP available", () => {
    const req = createMockReq({
      ip: undefined,
      headers: {},
    });
    const next = jest.fn();

    withAuditContext(req, {} as Response, next as NextFunction);

    expect(req.auditContext?.ipAddress).toBe("unknown");
  });

  it("defaults user-agent to unknown when missing", () => {
    const req = createMockReq({
      headers: {},
    });
    const next = jest.fn();

    withAuditContext(req, {} as Response, next as NextFunction);

    expect(req.auditContext?.userAgent).toBe("unknown");
  });
});
