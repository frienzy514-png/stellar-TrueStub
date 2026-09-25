/**
 * CORS and security-headers middleware (#25).
 *
 * cors  — restricts cross-origin requests to the configured frontend origin(s).
 * helmet — sets a baseline of HTTP security headers (CSP, HSTS, X-Frame-Options…).
 *
 * CORS_ORIGINS env var accepts a comma-separated list so multiple origins can
 * be whitelisted (e.g. staging + production).
 */
import cors from "cors";
import helmet from "helmet";
import { env } from "../config/env";

const allowedOrigins = env.CORS_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean);

export const corsMiddleware = cors({
  origin(origin, callback) {
    // Allow server-to-server requests (no Origin header) and whitelisted origins.
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin '${origin}' is not allowed`));
    }
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-request-id"],
  credentials: true,
  maxAge: 86400, // preflight cache: 24 h
});

export const helmetMiddleware = helmet();
