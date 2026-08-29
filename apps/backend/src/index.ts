import "dotenv/config";
import express, { type Express } from "express";
import { env } from "./config/env";
import { logger } from "./lib/logger";
import { initSentry, Sentry } from "./lib/sentry";
import { requestLogger } from "./middleware/requestLogger";
import { corsMiddleware, helmetMiddleware } from "./middleware/security";
import { authRateLimiter } from "./middleware/rateLimiter";
import { errorHandler } from "./middleware/errorHandler";
import { healthRouter } from "./routes/health";
import { listingsRouter } from "./routes/listings";
import { webhookRouter } from "./routes/webhooks";
// Issues #153–#156
import { refundsRouter } from "./routes/refunds";
import { transfersRouter } from "./routes/transfers";
import { changelogRouter } from "./routes/changelog";
import { disputesRouter } from "./routes/disputes";

export function createApp(): Express {
  const app = express();

  // Sentry request handler must be the very first middleware.
  app.use(sentryRequestHandler());

  app.use(helmetMiddleware);
  app.use(corsMiddleware);
  app.use(requestLogger);
  app.use(express.json());
  app.use("/api/auth", authRateLimiter);
  app.use("/health", healthRouter);
  app.use("/api/listings", listingsRouter);
  app.use("/webhooks", webhookRouter);
  // #153 — Refund idempotency
  app.use("/api/refunds", refundsRouter);
  // #154 — Atomic ownership transfers
  app.use("/api/transfers", transfersRouter);
  // #155 — Immutable changelog
  app.use("/api/changelog", changelogRouter);
  // #156 — Dispute state machine
  app.use("/api/disputes", disputesRouter);
  app.use(errorHandler);
  return app;
}

export const app = createApp();

if (require.main === module) {
  app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, "TrueStub backend listening");
  });
}
