/**
 * Edge-compatible fixed-window rate limiter keyed on client IP (#192).
 *
 * State lives in module memory, so limits are per server instance — a
 * stopgap until rate limiting lands in apps/backend (see
 * backend/src/middleware/rateLimiter.ts). No Node-only APIs are used so it
 * can run inside Next.js Edge middleware.
 */

export interface RateLimitRule {
  /** Max requests allowed per window, per IP. */
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until the current window resets. */
  retryAfter: number;
}

/** Per-route limits for the auth proxy routes under /api/auth. */
export const AUTH_ROUTE_RULES: Record<string, RateLimitRule> = {
  "/api/auth/forgot-password": { limit: 5, windowMs: 60_000 },
  "/api/auth/reset-password": { limit: 5, windowMs: 60_000 },
  "/api/auth/validate-reset-token": { limit: 10, windowMs: 60_000 },
  "/api/auth/sync-user": { limit: 20, windowMs: 60_000 },
};

const DEFAULT_AUTH_RULE: RateLimitRule = { limit: 10, windowMs: 60_000 };
const MAX_TRACKED_KEYS = 10_000;

const hits = new Map<string, { count: number; resetAt: number }>();

export function getRuleForPath(pathname: string): RateLimitRule {
  return AUTH_ROUTE_RULES[pathname.replace(/\/$/, "")] ?? DEFAULT_AUTH_RULE;
}

export function getClientIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    "unknown"
  );
}

function prune(now: number) {
  for (const [key, entry] of hits) {
    if (entry.resetAt <= now) hits.delete(key);
  }
  // Still over capacity (flood of distinct IPs) — drop the oldest entries.
  if (hits.size >= MAX_TRACKED_KEYS) {
    const excess = hits.size - MAX_TRACKED_KEYS + 1;
    let i = 0;
    for (const key of hits.keys()) {
      hits.delete(key);
      if (++i >= excess) break;
    }
  }
}

export function checkRateLimit(
  key: string,
  rule: RateLimitRule,
  now: number = Date.now(),
): RateLimitResult {
  let entry = hits.get(key);

  if (!entry || entry.resetAt <= now) {
    if (!entry && hits.size >= MAX_TRACKED_KEYS) prune(now);
    entry = { count: 0, resetAt: now + rule.windowMs };
    hits.set(key, entry);
  }

  entry.count += 1;
  const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));

  return {
    allowed: entry.count <= rule.limit,
    remaining: Math.max(0, rule.limit - entry.count),
    retryAfter,
  };
}

/** Test helper. */
export function resetRateLimits() {
  hits.clear();
}
