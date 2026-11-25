import { Router } from "express";
import { checkDisputeResolverBalance } from "../services/dispute-resolver-balance.service";
import { checkDeepHealth } from "../services/deep-health.service";
import { sampleInMemoryStoreSizes } from "../services/in-memory-store-monitor";

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  res.json({ status: "ok", service: "truestub-backend" });
});

/** Dependency-aware readiness check for monitoring; / remains liveness-only. */
healthRouter.get("/deep", async (_req, res) => {
  const result = await checkDeepHealth();
  res.status(result.status === "down" ? 503 : 200).json(result);
});

healthRouter.get("/dispute-resolver-balance", async (_req, res) => {
  try {
    const result = await checkDisputeResolverBalance();
    res.json({
      status: result.low ? "low" : "ok",
      balance: result.balance,
      threshold: result.threshold,
    });
  } catch (err) {
    res.status(500).json({
      status: "error",
      message: err instanceof Error ? err.message : "unknown error",
    });
  }
});

/**
 * GET /health/stores — in-memory store size report (issue #523).
 *
 * Returns the current entry counts for every tracked in-process store so
 * operators can observe store growth without reading process memory directly.
 * This endpoint is intentionally unauthenticated (like /health) so monitoring
 * agents can poll it without credentials.
 *
 * Example response:
 *   { "refundClaims": 142, "changelogEntries": 37 }
 */
healthRouter.get("/stores", (_req, res) => {
  res.json(sampleInMemoryStoreSizes());
});
