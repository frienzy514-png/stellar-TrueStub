import express from "express";
import request from "supertest";

// Failed-auth throttling must run against the real limiter, so the
// test-environment skip is disabled for this suite.
jest.mock("../config/env", () => ({
  env: {
    NODE_ENV: "development",
    RATE_LIMIT_WINDOW_MS: 15 * 60 * 1000,
    RATE_LIMIT_MAX: 20,
  },
}));

const verifyIdToken = jest.fn();
jest.mock("../lib/firebase-admin", () => ({
  firebaseAuth: { verifyIdToken: (token: string) => verifyIdToken(token) },
}));

const FAILED_AUTH_LIMIT = 5; // well below RATE_LIMIT_MAX (20)

function buildApp() {
  // Load a fresh limiter per test so its in-memory store starts empty.
  let authRateLimiter!: express.RequestHandler;
  let requireAuth!: express.RequestHandler;
  jest.isolateModules(() => {
    authRateLimiter = require("./rateLimiter").authRateLimiter;
    requireAuth = require("./auth").requireAuth;
  });

  const app = express();
  app.use(express.json());
  app.use("/api/auth", authRateLimiter, requireAuth, (_req, res) => res.json({ ok: true }));
  return app;
}

describe("failed-authentication rate limiting", () => {
  beforeEach(() => verifyIdToken.mockReset());

  it("throttles repeated failed auth attempts from one source before general volume limits apply", async () => {
    verifyIdToken.mockRejectedValue(new Error("invalid token"));
    const app = buildApp();

    for (let i = 0; i < FAILED_AUTH_LIMIT; i++) {
      const res = await request(app).get("/api/auth/me").set("Authorization", "Bearer bad");
      expect(res.status).toBe(401);
    }

    // The next failed attempt must be throttled, even though the general
    // request budget (RATE_LIMIT_MAX = 20) has not been exhausted.
    const throttled = await request(app).get("/api/auth/me").set("Authorization", "Bearer bad");
    expect(throttled.status).toBe(429);
    expect(throttled.body.error.code).toBe("RATE_LIMIT_EXCEEDED");
  });

  it("does not throttle authenticated requests at the failed-auth threshold", async () => {
    verifyIdToken.mockResolvedValue({ uid: "user-1" });
    const app = buildApp();

    for (let i = 0; i < FAILED_AUTH_LIMIT + 1; i++) {
      const res = await request(app).get("/api/auth/me").set("Authorization", "Bearer good");
      expect(res.status).toBe(200);
    }
  });
});
