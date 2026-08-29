/**
 * Error tracking (#111).
 *
 * Thin wrapper around the Sentry SDK. `initSentry` is a no-op when
 * `SENTRY_DSN` isn't set, so local dev and CI run without a Sentry project
 * configured. Call `initSentry()` before the Express app is created.
 */
import * as Sentry from "@sentry/node";
import { env } from "../config/env";

export function initSentry(): void {
  if (!env.SENTRY_DSN) {
    return;
  }

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: env.NODE_ENV === "production" ? 0.1 : 0,
  });
}

export { Sentry };
