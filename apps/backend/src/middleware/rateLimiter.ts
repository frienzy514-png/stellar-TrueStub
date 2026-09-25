/**
 * Rate-limiting middleware for auth routes (#24).
 *
 * Scoped to /api/auth/* to protect password-reset, token-validation, and
 * any other auth endpoints from brute-force and enumeration attacks.
 *
 * Limits are fully configurable via env vars so they can be tuned per
 * environment (e.g. higher in development/test, tighter in production):
 *
 *   RATE_LIMIT_WINDOW_MS  — sliding window size in ms (default: 15 min)
 *   RATE_LIMIT_MAX        — max requests per window per IP (default: 20)
 */
import rateLimit from "express-rate-limit";
import { env } from "../config/env";

export const authRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: "draft-7", // Return rate-limit info in RateLimit-* headers
  legacyHeaders: false,

  // Return a consistent JSON error shape matching the rest of the API.
  handler(_req, res) {
    res.status(429).json({
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: "Too many requests. Please try again later.",
      },
    });
  },

  // Skip rate limiting in test environments so tests aren't flaky.
  skip() {
    return env.NODE_ENV === "test";
  },
});
