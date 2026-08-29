/**
 * Sentry client-side configuration for Next.js (browser + React).
 *
 * This file is picked up automatically by the Sentry Next.js SDK via
 * `withSentryConfig` in next.config.ts — no explicit import is needed.
 *
 * Key choices:
 *  - Wallet-related noise is filtered here (beforeSend + ignoreErrors) rather
 *    than via the global console-patching in ErrorSuppressor.tsx, so that
 *    ErrorSuppressor can eventually be removed once Sentry is the primary
 *    observability channel.
 *  - DSN is read from NEXT_PUBLIC_SENTRY_DSN; if unset the SDK is a no-op.
 *  - Session replays are disabled by default — enable once GDPR review is done.
 *
 * @see https://docs.sentry.io/platforms/javascript/guides/nextjs/
 */
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Percentage of transactions captured for performance monitoring.
  // Start low and increase once baseline is established.
  tracesSampleRate: 0.1,

  // Disable session replay until privacy review is complete.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,

  // Human-readable environment tag.
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,

  /**
   * Filter known-noisy wallet / state-management errors at ingestion so they
   * never appear in the Sentry dashboard.  Mirrors the suppression rules in
   * ErrorSuppressor.tsx (which handles the browser console side).
   *
   * Each entry here corresponds to a specific upstream bug — update when fixed:
   *   WalletConnect #4326 — "Connection request reset"
   *   Reown AppKit #2788  — "[Reown] AppKit initialized" / "[reown/appkit]"
   *   valtio #327         — SSR proxy warning
   *   WalletConnect ethereum-provider #3901 — "No matching key" session
   */
  ignoreErrors: [
    // WalletConnect #4326
    "Connection request reset. Please try again.",
    // valtio #327
    "valtio: proxy is not reactive during SSR/hydration. use useSnapshot instead.",
    // WalletConnect #3901
    /^No matching key\. session_(delete|expire) is a no-op for topic:/,
  ],

  beforeSend(event, hint) {
    const err = hint?.originalException;
    if (err instanceof Error) {
      // Reown AppKit #2788 — noisy init logs sometimes arrive as errors
      if (
        err.message.startsWith("[Reown] AppKit initialized") ||
        err.message.startsWith("[reown/appkit]")
      ) {
        return null;
      }
    }
    return event;
  },
});
