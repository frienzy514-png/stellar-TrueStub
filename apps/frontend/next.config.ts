import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// ---------------------------------------------------------------------------
// Security Headers — Issue #85
//
// Scoped to the actual origins this app contacts:
//   - Firebase Auth:   *.firebaseapp.com, *.googleapis.com,
//                      *.google.com (OAuth redirect flow),
//                      identitytoolkit.googleapis.com
//   - Hasura GraphQL:  runtime env var NEXT_PUBLIC_HASURA_GRAPHQL_URL
//   - TrustlessWork:   dev.api.trustlesswork.com (dev)
//                      api.trustlesswork.com     (production)
//   - Stellar Horizon: horizon-testnet.stellar.org,
//                      horizon.stellar.org
//   - WalletConnect:   relay.walletconnect.com, verify.walletconnect.com
//                      explorer-api.walletconnect.com
//
// The `wss:` mirrors in connect-src cover WebSocket upgrades for Hasura
// subscriptions and the WalletConnect relay.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Remote listing image hosts — Issue #172
//
// Listing/event photos uploaded by sellers are served from Firebase Storage
// (the project's NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET). NEXT_PUBLIC_LISTING_IMAGES_HOST
// optionally adds one more host (e.g. an S3 bucket or CDN) without a code change.
// These hosts feed both images.remotePatterns and the CSP img-src below.
// ---------------------------------------------------------------------------

const LISTING_IMAGES_HOST = (process.env.NEXT_PUBLIC_LISTING_IMAGES_HOST ?? "")
  .replace(/^https?:\/\//, "")
  .replace(/\/.*$/, "")
  .trim();

const LISTING_IMAGE_ORIGINS = [
  // Firebase Storage download URLs (getDownloadURL)
  "https://firebasestorage.googleapis.com",
  // Firebase Storage public/GCS URLs
  "https://storage.googleapis.com",
  ...(LISTING_IMAGES_HOST ? [`https://${LISTING_IMAGES_HOST}`] : []),
];

const CSP = [
  // Fetch directives
  `default-src 'self'`,

  // Scripts — self + Firebase Auth SDK loaded via the npm bundle (inline
  // is off; any <script> tag in HTML must use a nonce or hash in future).
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com`,

  // Styles — self + inline styles used by Tailwind / shadcn
  `style-src 'self' 'unsafe-inline'`,

  // Images — self + data URIs (Leaflet markers, QR codes) + Stellar wallet icons
  // + remote listing photo hosts (Issue #172)
  `img-src 'self' data: blob: https://stellar.creit.tech https://api.qrserver.com ${LISTING_IMAGE_ORIGINS.join(" ")}`,

  // Fonts — self
  `font-src 'self'`,

  // Connects: API calls + WebSocket subscriptions
  [
    `connect-src 'self'`,
    // Firebase Auth REST API + Cloud Functions
    `https://*.firebaseio.com`,
    `https://*.firebaseapp.com`,
    `https://*.googleapis.com`,
    `https://identitytoolkit.googleapis.com`,
    // Hasura (HTTP + WebSocket)
    `${process.env.NEXT_PUBLIC_HASURA_GRAPHQL_URL ?? ""}`,
    `${
      (process.env.NEXT_PUBLIC_HASURA_GRAPHQL_URL ?? "").replace(
        /^https?:\/\//,
        "wss://",
      )
    }`,
    // TrustlessWork API
    `https://api.trustlesswork.com`,
    `https://dev.api.trustlesswork.com`,
    // Stellar Horizon
    `https://horizon-testnet.stellar.org`,
    `https://horizon.stellar.org`,
    // WalletConnect relay (WebSocket + HTTPS)
    `https://relay.walletconnect.com`,
    `wss://relay.walletconnect.com`,
    `https://verify.walletconnect.com`,
    `https://explorer-api.walletconnect.com`,
    // Wallet extension injected providers communicate via window.postMessage,
    // not via fetch/XHR, so no additional connect-src entry is required.
  ].join(" "),

  // Frame ancestors — prevent clickjacking from any origin
  `frame-ancestors 'none'`,

  // Workers — self only
  `worker-src 'self' blob:`,

  // Object / embed — none
  `object-src 'none'`,

  // Base URI — prevent base-tag injection
  `base-uri 'self'`,

  // Form action — only self (no cross-origin form POSTs)
  `form-action 'self'`,
]
  .join("; ")
  .trim();

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: CSP,
  },
  {
    // Deny embedding in iframes (belt-and-suspenders alongside frame-ancestors CSP)
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    // Prevent MIME-type sniffing
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    // Don't send the full URL as Referer to third-party origins
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    // Enforce HTTPS for 1 year; include sub-domains
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  {
    // Prevent browsers from exposing cross-origin data via Spectre
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin-allow-popups",
  },
  {
    // Controls which browser features / APIs the page may use
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self), payment=()",
  },
];

const nextConfig: NextConfig = {
  images: {
    /**
     * Remote image hosts that next/image is allowed to optimise.
     * Add entries here whenever a new external image source is introduced.
     */
    remotePatterns: [
      {
        // Stellar Wallets Kit — wallet icon fallback images (issue #79 audit)
        protocol: "https",
        hostname: "stellar.creit.tech",
        pathname: "/wallet-icons/**",
      },
      {
        // Firebase Storage download URLs for listing/event photos (issue #172)
        // e.g. https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<path>?alt=media
        protocol: "https",
        hostname: "firebasestorage.googleapis.com",
        pathname: "/v0/b/**",
      },
      {
        // Public Google Cloud Storage URLs for the Firebase bucket (issue #172)
        // e.g. https://storage.googleapis.com/<bucket>/<path>
        protocol: "https",
        hostname: "storage.googleapis.com",
        pathname: "/**",
      },
      // Optional extra listing photo host (S3 bucket / CDN) — issue #172
      ...(LISTING_IMAGES_HOST
        ? [
            {
              protocol: "https" as const,
              hostname: LISTING_IMAGES_HOST,
              pathname: "/**",
            },
          ]
        : []),
    ],
  },

  // ── Security headers (#85) ──────────────────────────────────────────────
  // Applied to every response via the catch-all `/:path*` source.  The CSP
  // is intentionally permissive for now (unsafe-inline / unsafe-eval) while
  // the nonce/hash migration is tracked separately.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },

  // ── Legacy-route redirects ──────────────────────────────────────────────
  // The app was forked from SafeTrust (hospitality/tourism); some inbound
  // links may still reference the old /rent and /guest paths.  Permanent
  // redirects (308) preserve the HTTP method so bookmarked POST flows also
  // land on the correct page.
  async redirects() {
    return [
      {
        source: "/rent/:path*",
        destination: "/listing/:path*",
        permanent: true,
      },
      {
        source: "/guest/:path*",
        destination: "/dashboard/guest/:path*",
        permanent: true,
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  /**
   * Sentry organisation + project — set these in your CI/CD environment or
   * locally in a .env.sentry-build-plugin file (never commit that file).
   *
   * @see https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/#extend-your-nextjs-configuration
   */
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Only upload source maps in CI / production builds to keep local dev fast.
  silent: process.env.CI !== "true",

  // Hides source maps from the browser in production.
  hideSourceMaps: true,

  // Automatically tree-shakes Sentry logger statements in production.
  disableLogger: true,
});
