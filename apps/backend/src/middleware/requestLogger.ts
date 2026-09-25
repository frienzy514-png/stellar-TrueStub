/**
 * Structured HTTP request-logging middleware (#23).
 *
 * Uses pino-http to log method / path / status / duration for every request.
 * A unique `x-request-id` is generated (or forwarded if already present) and
 * attached to every log line for correlation.
 *
 * Sensitive headers are redacted so they never appear in log output:
 *   - Authorization
 *   - Cookie
 *   - x-webhook-secret
 */
import pinoHttp from "pino-http";
import { randomUUID } from "crypto";
import { logger } from "../lib/logger";

export const requestLogger = pinoHttp({
  logger,

  // Generate / propagate a request-id for log correlation.
  genReqId(req, res) {
    const existing =
      (req.headers["x-request-id"] as string | undefined) ?? randomUUID();
    res.setHeader("x-request-id", existing);
    return existing;
  },

  // Fields to redact from the logged request object.
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers['x-webhook-secret']",
    ],
    censor: "[REDACTED]",
  },

  // Custom log-level per status code: 5xx → error, 4xx → warn, rest → info.
  customLogLevel(_req, res, err) {
    if (err || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },

  // Trim down the default serialised request/response to what's useful.
  customSuccessMessage(req, res) {
    return `${req.method} ${req.url} ${res.statusCode}`;
  },
  customErrorMessage(req, _res, err) {
    return `${req.method} ${req.url} — ${err.message}`;
  },
});
