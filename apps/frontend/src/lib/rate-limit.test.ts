import {
  checkRateLimit,
  getClientIp,
  getRuleForPath,
  resetRateLimits,
} from "./rate-limit";

describe("rate-limit", () => {
  beforeEach(() => resetRateLimits());

  it("allows up to the limit then blocks", () => {
    const rule = { limit: 3, windowMs: 1000 };
    const results = [1, 2, 3, 4].map(() => checkRateLimit("ip:a", rule, 0));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results[3].retryAfter).toBe(1);
  });

  it("tracks keys independently", () => {
    const rule = { limit: 1, windowMs: 1000 };
    expect(checkRateLimit("ip:a", rule, 0).allowed).toBe(true);
    expect(checkRateLimit("ip:a", rule, 0).allowed).toBe(false);
    expect(checkRateLimit("ip:b", rule, 0).allowed).toBe(true);
  });

  it("resets after the window elapses", () => {
    const rule = { limit: 1, windowMs: 1000 };
    checkRateLimit("ip:a", rule, 0);
    expect(checkRateLimit("ip:a", rule, 500).allowed).toBe(false);
    expect(checkRateLimit("ip:a", rule, 1001).allowed).toBe(true);
  });

  it("resolves per-route rules and client IP", () => {
    expect(getRuleForPath("/api/auth/forgot-password").limit).toBe(5);
    expect(getRuleForPath("/api/auth/unknown").limit).toBe(10);
    const h = new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" });
    expect(getClientIp(h)).toBe("1.2.3.4");
  });
});
