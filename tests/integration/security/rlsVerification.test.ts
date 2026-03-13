import request from "supertest";

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports that reference them
// ---------------------------------------------------------------------------
const mockVerifyToken = jest.fn();

jest.mock("../../../src/services/auth.service", () => ({
  AuthService: {
    signUp: jest.fn(),
    verifyToken: mockVerifyToken,
  },
}));

jest.mock("../../../src/services/product.service", () => ({
  ProductService: {},
}));

jest.mock("../../../src/services/storage.service", () => ({
  StorageService: {},
}));

jest.mock("../../../src/services/cart.service", () => ({
  CartService: {},
}));

jest.mock("../../../src/services/order.service", () => ({
  OrderService: {},
}));

jest.mock("../../../src/services/checkout.service", () => ({
  CheckoutService: {},
}));

jest.mock("../../../src/utils/inventory", () => ({
  checkStock: jest.fn(),
}));

jest.mock(
  "express-rate-limit",
  () => () => (_req: unknown, _res: unknown, next: () => void) => next(),
);

import app from "../../../src/index";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const customerUser = {
  id: "customer-001",
  email: "customer@example.com",
  role: "customer",
  status: "approved",
};

const supplierUser = {
  id: "supplier-001",
  email: "supplier@example.com",
  role: "supplier",
  status: "approved",
};

