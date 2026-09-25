// Shared site-level metadata values — Issue #173
//
// NEXT_PUBLIC_SITE_URL must be the public origin (e.g. https://truestub.app)
// in production so Open Graph / Twitter image URLs resolve to absolute URLs
// that social crawlers can fetch.

export const SITE_NAME = "TrueStub";

export const SITE_DESCRIPTION =
  "Trustless escrow for peer-to-peer ticket resale, built on the Stellar blockchain.";

export const SITE_URL = new URL(
  process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000"),
);

// Brand colours taken from public/favicon.svg / public/img/logo.png.
export const BRAND_THEME_COLOR = "#2563eb";
export const BRAND_BACKGROUND_COLOR = "#ffffff";
