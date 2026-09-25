/**
 * robots.ts — Next.js App Router robots.txt generation (Issue #169).
 *
 * Allows crawlers on all public-facing listing/event pages while blocking
 * authenticated-only sections (/dashboard/*) and internal API routes (/api/*).
 *
 * The `NEXT_PUBLIC_APP_URL` env var is used as the canonical host so the
 * generated Sitemap URL in the robots header is correct for every environment.
 * Falls back to localhost:3000 if the variable is not set (local dev).
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots
 */
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",        // home / landing
          "/rent",    // public ticket-listing browse page
          "/listing", // individual ticket-listing detail
        ],
        disallow: [
          "/dashboard/", // authenticated-only area
          "/api/",        // internal API routes
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
