/**
 * Sentry server-side (Node.js runtime) configuration for Next.js.
 *
 * Picked up automatically by `withSentryConfig` in next.config.ts.
 *
 * @see https://docs.sentry.io/platforms/javascript/guides/nextjs/
 */
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  tracesSampleRate: 0.1,

  environment:
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,

  // Wallet noise does not originate server-side, but keep ignoreErrors in sync
  // with the client config to avoid surprises if any library is ever SSR'd.
  ignoreErrors: [
    "Connection request reset. Please try again.",
    "valtio: proxy is not reactive during SSR/hydration. use useSnapshot instead.",
    /^No matching key\. session_(delete|expire) is a no-op for topic:/,
  ],
});
