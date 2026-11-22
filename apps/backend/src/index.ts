import "dotenv/config";
import express, { type Express } from "express";
import { env } from "./config/env";
import { assertNetworkConfigMatches } from "./config/networkCheck";
import { logger } from "./lib/logger";
import { initSentry, Sentry } from "./lib/sentry";
import { requestLogger } from "./middleware/requestLogger";
import { corsMiddleware, helmetMiddleware } from "./middleware/security";
import { authRateLimiter, writeRateLimiter } from "./middleware/rateLimiter";
import { requireAdmin, requireAuth, requireAuthForWrites } from "./middleware/auth";
import { errorHandler } from "./middleware/errorHandler";
import { captureRawBody } from "./middleware/rawBody";
import { healthRouter } from "./routes/health";
import { listingsRouter } from "./routes/listings";
import { savedSearchesRouter, watchlistRouter } from "./routes/listing-alerts";
import { startProcessedWebhookEventCleanup, webhookRouter } from "./routes/webhooks";
// Issues #153–#156
import { refundsRouter } from "./routes/refunds";
import { transfersRouter } from "./routes/transfers";
import { changelogRouter } from "./routes/changelog";
import { disputesRouter } from "./routes/disputes";
// Issue #240 — account deletion / anonymization
import { usersRouter } from "./routes/users";
import { adminUsersRouter } from "./routes/admin-users";
// Issue #630 — platform-wide operator analytics (admin-only by design)
import { analyticsRouter } from "./routes/analytics";
import { startDisputeResolverBalanceMonitor } from "./services/dispute-resolver-balance.service";
import { runStartupChecks } from "./lib/startup-checks";

// Initialise Sentry exactly once, before the app is created (#260). All Sentry
// config lives in lib/sentry.ts.
initSentry();

export function createApp(): Express {
  const app = express();

  // #264 — security headers and CORS are mounted globally, before every
  // route, so new routers inherit them automatically. Keep these first.
  app.use(helmetMiddleware);
  app.use(corsMiddleware);
  app.use(requestLogger);
  // Keep the raw bytes for HMAC-verified webhooks (see routes/webhooks.ts).
  app.use(express.json({ verify: captureRawBody }));
  app.use("/api/auth", authRateLimiter);
  app.use("/api/auth/recovery-codes", recoveryCodesRouter);
  app.use("/health", healthRouter);
  app.use("/api/listings", writeRateLimiter, requireAuthForWrites, listingsRouter);
  app.use("/api/saved-searches", writeRateLimiter, requireAuth, savedSearchesRouter);
  app.use("/api/watchlist", writeRateLimiter, requireAuth, watchlistRouter);
  app.use("/webhooks", webhookRouter);
  // #153 — Refund idempotency
  app.use("/api/refunds", writeRateLimiter, requireAuth, refundsRouter);
  // #154 — Atomic ownership transfers
  app.use("/api/transfers", writeRateLimiter, requireAuth, transfersRouter);
  // #155 — Immutable changelog
  app.use("/api/changelog", requireAuth, changelogRouter);
  // #156 — Dispute state machine
  app.use("/api/disputes", writeRateLimiter, requireAuth, disputesRouter);
  // #240 — Account deletion / anonymization
  app.use("/api/users", writeRateLimiter, usersRouter);
  app.use("/api/admin/users", authRateLimiter, requireAdmin, adminUsersRouter);
  // #630 — `/api/analytics` aggregates every escrow on the platform with no
  // per-user/tenant filter. That is intentional: it is an operator-only view,
  // so admin gating is the access control. See docs/ANALYTICS_ACCESS_MODEL.md.
  app.use("/api/analytics", requireAdmin, analyticsRouter);
  app.use(errorHandler);
  return app;
}

export const app = createApp();

/**
 * Binds the HTTP port only after the fail-fast startup checks pass (#565, #566).
 * A failed check exits non-zero so the orchestrator restarts or rolls back
 * instead of serving traffic against a broken database or Hasura setup.
 */
async function startServer(): Promise<void> {
  try {
    await runStartupChecks();
  } catch (err) {
    logger.fatal({ err }, "Startup check failed; refusing to start the backend");
    process.exit(1);
  }

  app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, "TrueStub backend listening");

    // #518 — prune old webhook delivery dedup rows on a schedule instead of
    // evicting them from an in-process Map.
    startProcessedWebhookEventCleanup();

    // #420 — Periodically check the dispute-resolver wallet balance so a low
    // balance alerts before it causes a failed refund.
    if (env.DISPUTE_RESOLVER_WALLET_ADDRESS) {
      startDisputeResolverBalanceMonitor();
      logger.info(
        { walletAddress: env.DISPUTE_RESOLVER_WALLET_ADDRESS },
        "Dispute-resolver balance monitor started",
      );
    } else {
      logger.warn(
        "Dispute-resolver balance monitor not started: DISPUTE_RESOLVER_WALLET_ADDRESS is not configured",
      );
    }
  });
}

if (require.main === module) {
  // Fail fast if the frontend and backend are configured for different Stellar
  // networks (e.g. frontend on testnet, backend refunds on mainnet).
  assertNetworkConfigMatches();

  void startServer();
}
