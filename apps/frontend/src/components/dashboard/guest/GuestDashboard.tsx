"use client";

import type { EventListing } from "@/types/event";
import TicketListingGrid from "@/components/events/TicketListingGrid";
import SectionTabs from "@/components/events/SectionTabs";
import ListingFilterSidebar from "@/components/events/ListingFilterSidebar";
import { STUB_EVENTS } from "@/lib/mockData/events";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BsSortDownAlt } from "react-icons/bs";
import GuestPurchasesSummary from "./GuestPurchasesSummary";
import { ErrorBoundaryWithCache } from "@/components/performance/ErrorBoundaryWithCache";

/** Compact fallback shown when a guest dashboard section throws. */
function SimpleErrorFallback({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center p-6 rounded-xl border border-red-500/20 bg-red-50 text-center">
      <p className="text-sm text-red-600">
        Failed to load <span className="font-semibold">{label}</span>. Please refresh the page.
      </p>
    </div>
  );
}

export default function GuestDashboard() {
  const router = useRouter();
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [selectedBedrooms, setSelectedBedrooms] = useState<string>("all");
  const PRICES = STUB_EVENTS.map((a) => a.price);
  const [minPrice, setMinPrice] = useState<number>(Math.min(...PRICES));
  const [maxPrice, setMaxPrice] = useState<number>(Math.max(...PRICES));

  const onCategoryToggle = (category: string) => {
    setSelectedCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category],
    );
  };

  const onLocationToggle = (location: string) => {
    setSelectedLocations((prev) =>
      prev.includes(location)
        ? prev.filter((l) => l !== location)
        : [...prev, location],
    );
  };

  const handleApartmentClick = (listing: EventListing) => {
    router.push(`/rent/${listing.id}`);
  };

  // Derived filtered state
  const filteredListings = STUB_EVENTS.filter((apt) => {
    // Category filter
    if (
      selectedCategories.length > 0 &&
      !selectedCategories.includes(apt.category)
    ) {
      return false;
    }
    // Location filter
    if (
      selectedLocations.length > 0 &&
      !selectedLocations.includes(apt.location)
    ) {
      return false;
    }
    // Bedroom filter (tabs: all | 1 | 2 | 3+)
    if (selectedBedrooms !== "all") {
      const target = Number(selectedBedrooms);
      if (selectedBedrooms === "3") {
        if (apt.seatCount < 3) return false;
      } else if (apt.seatCount !== target) {
        return false;
      }
    }
    // Price filter
    if (apt.price < minPrice || apt.price > maxPrice) {
      return false;
    }
    return true;
  });

  return (
    <div className="flex flex-col lg:flex-row w-full max-w-[1400px] mx-auto bg-white rounded-[20px] overflow-hidden border border-[#e8e1da] shadow-sm mt-6">
      {/* Sidebar */}
      <ListingFilterSidebar
        selectedCategories={selectedCategories}
        selectedLocations={selectedLocations}
        minPrice={minPrice}
        maxPrice={maxPrice}
        onCategoryToggle={onCategoryToggle}
        onLocationToggle={onLocationToggle}
        onMinPriceChange={setMinPrice}
        onMaxPriceChange={setMaxPrice}
      />

      {/* Main Content */}
      <main className="flex-1 flex flex-col gap-8 p-6 md:p-10">
        <div>
          <h1 className="text-[28px]  text-[#1d1d1d] mb-1">
            Available for rent in{" "}
            <span className="font-bold">Costa Rica, San José</span>
          </h1>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <p className="text-[#8a8a8a] text-sm">
              {filteredListings.length} units available
            </p>
            <div className="flex items-center text-sm font-medium">
              <span className="text-[#8a8a8a] mr-2 flex items-center gap-1">
                <BsSortDownAlt className="h-4 w-4" />
                Sort by:
              </span>
              <span className="text-[#ff6a00] cursor-pointer flex items-center gap-1">
                Relevance
                <svg
                  width="10"
                  height="6"
                  viewBox="0 0 10 6"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M1 1L5 5L9 1"
                    stroke="#FF6A00"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </div>
          </div>
        </div>

        <SectionTabs
          selected={selectedBedrooms}
          onSelect={setSelectedBedrooms}
        />

        <ErrorBoundaryWithCache fallback={<SimpleErrorFallback label="Ticket Listings" />}>
          <TicketListingGrid
            listings={filteredListings}
            onApartmentClick={handleApartmentClick}
          />
        </ErrorBoundaryWithCache>

        <div className="mt-6">
          <ErrorBoundaryWithCache fallback={<SimpleErrorFallback label="My Purchases" />}>
            <GuestPurchasesSummary />
          </ErrorBoundaryWithCache>
        </div>
      </main>
    </div>
  );
}
