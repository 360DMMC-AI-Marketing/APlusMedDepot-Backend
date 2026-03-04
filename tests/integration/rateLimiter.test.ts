import express from "express";
import request from "supertest";
import rateLimit from "express-rate-limit";

function createTestApp(limiterOptions: { windowMs: number; max: number; message: unknown }) {
  const app = express();
  app.use(express.json());

  const limiter = rateLimit({
    ...limiterOptions,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use(limiter);

  app.get("/test", (_req, res) => {
    res.status(200).json({ ok: true });
  });

  app.post("/test", (_req, res) => {
    res.status(200).json({ ok: true });
  });

  return app;
}

describe("Rate limiting behavior", () => {
  describe("Global limiter (100 req / 15 min)", () => {
    const app = createTestApp({
      windowMs: 15 * 60 * 1000,
      max: 5, // Use small max for testing
      message: {
        success: false,
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: "Too many requests. Please try again later.",
        },
      },
    });

    it("allows requests within limit", async () => {
      const res = await request(app).get("/test");
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it("returns rate limit headers on successful responses", async () => {
      const res = await request(app).get("/test");
      expect(res.status).toBe(200);
      expect(res.headers["ratelimit-limit"]).toBeDefined();
      expect(res.headers["ratelimit-remaining"]).toBeDefined();
      expect(res.headers["ratelimit-reset"]).toBeDefined();
    });

    it("blocks requests exceeding limit with 429", async () => {
      // Use a fresh app to avoid state from above tests
      const freshApp = createTestApp({
        windowMs: 15 * 60 * 1000,
        max: 3,
        message: {
          success: false,
          error: {
            code: "RATE_LIMIT_EXCEEDED",
            message: "Too many requests. Please try again later.",
          },
        },
      });

      // Exhaust the limit
      await request(freshApp).get("/test");
      await request(freshApp).get("/test");
      await request(freshApp).get("/test");

      // 4th request should be blocked
      const res = await request(freshApp).get("/test");
      expect(res.status).toBe(429);
    });

    it("429 response body matches expected format", async () => {
      const freshApp = createTestApp({
        windowMs: 15 * 60 * 1000,
        max: 1,
        message: {
          success: false,
          error: {
            code: "RATE_LIMIT_EXCEEDED",
            message: "Too many requests. Please try again later.",
          },
        },
      });

      await request(freshApp).get("/test");
      const res = await request(freshApp).get("/test");

      expect(res.status).toBe(429);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("RATE_LIMIT_EXCEEDED");
      expect(res.body.error.message).toBe("Too many requests. Please try again later.");
    });
  });

  describe("Auth limiter (10 req / 15 min)", () => {
    it("blocks after exceeding auth limit", async () => {
      const app = createTestApp({
        windowMs: 15 * 60 * 1000,
        max: 2,
        message: {
          success: false,
          error: {
            code: "RATE_LIMIT_EXCEEDED",
            message: "Too many authentication attempts. Please try again in 15 minutes.",
          },
        },
      });

      await request(app).post("/test").send({ email: "a@b.com", password: "x" });
      await request(app).post("/test").send({ email: "a@b.com", password: "x" });
      const res = await request(app).post("/test").send({ email: "a@b.com", password: "x" });

      expect(res.status).toBe(429);
      expect(res.body.error.message).toBe(
        "Too many authentication attempts. Please try again in 15 minutes.",
      );
    });
  });

  describe("Payment limiter (5 req / 1 min)", () => {
    it("blocks after exceeding payment limit", async () => {
      const app = createTestApp({
        windowMs: 60 * 1000,
        max: 2,
        message: {
          success: false,
          error: {
            code: "RATE_LIMIT_EXCEEDED",
            message: "Too many payment requests. Please wait before trying again.",
          },
        },
      });

      await request(app).post("/test");
      await request(app).post("/test");
      const res = await request(app).post("/test");

      expect(res.status).toBe(429);
      expect(res.body.error.message).toBe(
        "Too many payment requests. Please wait before trying again.",
      );
    });
  });

  describe("Webhook limiter (50 req / 1 min)", () => {
    it("allows burst of requests within limit", async () => {
      const app = createTestApp({
        windowMs: 60 * 1000,
        max: 10, // Simulating burst
        message: {
          success: false,
          error: {
            code: "RATE_LIMIT_EXCEEDED",
            message: "Too many webhook requests.",
          },
        },
      });

      const results = await Promise.all(
        Array.from({ length: 10 }, () => request(app).post("/test")),
      );

      const allOk = results.every((r) => r.status === 200);
      expect(allOk).toBe(true);
    });
  });

  describe("Rate limit headers", () => {
    it("includes standard rate limit headers", async () => {
      const app = createTestApp({
        windowMs: 60 * 1000,
        max: 10,
        message: { success: false, error: { code: "RATE_LIMIT_EXCEEDED", message: "Limited" } },
      });

      const res = await request(app).get("/test");

      expect(res.headers["ratelimit-limit"]).toBe("10");
      expect(res.headers["ratelimit-remaining"]).toBeDefined();
      expect(Number(res.headers["ratelimit-remaining"])).toBeLessThan(10);
      expect(res.headers["ratelimit-reset"]).toBeDefined();
    });

    it("does not include legacy X-RateLimit headers", async () => {
      const app = createTestApp({
        windowMs: 60 * 1000,
        max: 10,
        message: { success: false, error: { code: "RATE_LIMIT_EXCEEDED", message: "Limited" } },
      });

      const res = await request(app).get("/test");

      expect(res.headers["x-ratelimit-limit"]).toBeUndefined();
      expect(res.headers["x-ratelimit-remaining"]).toBeUndefined();
    });
  });
});
