/**
 * Shared pino logger instance (#23).
 *
 * Import this wherever you need structured logging outside of the HTTP
 * request lifecycle. For per-request logging (with request-id correlation)
 * use the requestLogger middleware which attaches `req.log` automatically.
 *
 * In development the transport is pino-pretty for human-readable output.
 * In production/test it emits raw JSON, suitable for log aggregators.
 */
import pino from "pino";
import { env } from "../config/env";

const isDev = env.NODE_ENV === "development";

export const logger = pino({
  level: env.LOG_LEVEL,
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
