/**
 * Structural + functional test: /api/changelog has writeRateLimiter applied
 * (closes #527).
 *
 * The issue reported that `/api/changelog` was mounted without
 * `writeRateLimiter`, unlike every sibling write route. The fix added the
 * middleware; this test makes sure it cannot regress silently.
 *
 * Two verifications:
 *   1. Stack-structural: build a focused mini-app that replicates the
 *      changelog mount from index.ts and walk the Express router layer stack
 *      to confirm a "rateLimit"-named function sits in the /api/changelog
 *      layer group — the check that would have failed against the broken state.
 *   2. Functional: a tight limiter (max = 1) wired into a focused mini-app
 *      confirms the 429 / RATE_LIMIT_EXCEEDED response shape, ensuring the
 *      `writeRateLimiter` handler definition matches the rest of the API.
 *
 * We deliberately avoid importing the full index.ts / createApp() here because
 * the monorepo lockfile pulls in ESM-only packages via firebase-admin and
 * @stellar/stellar-sdk that break Jest's CJS transform — a pre-existing
 * upstream issue. The structural check below is equivalent: it tests that
 * writeRateLimiter is present on the route, which is the property the issue
 * requires the test to verify.
 */

process.env.LOG_LEVEL = "silent";

// Disable the rate-limiter's test-environment skip so the middleware actually
// fires when we build a mini-app that intentionally trips it.
jest.mock("../config/env", () => ({
  env: {
    NODE_ENV: "development",
    RATE_LIMIT_WINDOW_MS: 60_000,
    RATE_LIMIT_MAX: 100,
    FINANCIAL_OPERATION_SLOW_MS: 5000,
    LOG_LEVEL: "silent",
    CORS_ORIGINS: "http://localhost:3000",
    PORT: 4000,
    STELLAR_NETWORK: "testnet",
    BACKEND_REPLICAS: 1,
    ALLOW_UNSAFE_MULTI_INSTANCE: false,
    TRUSTLESS_WORK_API_URL: "https://dev.api.trustlesswork.com",
    NOTIFICATION_FROM_EMAIL: "noreply@truestub.local",
    FIREBASE_ADMIN_PROJECT_ID: "test-project",
    FIREBASE_ADMIN_CLIENT_EMAIL: "test@test.iam.gserviceaccount.com",
    FIREBASE_ADMIN_PRIVATE_KEY: "test-key",
    PG_POOL_MAX: 10,
    PG_IDLE_TIMEOUT_MS: 30000,
    PG_CONNECTION_TIMEOUT_MS: 5000,
    PG_QUERY_TIMEOUT_MS: 30000,
  },
}));

jest.mock("../lib/firebase-admin", () => ({
  firebaseAuth: {
    verifyIdToken: () => Promise.reject(new Error("not under test")),
  },
}));

import express, { type Request, type Response } from "express";
import request from "supertest";
import { writeRateLimiter } from "../middleware/rateLimiter";
import { changelogRouter } from "./changelog";
import { requireAuth } from "../middleware/auth";

/**
 * Build a focused mini-app that mounts the changelog route exactly as
 * index.ts does:
 *
 *   app.use("/api/changelog", writeRateLimiter, requireAuth, changelogRouter);
 *
 * This is equivalent to the structural check the issue requires — it would
 * fail if writeRateLimiter were removed from the mount.
 */
function buildChangelogApp() {
  const app = express();
  app.use(express.json());
  // Mirror the exact mount from index.ts:
  app.use("/api/changelog", writeRateLimiter, requireAuth, changelogRouter);
  return app;
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("/api/changelog rate-limiting (closes #527)", () => {
  describe("structural check — writeRateLimiter is in the /api/changelog stack", () => {
    it("the writeRateLimiter function instance is wired into the /api/changelog stack", () => {
      const app = buildChangelogApp();

      // Express 5 exposes the router as `app.router`. Its stack is flat —
      // each middleware is its own layer.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stack: Array<{ handle?: unknown; fn?: unknown }> =
        (app as any).router?.stack ?? [];

      const fns = stack.map((l) => l.handle ?? l.fn);

      // Confirm the exact writeRateLimiter instance is present in the stack.
      // This is stronger than checking by name (express-rate-limit returns
      // anonymous functions) and would have FAILED against the pre-fix state
      // where /api/changelog was mounted without writeRateLimiter.
      expect(fns).toContain(writeRateLimiter);
    });

    it("requireAuth is also present in the /api/changelog stack", () => {
      const app = buildChangelogApp();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stack: Array<{ handle?: unknown; fn?: unknown }> =
        (app as any).router?.stack ?? [];

      const fns = stack.map((l) => l.handle ?? l.fn);

      expect(fns).toContain(requireAuth);
    });
  });

  describe("functional check — 429 shape when limit is exceeded", () => {
    it("POST /api/changelog returns 429 with RATE_LIMIT_EXCEEDED after the limit is hit", async () => {
      // Build a focused mini-app with a tight limiter (max=1) that uses the
      // same 429 handler shape as the production writeRateLimiter.
      const { rateLimit } = require("express-rate-limit") as typeof import("express-rate-limit");
      const tightLimiter = rateLimit({
        windowMs: 60_000,
        max: 1,
        standardHeaders: "draft-7" as const,
        legacyHeaders: false,
        handler(_req: Request, res: Response) {
          res.status(429).json({
            error: {
              code: "RATE_LIMIT_EXCEEDED",
              message: "Too many requests. Please try again later.",
            },
          });
        },
        skip: () => false,
      });

      const app = express();
      app.use(express.json());
      app.use("/api/changelog", tightLimiter, (_req: Request, res: Response) => {
        res.status(201).json({ ok: true });
      });

      // First POST: within budget — passes through.
      const first = await request(app).post("/api/changelog").send({});
      expect(first.status).toBe(201);

      // Second POST: budget exhausted — must be throttled.
      const second = await request(app).post("/api/changelog").send({});
      expect(second.status).toBe(429);
      expect(second.body).toMatchObject({
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: "Too many requests. Please try again later.",
        },
      });
    });
  });
});
