/**
 * Centralised error-handling middleware (#26).
 *
 * Must be registered LAST (after all routes) so Express routes errors here.
 * Maps known error types to consistent JSON shapes:
 *
 *   { error: { code: string, message: string } }
 *
 * Rules:
 *   - Operational / known errors  → log at warn, return mapped status + code.
 *   - Unknown / unexpected errors → log at error (full stack), return 500
 *     with a generic message — internals are never leaked to the client.
 */
import { ErrorRequestHandler, Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";
import { env } from "../config/env";
import { Sentry } from "../lib/sentry";

// ── Typed application error ────────────────────────────────────────────────

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
    // Maintains proper prototype chain for `instanceof` checks.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

function isCorsError(err: unknown): boolean {
  return (
    err instanceof Error &&
    err.message.startsWith("CORS:")
  );
}

// ── Middleware ─────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler: ErrorRequestHandler = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) => {
  // ── Operational errors (AppError) ────────────────────────────────────────
  if (isAppError(err)) {
    req.log?.warn({ err, code: err.code }, err.message);
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message },
    });
    return;
  }

  // ── CORS rejections ───────────────────────────────────────────────────────
  if (isCorsError(err)) {
    const message = err instanceof Error ? err.message : "CORS error";
    req.log?.warn({ err }, message);
    res.status(403).json({
      error: { code: "CORS_FORBIDDEN", message: "Cross-origin request blocked." },
    });
    return;
  }

  // ── SyntaxError from express.json() ──────────────────────────────────────
  if (err instanceof SyntaxError && "body" in err) {
    req.log?.warn({ err }, "Malformed JSON body");
    res.status(400).json({
      error: { code: "INVALID_JSON", message: "Request body contains invalid JSON." },
    });
    return;
  }

  // ── Unknown / unexpected errors ───────────────────────────────────────────
  // Log the full error (with stack) but never expose internals to the client.
  const fallbackLogger = req.log ?? logger;
  fallbackLogger.error({ err }, "Unhandled error");
  Sentry.captureException(err);

  const body: { error: { code: string; message: string; stack?: string } } = {
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred. Please try again later.",
    },
  };

  // Expose stack trace only in development to aid local debugging.
  if (env.NODE_ENV === "development" && err instanceof Error) {
    body.error.stack = err.stack;
  }

  res.status(500).json(body);
};
