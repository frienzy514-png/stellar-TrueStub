/**
 * Structural check of the `createApp()` route table (#529).
 *
 * Instead of finding missing-middleware gaps one route at a time, this test
 * reads the Express middleware stack built by `createApp()` and asserts that
 * every sensitive mount has its expected auth middleware and rate limiter in
 * front of the router. Removing `writeRateLimiter`, `requireAuth`,
 * `requireAuthForWrites` or `requireAdmin` from a mount in index.ts fails here.
 *
 * It also fails if a new `/api/*` router is mounted without being declared in
 * `EXPECTED_MOUNTS`, so new routes have to state their protection explicitly.
 */
import type { Express, RequestHandler } from "express";

process.env.LOG_LEVEL = "silent";

const { createApp } = require("./index") as typeof import("./index");
const { requireAdmin, requireAuth, requireAuthForWrites } =
  require("./middleware/auth") as typeof import("./middleware/auth");
const { authRateLimiter, writeRateLimiter } =
  require("./middleware/rateLimiter") as typeof import("./middleware/rateLimiter");

interface ExpectedMount {
  auth: RequestHandler;
  /** `null` only for read-only, admin-gated mounts. */
  rateLimiter: RequestHandler | null;
}

const EXPECTED_MOUNTS: Record<string, ExpectedMount> = {
  "/api/listings": { auth: requireAuthForWrites, rateLimiter: writeRateLimiter },
  "/api/saved-searches": { auth: requireAuth, rateLimiter: writeRateLimiter },
  "/api/watchlist": { auth: requireAuth, rateLimiter: writeRateLimiter },
  "/api/refunds": { auth: requireAuth, rateLimiter: writeRateLimiter },
  "/api/transfers": { auth: requireAuth, rateLimiter: writeRateLimiter },
  "/api/changelog": { auth: requireAuth, rateLimiter: writeRateLimiter },
  "/api/disputes": { auth: requireAuth, rateLimiter: writeRateLimiter },
  "/api/users": { auth: requireAuth, rateLimiter: writeRateLimiter },
  "/api/admin/users": { auth: requireAdmin, rateLimiter: authRateLimiter },
  // Read-only operator view (see docs/ANALYTICS_ACCESS_MODEL.md).
  "/api/analytics": { auth: requireAdmin, rateLimiter: null },
};

// `/api/auth/*` is the pre-login surface: protected by `authRateLimiter`
// rather than a token check, since callers have no token yet.
const UNAUTHENTICATED_API_PREFIXES = ["/api/auth"];

interface Layer {
  name: string;
  handle: RequestHandler;
  regexp: RegExp & { fast_slash?: boolean };
}

function stackOf(app: Express): Layer[] {
  // Express 4 keeps the top-level middleware stack on the private `_router`.
  const router = (app as unknown as { _router?: { stack: Layer[] } })._router;
  if (!router) throw new Error("createApp() returned an app without a router stack");
  return router.stack;
}

/** Layers mounted at exactly `mountPath` (excludes global `app.use(fn)` layers). */
function layersAt(stack: Layer[], mountPath: string): Layer[] {
  return stack.filter(
    (layer) =>
      !layer.regexp.fast_slash &&
      layer.regexp.test(mountPath) &&
      // Exclude a shorter prefix mount (e.g. `/api/auth` when checking
      // `/api/auth/recovery-codes`) by requiring the layer not to also match
      // a sibling path outside `mountPath`.
      !layer.regexp.test(`${mountPath.replace(/\/[^/]+$/, "")}/__sibling__`)
  );
}

/** Every distinct path a router is mounted at under `/api`. */
function mountedApiRouterPaths(stack: Layer[]): string[] {
  return stack
    .filter((layer) => layer.name === "router" && !layer.regexp.fast_slash)
    .map((layer) => {
      // Recover the mount path from the layer regexp source, e.g.
      // /^\/api\/users\/?(?=\/|$)/i  ->  /api/users
      const match = layer.regexp.source.match(/^\^((?:\\\/[^\\?(]+)+)/);
      return match ? match[1].replace(/\\\//g, "/") : layer.regexp.source;
    })
    .filter((p) => p.startsWith("/api"));
}

describe("createApp() route table middleware", () => {
  const stack = stackOf(createApp());

  describe.each(Object.entries(EXPECTED_MOUNTS))("%s", (mountPath, expected) => {
    const layers = layersAt(stack, mountPath);
    const handles = layers.map((layer) => layer.handle);
    const routerIndex = layers.findIndex((layer) => layer.name === "router");

    it("mounts a router", () => {
      expect(routerIndex).toBeGreaterThanOrEqual(0);
    });

    it("runs the expected auth middleware before the router", () => {
      const authIndex = handles.indexOf(expected.auth);
      expect(authIndex).toBeGreaterThanOrEqual(0);
      expect(authIndex).toBeLessThan(routerIndex);
    });

    if (expected.rateLimiter) {
      const rateLimiter = expected.rateLimiter;
      it("runs the expected rate limiter before auth and the router", () => {
        const limiterIndex = handles.indexOf(rateLimiter);
        expect(limiterIndex).toBeGreaterThanOrEqual(0);
        expect(limiterIndex).toBeLessThan(handles.indexOf(expected.auth));
        expect(limiterIndex).toBeLessThan(routerIndex);
      });
    }
  });

  it("declares the protection of every mounted /api router", () => {
    const undeclared = mountedApiRouterPaths(stack).filter(
      (p) =>
        !(p in EXPECTED_MOUNTS) &&
        !UNAUTHENTICATED_API_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`))
    );
    expect(undeclared).toEqual([]);
  });
});
