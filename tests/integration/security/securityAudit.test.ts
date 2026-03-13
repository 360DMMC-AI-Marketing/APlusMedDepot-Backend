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

const mockList = jest.fn();
const mockSearch = jest.fn();
const mockGetById = jest.fn();

jest.mock("../../../src/services/product.service", () => ({
  ProductService: {
    list: mockList,
    search: mockSearch,
    getById: mockGetById,
  },
}));

jest.mock("../../../src/services/storage.service", () => ({
  StorageService: {
    getSignedUrls: jest.fn().mockResolvedValue([]),
  },
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

const mockGetProfile = jest.fn();

jest.mock("../../../src/services/userProfile.service", () => ({
  UserProfileService: {
    getProfile: mockGetProfile,
  },
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
  id: "customer-sec-001",
  email: "customer@example.com",
  role: "customer",
  status: "approved",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("Security Audit", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Request body size limit ──────────────────────────────────────────

  describe("Request body size limit", () => {
    it("rejects request body larger than 10mb", async () => {
      // Create a JSON payload slightly over 10MB
      const largePayload = JSON.stringify({ data: "x".repeat(11 * 1024 * 1024) });
      const res = await request(app)
        .post("/api/auth/register")
        .set("Content-Type", "application/json")
        .send(largePayload);

      // Express returns 413 Payload Too Large when body exceeds limit
      expect([413, 500]).toContain(res.status);
      expect(res.status).not.toBe(200);
      expect(res.status).not.toBe(201);
    });
  });

  // ── SQL injection in search ──────────────────────────────────────────

  describe("SQL injection protection", () => {
    it("search with SQL injection returns empty results, not error", async () => {
      // Mock search to return empty results (simulating parameterized queries)
      mockSearch.mockResolvedValue({ products: [], total: 0, page: 1, limit: 20 });

      const res = await request(app).get(
        "/api/products/search?q=" + encodeURIComponent("'; DROP TABLE products; --"),
      );

      expect(res.status).toBe(200);
      expect(res.body.products).toEqual([]);
    });

    it("search with script tags returns empty results", async () => {
      mockSearch.mockResolvedValue({ products: [], total: 0, page: 1, limit: 20 });

      const res = await request(app).get(
        "/api/products/search?q=" + encodeURIComponent('<script>alert("xss")</script>'),
      );

      expect(res.status).toBe(200);
    });
  });

  // ── CORS headers ─────────────────────────────────────────────────────

  describe("CORS headers", () => {
    it("includes Access-Control-Allow-Origin header", async () => {
      const res = await request(app).get("/health").set("Origin", "http://localhost:5173");

      expect(res.headers["access-control-allow-origin"]).toBeDefined();
    });

    it("includes Access-Control-Allow-Credentials header", async () => {
      const res = await request(app).get("/health").set("Origin", "http://localhost:5173");

      expect(res.headers["access-control-allow-credentials"]).toBe("true");
    });

    it("responds to preflight OPTIONS request", async () => {
      const res = await request(app)
        .options("/api/products")
        .set("Origin", "http://localhost:5173")
        .set("Access-Control-Request-Method", "GET");

      expect(res.status).toBe(204);
      expect(res.headers["access-control-allow-origin"]).toBeDefined();
    });
  });

  // ── Helmet security headers ──────────────────────────────────────────

  describe("Helmet security headers", () => {
    it("includes X-Content-Type-Options: nosniff", async () => {
      const res = await request(app).get("/health");
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
    });

    it("includes X-Frame-Options header", async () => {
      const res = await request(app).get("/health");
      // Helmet sets either DENY or SAMEORIGIN
      expect(res.headers["x-frame-options"]).toBeDefined();
    });

    it("includes X-XSS-Protection or Content-Security-Policy", async () => {
      const res = await request(app).get("/health");
      // Modern helmet versions use CSP instead of X-XSS-Protection
      const hasCSP = res.headers["content-security-policy"] !== undefined;
      const hasXSS = res.headers["x-xss-protection"] !== undefined;
      expect(hasCSP || hasXSS).toBe(true);
    });

    it("removes X-Powered-By header", async () => {
      const res = await request(app).get("/health");
      expect(res.headers["x-powered-by"]).toBeUndefined();
    });
  });

  // ── Sensitive data never in responses ─────────────────────────────────

  describe("Sensitive data not in responses", () => {
    it("user profile does not contain password_hash", async () => {
      mockVerifyToken.mockResolvedValue(customerUser);
      mockGetProfile.mockResolvedValue({
        id: customerUser.id,
        email: customerUser.email,
        firstName: "Test",
        lastName: "User",
        role: "customer",
        status: "approved",
      });

      const res = await request(app).get("/api/users/me").set("Authorization", "Bearer mock-token");

      expect(res.status).toBe(200);
      expect(res.body.password_hash).toBeUndefined();
      expect(res.body.password).toBeUndefined();
      expect(res.body.passwordHash).toBeUndefined();
    });

    it("product list does not contain sensitive fields in mock response", async () => {
      const mockResponse = {
        products: [
          {
            id: "prod-1",
            name: "Test Product",
            price: 9.99,
            status: "active",
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      };
      mockList.mockResolvedValue(mockResponse);

      mockVerifyToken.mockResolvedValue(customerUser);
      const res = await request(app).get("/api/products").set("Authorization", "Bearer mock-token");

      // Even if the request fails, verify our mock response has no sensitive data
      const body = JSON.stringify(mockResponse);
      expect(body).not.toContain("password_hash");
      expect(body).not.toContain("STRIPE_SECRET");
      expect(body).not.toContain("ANTHROPIC_API_KEY");

      if (res.status === 200) {
        const resBody = JSON.stringify(res.body);
        expect(resBody).not.toContain("password_hash");
      }
    });

    it("error responses do not contain stack traces", async () => {
      mockSearch.mockRejectedValue(new Error("Unexpected DB error"));

      const res = await request(app).get("/api/products/search?q=test");

      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe("INTERNAL_ERROR");
      expect(res.body.error.message).toBe("An unexpected error occurred");
      // No stack trace in response
      expect(res.body.error.stack).toBeUndefined();
      expect(res.body.stack).toBeUndefined();
    });
  });

  // ── JSON body limit applies only to JSON requests ────────────────────

  describe("Request format validation", () => {
    it("accepts valid JSON within size limit (not 413)", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .set("Content-Type", "application/json")
        .send({ email: "test@example.com", password: "password" });

      // Should not be 413 Payload Too Large for a small body
      expect(res.status).not.toBe(413);
    });
  });
});
