import rateLimit from "express-rate-limit";

/**
 * Global rate limiter — applied to ALL routes.
 * 100 requests per 15-minute window per IP.
 */
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const forwarded = req.headers["x-forwarded-for"];
    const forwardedIp = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return req.ip || forwardedIp || "unknown";
  },
  message: {
    success: false,
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many requests. Please try again later.",
    },
  },
});

/**
 * Auth limiter — applied to /api/auth routes.
 * 10 requests per 15-minute window per IP.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const forwarded = req.headers["x-forwarded-for"];
    const forwardedIp = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return req.ip || forwardedIp || "unknown";
  },
  message: {
    success: false,
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many authentication attempts. Please try again in 15 minutes.",
    },
  },
});

/**
 * Payment limiter — applied to /api/payments routes (excluding webhook).
 * 5 requests per 1-minute window per IP.
 */
export const paymentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const forwarded = req.headers["x-forwarded-for"];
    const forwardedIp = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return req.ip || forwardedIp || "unknown";
  },
  message: {
    success: false,
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many payment requests. Please wait before trying again.",
    },
  },
});

/**
 * Webhook limiter — applied to Stripe webhook endpoint.
 * 50 requests per 1-minute window (Stripe sends legitimate bursts).
 */
export const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many webhook requests.",
    },
  },
});

/**
 * Search limiter — applied to search/autocomplete endpoints.
 * 30 requests per 1-minute window per IP.
 */
export const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const forwarded = req.headers["x-forwarded-for"];
    const forwardedIp = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return req.ip || forwardedIp || "unknown";
  },
  message: {
    success: false,
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many search requests. Please slow down.",
    },
  },
});

// Backward compatibility alias
export const apiLimiter = globalLimiter;
