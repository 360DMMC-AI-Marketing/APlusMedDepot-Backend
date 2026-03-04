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
