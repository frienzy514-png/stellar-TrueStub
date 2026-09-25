/**
 * sitemap.ts — Next.js App Router sitemap.xml generation (Issue #169).
 *
 * Generates static entries for the public-facing pages (home, rent/browse,
 * and individual listing detail pages).  Dynamic listing IDs are read from
 * the same STUB_EVENTS mock-data module that powers the rent/browse page;
 * once a real data layer is wired in, replace the import with an async DB /
 * API fetch and mark the file as `dynamic = "force-dynamic"` if needed.
 *
 * The `NEXT_PUBLIC_APP_URL` env var provides the canonical origin so the
 * generated URLs are correct across staging and production environments.
 * Falls back to localhost:3000 for local development.
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap
 */
import type { MetadataRoute } from "next";
import { STUB_EVENTS } from "@/lib/mockData/events";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  // ── Static public routes ─────────────────────────────────────────────────
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/rent`,
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 0.9,
    },
  ];

  // ── Dynamic listing/event routes ─────────────────────────────────────────
  // Each entry in STUB_EVENTS maps to a public detail page at /rent/[id].
  // When real data replaces the stub, swap this with an async fetch and
  // use actual `updatedAt` timestamps if available.
  const listingRoutes: MetadataRoute.Sitemap = STUB_EVENTS.map((event) => ({
    url: `${baseUrl}/rent/${event.id}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  return [...staticRoutes, ...listingRoutes];
}
