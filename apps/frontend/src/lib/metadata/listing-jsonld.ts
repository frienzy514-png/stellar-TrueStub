import type { EventListing } from "@/types/event";
import { SITE_URL } from "./site";

// schema.org/Event structured data for a ticket listing (JSON-LD).
// Google requires name, startDate and location for Event rich results;
// offers describes the resale ticket. Prices are USDC, ~1:1 with USD, which
// is the closest ISO 4217 code Google accepts.

export function buildListingJsonLd(listing: EventListing) {
  const url = new URL(`/rent/${listing.id}`, SITE_URL).toString();
  const images = listing.images.map((src) => new URL(src, SITE_URL).toString());

  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: listing.name,
    description: listing.description,
    startDate: listing.eventDate,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: {
      "@type": "Place",
      name: listing.address,
      address: listing.address,
    },
    ...(images.length > 0 && { image: images }),
    offers: {
      "@type": "Offer",
      url,
      price: listing.price,
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      itemOffered: {
        "@type": "Product",
        name: `${listing.name} — ${listing.section}, ${listing.seat}`,
      },
    },
  };
}

/** Serialises JSON-LD for a <script> tag, escaping `<` so data can't close it. */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
