"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@apollo/client/react";
import { Heart, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import  EventHeader from "@/components/events/EventHeader";
import { useFavorites } from "@/hooks/useFavorites";
import {
  GET_AVAILABLE_TICKET_LISTINGS,
  formatListingAddress,
  type TicketListingRow,
} from "@/graphql/queries/ticket-listing-queries";

const FALLBACK_IMAGE = "/img/room1.png";

function listingImages(listing: TicketListingRow): string[] {
  return listing.image_urls?.length ? listing.image_urls : [FALLBACK_IMAGE];
}


export default function GuestSuggestionsPage() {
  const router = useRouter();
  const { data, loading, error } = useQuery<{ apartments: TicketListingRow[] }>(
    GET_AVAILABLE_TICKET_LISTINGS,
  );
  const listings = data?.apartments ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { isFavorite, toggleFavorite } = useFavorites();

  const selected =
    listings.find((listing) => listing.id === selectedId) ?? listings[0];
// TODO: replace with Apollo query → public.ticket_listings (Hasura)
// Reference: dApp/apps/frontend/src/app/dashboard/guest/page.tsx
const STUB_LISTINGS = [
  {
    id: "1",
    name: "Coldplay: Music of the Spheres",
    address: "Estadio Nacional, La Sabana, San José",
    price: 1200,
    deposit: 2400,
    beds: 2,
    baths: 1,
    petFriendly: true,
    isPromoted: true,
    description:
      "West Floor, Row 12 — two seats together, verified transfer via escrow",
    images: [
      "/img/room1.png",
      "/img/room2.png",
      "/img/room3.png",
      "/img/room4.png",
    ],
  },
  {
    id: "2",
    name: "Costa Rica vs. Mexico",
    address: "Estadio Nacional, La Sabana, San José",
    price: 950,
    deposit: 1900,
    beds: 2,
    baths: 1,
    petFriendly: true,
    isPromoted: false,
    description:
      "East Stand, Row 18 — great sightline to midfield, verified transfer via escrow",
    images: [
      "/img/room2.png",
      "/img/room1.png",
      "/img/room3.png",
      "/img/room4.png",
    ],
  },
];

export default function GuestSuggestionsPage() {
  const [selectedId, setSelectedId] = useState(STUB_LISTINGS[0].id);
  const [favorites, setFavorites] = useState<string[]>([]);

  const selected = STUB_LISTINGS.find((l) => l.id === selectedId)!;

  if (loading || error || !selected) {
    return (
      <div className="min-h-screen bg-white dark:bg-slate-900
                      text-gray-900 dark:text-white">
        <EventHeader showHostSwitch />
        <div className="mx-auto max-w-[1280px] px-4 py-16 text-center
                        text-gray-500 dark:text-gray-400">
          {loading
            ? "Loading listings..."
            : error
              ? "Could not load listings. Please try again later."
              : "No listings are available right now."}
          {!loading && (
            <div className="mt-4">
              <Link
                href="/rent"
                className="text-sm text-orange-500 hover:text-orange-600 font-medium"
              >
                Browse all →
              </Link>
            </div>
          )}
        </div>
      </div>
    );
  }

  const selectedImages = listingImages(selected);

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900
                    text-gray-900 dark:text-white">
      {/* Standalone header */}
      <EventHeader showHostSwitch />

      <div className="mx-auto max-w-[1280px] px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_220px] gap-6">

          {/* ── Left: Suggestions sidebar ── */}
          <aside className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                Suggestions
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {listings.length} listings available
                {STUB_LISTINGS.length} listings available
              </p>
              <Link
                href="/rent"
                className="text-sm text-orange-500 hover:text-orange-600
                           font-medium"
              >
                Browse all →
              </Link>
            </div>

            <div className="space-y-3">
              {listings.map((apt) => (
              {STUB_LISTINGS.map((listing) => (
                <button
                  key={listing.id}
                  type="button"
                  onClick={() => setSelectedId(listing.id)}
                  className={cn(
                    "w-full text-left rounded-xl border p-3",
                    "flex items-start gap-3 transition-colors",
                    selected.id === apt.id
                    selectedId === listing.id
                      ? "border-orange-400 bg-orange-50 dark:bg-orange-900/10"
                      : "border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800",
                  )}
                >
                  {/* Thumbnail */}
                  <div className="relative w-16 h-16 rounded-lg
                                  overflow-hidden shrink-0 bg-gray-200
                                  dark:bg-slate-700">
                    <Image
                      src={listingImages(apt)[0]}
                      alt={apt.name}
                      src={listing.images[0]}
                      alt={listing.name}
                      fill
                      unoptimized
                      className="object-cover"
                      sizes="64px"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-start justify-between gap-1">
                      <p className="text-sm font-semibold
                                    text-gray-900 dark:text-white
                                    line-clamp-2 leading-tight">
                        {listing.name}
                      </p>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(listing.id);
                        }}
                        className="shrink-0 mt-0.5"
                      >
                        <Heart
                          className={cn(
                            "h-4 w-4 transition-colors",
                            isFavorite(apt.id)
                            favorites.includes(listing.id)
                              ? "fill-red-500 text-red-500"
                              : "text-gray-300 hover:text-red-400",
                          )}
                        />
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400
                                  truncate">
                      {formatListingAddress(apt.address)}
                    </p>
                    <div className="flex items-center gap-2
                                    text-xs text-gray-400 dark:text-gray-500">
                      {listing.address}
                    </p>
                    <div className="flex items-center gap-2
                                    text-xs text-gray-400 dark:text-gray-500">
                      <span>{listing.beds}bd</span>
                      <span>·</span>
                      {listing.petFriendly && (
                        <>
                          <span>pet friendly</span>
                          <span>·</span>
                        </>
                      )}
                      <span>{listing.baths} ba</span>
                      <span
                        className="ml-auto font-bold text-green-600
                                   dark:text-green-400"
                      >
                        ${listing.price.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </aside>

          {/* ── Center: Main image + details ── */}
          <main className="space-y-4">
            {/* Main image */}
            <div className="relative w-full rounded-2xl overflow-hidden
                            bg-gray-200 dark:bg-slate-700"
                 style={{ height: "340px" }}>
              <Image
                src={selectedImages[0]}
                alt={selected.name}
                fill
                unoptimized
                className="object-cover"
                sizes="(max-width: 1280px) 60vw, 700px"
                priority
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            </div>

            {/* Listing details */}
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-4">
                <h1 className="text-2xl font-bold text-gray-900
                               dark:text-white leading-tight">
                  {selected.name}
                </h1>
                <div className="text-right shrink-0">
                  <p className="text-xl font-bold text-orange-500">
                    ${selected.price.toLocaleString()}.00
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Deposit: ${selected.warranty_deposit.toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5
                              text-sm text-gray-500 dark:text-gray-400">
                <MapPin className="h-4 w-4 text-orange-500 shrink-0" />
                {formatListingAddress(selected.address)}
              </div>

              <div className="space-y-1">
                <p className="text-sm font-semibold
                               text-gray-900 dark:text-white">
                  Listing details
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400
                               leading-relaxed">
                  {selected.description}
                </p>
              </div>

              <button
                onClick={() => router.push(`/rent/${selected.id}/escrow/create`)}
                className="rounded-xl bg-orange-500 hover:bg-orange-600
                           active:bg-orange-700 text-white font-bold
                           uppercase tracking-wide px-8 py-3
                           transition-colors duration-200 shadow-md"
              >
                Buy
              </button>
            </div>
          </main>

          {/* ── Right: Thumbnail stack ── */}
          <div className="hidden lg:flex flex-col gap-3">
            {selectedImages.slice(1, 4).map((src, i) => (
              <div
                key={i}
                className="relative w-full rounded-xl overflow-hidden
                           bg-gray-200 dark:bg-slate-700"
                style={{ height: "120px" }}
              >
                <Image
                  src={src}
                  alt={`${selected.name} photo ${i + 2}`}
                  fill
                  className="object-cover hover:scale-105 transition-transform
                             duration-300 cursor-pointer"
                  sizes="220px"
                  unoptimized
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}