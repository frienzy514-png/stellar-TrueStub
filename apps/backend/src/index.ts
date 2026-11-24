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
import { recoveryCodesRouter } from "./routes/recovery-codes";
import { adminUsersRouter } from "./routes/admin-users";
// sync-user upserts the authenticated caller's own profile into Hasura on
// login. It was exported from routes/sync-user.ts but never mounted here — the
// structural test added in routes-mounting.test.ts (#626) now enforces that
// every *Router-exporting file under routes/ is wired in below.
import { syncUserRouter } from "./routes/sync-user";
// Issue #630 — platform-wide operator analytics (admin-only by design)
import { analyticsRouter } from "./routes/analytics";
import { startDisputeResolverBalanceMonitor } from "./services/dispute-resolver-balance.service";
import { assertFirebaseAdminConfigured } from "./config/firebase-startup-check";
import { assertDatabaseReachable } from "./config/database-startup-check";
import { warnIfTrustlessWorkUnconfigured } from "./config/trustless-work-startup-check";
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
  app.use("/api/changelog", writeRateLimiter, requireAuth, changelogRouter);
  // #156 — Dispute state machine
  app.use("/api/disputes", writeRateLimiter, requireAuth, disputesRouter);
  // #240 — Account deletion / anonymization
  // #528 — auth is enforced at the mount like every other sensitive route, so a
  // handler added to users.ts later cannot ship without a token check.
  app.use("/api/users", writeRateLimiter, requireAuth, usersRouter);
  // #626 — sync-user was exported but never mounted. Auth is enforced at the
  // mount like every other sensitive write route (#528); the handler also
  // verifies the Firebase token itself, so a valid token is required.
  app.use("/api/sync-user", writeRateLimiter, requireAuth, syncUserRouter);
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

  // #567 — fail fast when Firebase Admin credentials are present but broken.
  assertFirebaseAdminConfigured()
    .then(() => assertDatabaseReachable())
    .then(() => {
      warnIfTrustlessWorkUnconfigured();
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
    })
    .catch((error) => {
      logger.fatal({ err: error }, "Startup connectivity check failed");
      process.exit(1);
    });
}

if (require.main === module) {
  // Fail fast if the frontend and backend are configured for different Stellar
  // networks (e.g. frontend on testnet, backend refunds on mainnet).
  assertNetworkConfigMatches();

  void startServer();
}