function authAs(user: typeof customerUser): string {
  mockVerifyToken.mockResolvedValue(user);
  return "Bearer mock-token";
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("RLS Verification — Role-Based Access Control", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── No token → 401 on protected endpoints ────────────────────────────

  describe("Unauthenticated requests → 401", () => {
    const protectedEndpoints = [
      { method: "get" as const, path: "/api/cart" },
      { method: "post" as const, path: "/api/orders" },
      { method: "post" as const, path: "/api/payments/intent" },
      { method: "get" as const, path: "/api/suppliers/me" },
      { method: "get" as const, path: "/api/admin/users" },
      { method: "get" as const, path: "/api/admin/dashboard" },
      { method: "get" as const, path: "/api/admin/orders" },
      { method: "get" as const, path: "/api/suppliers/products" },
      { method: "get" as const, path: "/api/suppliers/inventory" },
      { method: "get" as const, path: "/api/users/me" },
      { method: "post" as const, path: "/api/users/me/change-password" },
      { method: "get" as const, path: "/api/notifications" },
      { method: "get" as const, path: "/api/commissions" },
    ];

    for (const { method, path } of protectedEndpoints) {
      it(`${method.toUpperCase()} ${path} → 401 without token`, async () => {
        const res = await request(app)[method](path);
        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe("UNAUTHORIZED");
      });
    }
  });

  // ── Customer cannot access admin endpoints → 403 ─────────────────────

  describe("Customer cannot access admin endpoints → 403", () => {
    const adminEndpoints = [
      { method: "get" as const, path: "/api/admin/users" },
      { method: "get" as const, path: "/api/admin/orders" },
      { method: "get" as const, path: "/api/admin/dashboard" },
      { method: "get" as const, path: "/api/admin/products" },
      { method: "get" as const, path: "/api/admin/analytics/revenue" },
      { method: "get" as const, path: "/api/admin/commissions/earnings" },
      { method: "get" as const, path: "/api/admin/audit-logs" },
    ];

    for (const { method, path } of adminEndpoints) {
      it(`${method.toUpperCase()} ${path} → 403 for customer`, async () => {
        const token = authAs(customerUser);
        const res = await request(app)[method](path).set("Authorization", token);
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe("FORBIDDEN");
      });
    }
  });

  // ── Customer cannot access supplier endpoints → 403 ──────────────────

  describe("Customer cannot access supplier endpoints → 403", () => {
    const supplierEndpoints = [
      { method: "get" as const, path: "/api/suppliers/products" },
      { method: "get" as const, path: "/api/suppliers/inventory" },
      { method: "get" as const, path: "/api/suppliers/analytics/products" },
      { method: "get" as const, path: "/api/suppliers/me/orders" },
      { method: "get" as const, path: "/api/suppliers/me/payouts/balance" },
      { method: "get" as const, path: "/api/commissions" },
    ];

    for (const { method, path } of supplierEndpoints) {
      it(`${method.toUpperCase()} ${path} → 403 for customer`, async () => {
        const token = authAs(customerUser);
        const res = await request(app)[method](path).set("Authorization", token);
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe("FORBIDDEN");
      });
    }
  });

  // ── Supplier cannot access admin endpoints → 403 ─────────────────────

  describe("Supplier cannot access admin endpoints → 403", () => {
    const adminEndpoints = [
      { method: "get" as const, path: "/api/admin/users" },
      { method: "get" as const, path: "/api/admin/orders" },
      { method: "get" as const, path: "/api/admin/dashboard" },
      { method: "get" as const, path: "/api/admin/products" },
      { method: "get" as const, path: "/api/admin/analytics/revenue" },
      { method: "post" as const, path: "/api/admin/payouts" },
      { method: "get" as const, path: "/api/admin/audit-logs" },
    ];

    for (const { method, path } of adminEndpoints) {
      it(`${method.toUpperCase()} ${path} → 403 for supplier`, async () => {
        const token = authAs(supplierUser);
        const res = await request(app)[method](path).set("Authorization", token);
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe("FORBIDDEN");
      });
    }
  });

  // ── Supplier cannot access customer-only endpoints → 403 ─────────────

  describe("Supplier cannot access customer-only endpoints → 403", () => {
    it("GET /api/cart → 403 for supplier", async () => {
      const token = authAs(supplierUser);
      const res = await request(app).get("/api/cart").set("Authorization", token);
      expect(res.status).toBe(403);
    });

    it("POST /api/orders → 403 for supplier", async () => {
      const token = authAs(supplierUser);
      const res = await request(app).post("/api/orders").set("Authorization", token);
      expect(res.status).toBe(403);
    });

    it("POST /api/payments/intent → 403 for supplier", async () => {
      const token = authAs(supplierUser);
      const res = await request(app).post("/api/payments/intent").set("Authorization", token);
      expect(res.status).toBe(403);
    });
  });

  // ── Public routes should be accessible without auth ───────────────────

  describe("Public routes accessible without auth", () => {
    it("GET /health → 200 without token", async () => {
      const res = await request(app).get("/health");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
    });

    it("POST /api/auth/register → does not return 401", async () => {
      const res = await request(app).post("/api/auth/register").send({});
      // Should be 400 (validation) not 401
      expect(res.status).not.toBe(401);
    });

    it("POST /api/auth/login → does not return 401", async () => {
      const res = await request(app).post("/api/auth/login").send({});
      expect(res.status).not.toBe(401);
    });

    it("POST /api/auth/forgot-password → does not return 401", async () => {
      const res = await request(app).post("/api/auth/forgot-password").send({});
      expect(res.status).not.toBe(401);
    });

    it("POST /api/auth/reset-password → does not return 401", async () => {
      const res = await request(app).post("/api/auth/reset-password").send({});
      expect(res.status).not.toBe(401);
    });

    it("POST /api/auth/verify-email → does not return 401", async () => {
      const res = await request(app).post("/api/auth/verify-email").send({});
      expect(res.status).not.toBe(401);
    });

    it("POST /api/auth/resend-verification → does not return 401", async () => {
      const res = await request(app).post("/api/auth/resend-verification").send({});
      expect(res.status).not.toBe(401);
    });
  });

  // ── Product catalog is public ────────────────────────────────────────

  describe("Product catalog routes are public", () => {
    it("GET /api/products → does not return 401", async () => {
      const res = await request(app).get("/api/products");
      expect(res.status).not.toBe(401);
    });

    it("GET /api/products/search?q=test → does not return 401", async () => {
      const res = await request(app).get("/api/products/search?q=test");
      expect(res.status).not.toBe(401);
    });
  });

  // ── Webhook must NOT require authentication ──────────────────────────

  describe("Webhook does not require authentication", () => {
    it("POST /api/payments/webhook → does not return 401", async () => {
      const res = await request(app)
        .post("/api/payments/webhook")
        .set("Content-Type", "application/json")
        .send(Buffer.from("{}"));
      // Should be 400 (missing stripe-signature header), not 401
      expect(res.status).not.toBe(401);
    });
  });

  // ── Admin TODO stubs require admin auth ──────────────────────────────

  describe("Admin TODO stubs require authentication", () => {
    it("GET /api/admin/analytics → 401 without token", async () => {
      const res = await request(app).get("/api/admin/analytics");
      expect(res.status).toBe(401);
    });

    it("GET /api/admin/analytics → 403 for customer", async () => {
      const token = authAs(customerUser);
      const res = await request(app).get("/api/admin/analytics").set("Authorization", token);
      expect(res.status).toBe(403);
    });

    it("PUT /api/admin/users/some-id/role → 401 without token", async () => {
      const res = await request(app).put("/api/admin/users/some-id/role");
      expect(res.status).toBe(401);
    });
  });

  // ── Supplier TODO stubs require auth ──────────────────────────────────

  describe("Supplier TODO stubs require authentication", () => {
    it("GET /api/suppliers → 401 without token", async () => {
      const res = await request(app).get("/api/suppliers");
      // Might match /api/suppliers/me first, but the TODO stub at / should require auth
      expect(res.status).toBe(401);
    });

    it("PUT /api/suppliers/some-id → 401 without token", async () => {
      const res = await request(app).put("/api/suppliers/some-id");
      expect(res.status).toBe(401);
    });
  });

  // ── PayPal routes require customer role ───────────────────────────────

  describe("PayPal routes require customer role", () => {
    it("POST /api/payments/paypal/create-order → 403 for supplier", async () => {
      const token = authAs(supplierUser);
      const res = await request(app)
        .post("/api/payments/paypal/create-order")
        .set("Authorization", token)
        .send({ orderId: "a0000000-0000-4000-8000-000000000001" });
      expect(res.status).toBe(403);
    });

    it("POST /api/payments/paypal/capture → 403 for supplier", async () => {
      const token = authAs(supplierUser);
      const res = await request(app)
        .post("/api/payments/paypal/capture")
        .set("Authorization", token)
        .send({ orderId: "a0000000-0000-4000-8000-000000000001" });
      expect(res.status).toBe(403);
    });
  });

  // ── AI verification requires admin ────────────────────────────────────

  describe("AI verification requires admin role", () => {
    it("POST /api/admin/vendors/:id/ai-verify → 403 for supplier", async () => {
      const token = authAs(supplierUser);
      const res = await request(app)
        .post("/api/admin/vendors/a0000000-0000-4000-8000-000000000001/ai-verify")
        .set("Authorization", token);
      expect(res.status).toBe(403);
    });

    it("POST /api/admin/vendors/:id/ai-verify → 403 for customer", async () => {
      const token = authAs(customerUser);
      const res = await request(app)
        .post("/api/admin/vendors/a0000000-0000-4000-8000-000000000001/ai-verify")
        .set("Authorization", token);
      expect(res.status).toBe(403);
    });
  });

  // ── Net30/Credit routes require authentication ────────────────────────

  describe("Net30/Credit routes require authentication", () => {
    it("GET /api/users/me/credit → 401 without token", async () => {
      const res = await request(app).get("/api/users/me/credit");
      expect(res.status).toBe(401);
    });

    it("POST /api/payments/net30 → 401 without token", async () => {
      const res = await request(app).post("/api/payments/net30").send({});
      expect(res.status).toBe(401);
    });
  });
});
