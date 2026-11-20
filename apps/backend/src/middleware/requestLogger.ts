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
import pino from "pino";
import { randomUUID } from "crypto";
import { AsyncLocalStorage } from "async_hooks";
import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";
import { Sentry } from "../lib/sentry";

/**
 * Request-scoped correlation context.
 *
 * Holds the `x-request-id` for the currently-executing request so that any
 * downstream service (refunds → Trustless Work dispute API → Hasura status
 * update → changelog) can read the same correlation ID without explicit
 * plumbing through every function signature.
 */
export const correlationStorage = new AsyncLocalStorage<string>();

/**
 * Read the correlation ID for the currently-executing request, if any.
 *
 * Returns `undefined` when called outside of a request scope (e.g. from a
 * background job or a unit test).
 */
export function getCorrelationId(): string | undefined {
  return correlationStorage.getStore();
}

/**
 * Run `fn` with `correlationId` bound as the active request context.
 *
 * Useful for background work that is triggered by a request but executes
 * outside of the Express middleware chain (e.g. queued jobs).
 */
export function runWithCorrelationId<T>(correlationId: string, fn: () => T): T {
  return correlationStorage.run(correlationId, fn);
}

/**
 * Express middleware that binds the request's correlation ID into
 * AsyncLocalStorage and attaches it to the Sentry scope, so every log line
 * and Sentry event emitted while handling the request shares the same ID.
 *
 * Must be mounted after `requestLogger` so that `req.id` is already set.
 */
export function correlationContext(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const correlationId = String(req.id ?? getCorrelationId() ?? randomUUID());

  // Attach to Sentry so every event captured during this request carries it.
  Sentry.setTag("request_id", correlationId);
  Sentry.setContext("request", { requestId: correlationId });

  correlationStorage.run(correlationId, () => next());
}

export const requestLogger = pinoHttp({
  logger,

  // Generate / propagate a request-id for log correlation.
  genReqId(req, res) {
    const existing =
      (req.headers["x-request-id"] as string | undefined) ?? randomUUID();
    res.setHeader("x-request-id", existing);
    return existing;
  },

  // Bind the correlation ID into the pino child logger for this request so
  // every downstream log line automatically includes it.
  customProps(req) {
    return { requestId: String(req.id) };
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

  // HTTP logs are metadata-only. Keep Pino's standard request fields, but
  // explicitly strip any body property so parsed payloads cannot be emitted.
  serializers: {
    req(req) {
      const serializedReq = pino.stdSerializers.req(req);
      const { body: _body, ...safeReq } = serializedReq as typeof serializedReq & {
        body?: unknown;
      };
      return safeReq;
    },
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
