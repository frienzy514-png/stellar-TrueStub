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
import { webhookRouter } from "./routes/webhooks";
// Issues #153–#156
import { refundsRouter } from "./routes/refunds";
import { transfersRouter } from "./routes/transfers";
import { changelogRouter } from "./routes/changelog";
import { disputesRouter } from "./routes/disputes";
// Issue #240 — account deletion / anonymization
import { usersRouter } from "./routes/users";
import { adminUsersRouter } from "./routes/admin-users";
import { startDisputeResolverBalanceMonitor } from "./services/dispute-resolver-balance.service";

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
  app.use(errorHandler);
  return app;
}

export const app = createApp();

if (require.main === module) {
  // Fail fast if the frontend and backend are configured for different Stellar
  // networks (e.g. frontend on testnet, backend refunds on mainnet).
  assertNetworkConfigMatches();

  app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, "TrueStub backend listening");

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
