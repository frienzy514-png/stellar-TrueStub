import type { Metadata } from "next";
import { getEventById } from "@/lib/mockData/events";
import {
  buildListingJsonLd,
  serializeJsonLd,
} from "@/lib/metadata/listing-jsonld";

// Per-listing link-preview metadata — Issue #173
//
// page.tsx is a client component, so generateMetadata lives in this server
// layout instead. Swap getEventById for the Hasura listing query once the
// page is wired to real data.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const listing = getEventById(id);

  const eventDate = new Date(listing.eventDate).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  const title = `${listing.name} — ${listing.section} tickets`;
  const description = `${eventDate} · ${listing.address} · ${listing.price} USDC, held in Stellar escrow until the ticket is transferred.`;
  const images = listing.images[0]
    ? [{ url: listing.images[0], alt: listing.name }]
    : undefined;

  return {
    title,
    description,
    alternates: { canonical: `/rent/${listing.id}` },
    openGraph: {
      type: "website",
      url: `/rent/${listing.id}`,
      title,
      description,
      ...(images && { images }),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(images && { images }),
    },
  };
}

export default async function ListingLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const jsonLd = serializeJsonLd(buildListingJsonLd(getEventById(id)));

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />
      {children}
    </>
  );
}
