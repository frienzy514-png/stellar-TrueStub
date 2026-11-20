import { Router } from "express";
import { checkDisputeResolverBalance } from "../services/dispute-resolver-balance.service";
import { checkDeepHealth } from "../services/deep-health.service";

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
