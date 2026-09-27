import "dotenv/config";
import express, { type Express } from "express";
import { env } from "./config/env";
import { logger } from "./lib/logger";
import { initSentry, Sentry } from "./lib/sentry";
import { requestLogger } from "./middleware/requestLogger";
import { corsMiddleware, helmetMiddleware } from "./middleware/security";
import { authRateLimiter } from "./middleware/rateLimiter";
import { requireAuth, requireAuthForWrites } from "./middleware/auth";
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

export function createApp(): Express {
  const app = express();

  app.use(helmetMiddleware);
  app.use(corsMiddleware);
  app.use(requestLogger);
  // Keep the raw bytes for HMAC-verified webhooks (see routes/webhooks.ts).
  app.use(express.json({ verify: captureRawBody }));
  app.use("/api/auth", authRateLimiter);
  app.use("/health", healthRouter);
  app.use("/api/listings", requireAuthForWrites, listingsRouter);
  app.use("/api/saved-searches", requireAuth, savedSearchesRouter);
  app.use("/api/watchlist", requireAuth, watchlistRouter);
  app.use("/webhooks", webhookRouter);
  // #153 — Refund idempotency
  app.use("/api/refunds", requireAuth, refundsRouter);
  // #154 — Atomic ownership transfers
  app.use("/api/transfers", requireAuth, transfersRouter);
  // #155 — Immutable changelog
  app.use("/api/changelog", requireAuth, changelogRouter);
  // #156 — Dispute state machine
  app.use("/api/disputes", requireAuth, disputesRouter);
  // #240 — Account deletion / anonymization
  app.use("/api/users", usersRouter);
  app.use(errorHandler);
  return app;
}

export const app = createApp();

if (require.main === module) {
  app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, "TrueStub backend listening");
  });
}
