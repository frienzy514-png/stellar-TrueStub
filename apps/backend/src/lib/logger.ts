/**
 * Shared pino logger instance (#23).
 *
 * Import this wherever you need structured logging outside of the HTTP
 * request lifecycle. For per-request logging (with request-id correlation)
 * use the requestLogger middleware which attaches `req.log` automatically.
 *
 * In development the transport is pino-pretty for human-readable output.
 * In production/test it emits raw JSON, suitable for log aggregators.
 *
 * Correlation (#425): every log line automatically includes the current
 * request correlation ID when running within a request context. The ID is
 * read from the AsyncLocalStorage store established by requestLogger.ts, so
 * services that log outside the HTTP lifecycle (e.g. refunds.ts, dispute
 * resolution, Hasura status updates, changelog) still emit the same
 * correlation ID as the originating request.
 */
import pino from "pino";
import { env } from "../config/env";
import { getCorrelationId as getRequestId } from "../middleware/requestLogger";

const isDev = env.NODE_ENV === "development";

export const logger = pino({
  level: env.LOG_LEVEL,
  // Attach the current request correlation ID (if any) to every log line.
  // `mixin` runs per log call, so it picks up the AsyncLocalStorage context
  // active at the time of logging — including async continuations.
  mixin() {
    const requestId = getRequestId();
    return requestId ? { requestId } : {};
  },
  ...(isDev
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname",
          },
        },
      }
    : {
        // Production: structured JSON. Redact sensitive fields so they are
        // never written to log sinks even if accidentally passed to logger.
        redact: {
          paths: [
            "req.headers.authorization",
            "req.headers.cookie",
            "*.password",
            "*.secret",
            "*.token",
          ],
          censor: "[REDACTED]",
        },
      }),
});