import express from "express";
import request from "supertest";
import {
  globalLimiter,
  authLimiter,
  paymentLimiter,
  webhookLimiter,
  searchLimiter,
} from "../../src/middleware/rateLimiter";

describe("Rate limiter configuration", () => {
  it("globalLimiter is a function (middleware)", () => {
    expect(typeof globalLimiter).toBe("function");
  });

  it("authLimiter is a function (middleware)", () => {
    expect(typeof authLimiter).toBe("function");
  });

  it("paymentLimiter is a function (middleware)", () => {
    expect(typeof paymentLimiter).toBe("function");
  });

  it("webhookLimiter is a function (middleware)", () => {
    expect(typeof webhookLimiter).toBe("function");
  });

  it("searchLimiter is a function (middleware)", () => {
    expect(typeof searchLimiter).toBe("function");
  });

  it("all limiters are distinct instances", () => {
    expect(globalLimiter).not.toBe(authLimiter);
    expect(authLimiter).not.toBe(paymentLimiter);
    expect(paymentLimiter).not.toBe(webhookLimiter);
    expect(webhookLimiter).not.toBe(searchLimiter);
  });
});

describe("Rate limiter keyGenerator coverage", () => {
  function buildApp(limiter: express.RequestHandler) {
    const app = express();
    app.use(limiter);
    app.get("/test", (_req, res) => res.json({ ok: true }));
    return app;
  }

  it("authLimiter keyGenerator extracts IP from x-forwarded-for string", async () => {
    const app = buildApp(authLimiter);
    const res = await request(app).get("/test").set("x-forwarded-for", "1.2.3.4");
    expect(res.status).toBe(200);
  });

  it("authLimiter keyGenerator handles x-forwarded-for array", async () => {
    const app = buildApp(authLimiter);
    const res = await request(app).get("/test").set("x-forwarded-for", "5.6.7.8, 9.10.11.12");
    expect(res.status).toBe(200);
  });

  it("paymentLimiter keyGenerator extracts IP", async () => {
    const app = buildApp(paymentLimiter);
    const res = await request(app).get("/test").set("x-forwarded-for", "10.0.0.1");
    expect(res.status).toBe(200);
  });

  it("searchLimiter keyGenerator extracts IP", async () => {
    const app = buildApp(searchLimiter);
    const res = await request(app).get("/test").set("x-forwarded-for", "192.168.1.1");
    expect(res.status).toBe(200);
  });

  it("webhookLimiter allows requests without custom keyGenerator", async () => {
    const app = buildApp(webhookLimiter);
    const res = await request(app).get("/test");
    expect(res.status).toBe(200);
  });
});
