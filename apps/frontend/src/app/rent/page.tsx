"use client";

import type { EventListing } from "@/types/event";
import { TicketListingGrid, SectionTabs, ListingFilterSidebar, EventHeader } from "@/components/events";
import { STUB_EVENTS } from "@/lib/mockData/events";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

type SortOption = "relevance" | "price-low" | "price-high";

/** Maps SectionTabs filter values to keywords found in EventListing.section */
const SECTION_KEYWORDS: Record<string, string[]> = {
  "1": ["floor", "floor"],          // Floor
  "2": ["stand", "lower", "bowl"],  // Lower bowl / stand
  "3": ["balcony", "upper", "orchestra"], // Upper bowl / balcony / orchestra
};

function sectionMatches(listingSection: string, filterValue: string): boolean {
  if (filterValue === "all") return true;
  const keywords = SECTION_KEYWORDS[filterValue] ?? [];
  const lower = listingSection.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

export default function EventListingPage() {
  const router = useRouter();

  // Search
  const [searchQuery, setSearchQuery] = useState("");

  // Category filter (ticket-resale categories: Concerts, Sports, Theater)
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  // Section tier filter (wired to SectionTabs)
  const [selectedSectionTab, setSelectedSectionTab] = useState<string>("all");

  // Sidebar section type multi-select
  const [selectedSections, setSelectedSections] = useState<string[]>([]);

  // Date range filter
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Price range (USDC)
  const [minPrice, setMinPrice] = useState<number>(0);
  const [maxPrice, setMaxPrice] = useState<number>(1000);

  // Sort
  const [sortOption, setSortOption] = useState<SortOption>("relevance");

  const filteredListings = useMemo(() => {
    const listings = STUB_EVENTS.filter((listing) => {
      // Event name search
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        if (!listing.name.toLowerCase().includes(query)) return false;
      }

      // Category
      if (
        selectedCategories.length > 0 &&
        !selectedCategories.includes(listing.category)
      ) {
        return false;
      }

      // Section tier (SectionTabs)
      if (selectedSectionTab !== "all" && !sectionMatches(listing.section, selectedSectionTab)) {
        return false;
      }

      // Sidebar section multi-select
      if (selectedSections.length > 0) {
        const matchesAny = selectedSections.some((sv) =>
          sectionMatches(listing.section, sv)
        );
        if (!matchesAny) return false;
      }

      // Date range
      if (dateFrom) {
        if (new Date(listing.eventDate) < new Date(dateFrom)) return false;
      }
      if (dateTo) {
        // include the whole dateTo day
        const end = new Date(dateTo);
        end.setDate(end.getDate() + 1);
        if (new Date(listing.eventDate) >= end) return false;
      }

      // Price (USDC)
      if (listing.price < minPrice || listing.price > maxPrice) return false;

      return true;
    });

    if (sortOption === "price-low") {
      return [...listings].sort((a, b) => a.price - b.price);
    }
    if (sortOption === "price-high") {
      return [...listings].sort((a, b) => b.price - a.price);
    }
    // Default: promoted first
    return [...listings].sort(
      (a, b) => Number(b.promoted) - Number(a.promoted)
    );
  }, [
    searchQuery,
    selectedCategories,
    selectedSectionTab,
    selectedSections,
    dateFrom,
    dateTo,
    minPrice,
    maxPrice,
    sortOption,
  ]);

  const toggleValue = (values: string[], value: string) =>
    values.includes(value)
      ? values.filter((v) => v !== value)
      : [...values, value];

  const handleListingClick = (listing: EventListing) => {
    router.push(`/rent/${listing.id}`);
  };

  const activeFilterCount =
    (searchQuery.trim() ? 1 : 0) +
    selectedCategories.length +
    (selectedSectionTab !== "all" ? 1 : 0) +
    selectedSections.length +
    (dateFrom ? 1 : 0) +
    (dateTo ? 1 : 0) +
    (minPrice > 0 ? 1 : 0) +
    (maxPrice < 1000 ? 1 : 0) +
    (sortOption !== "relevance" ? 1 : 0);

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900 text-gray-900 dark:text-white">
      <EventHeader />

      <div className="mx-auto flex max-w-[1180px] flex-col lg:flex-row">
        <ListingFilterSidebar
          searchQuery={searchQuery}
          selectedCategories={selectedCategories}
          selectedSections={selectedSections}
          dateFrom={dateFrom}
          dateTo={dateTo}
          minPrice={minPrice}
          maxPrice={maxPrice}
          onSearchChange={setSearchQuery}
          onCategoryToggle={(category) =>
            setSelectedCategories((prev) => toggleValue(prev, category))
          }
          onSectionToggle={(section) =>
            setSelectedSections((prev) => toggleValue(prev, section))
          }
          onDateFromChange={setDateFrom}
          onDateToChange={setDateTo}
          onMinPriceChange={setMinPrice}
          onMaxPriceChange={setMaxPrice}
        />

        <main className="flex-1 px-6 py-8 lg:px-12">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h1 className="text-[24px] leading-tight text-gray-900 dark:text-white sm:text-[30px]">
                Tickets available
              </h1>
              <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                {filteredListings.length} listing
                {filteredListings.length !== 1 ? "s" : ""} found
              </p>
            </div>

            {/* Sort & extra filter popover */}
            <Popover>
              <PopoverTrigger asChild>
                <button
                  className="relative flex items-center gap-2 text-sm
                             border border-gray-200 dark:border-slate-700
                             rounded-lg px-3 py-2 hover:bg-gray-50
                             dark:hover:bg-slate-800 transition-colors
                             text-gray-700 dark:text-gray-300"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  <span>Sort & Filter</span>
                  {activeFilterCount > 0 && (
                    <span
                      className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center
                                 justify-center rounded-full bg-orange-500 text-[10px]
                                 font-bold text-white"
                    >
                      {activeFilterCount}
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-72 p-4 space-y-4 max-h-[85vh] overflow-y-auto
                           bg-white dark:bg-slate-800
                           border border-gray-200 dark:border-slate-700"
              >
                {/* Sort */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Sort by
                  </p>
                  {(
                    [
                      { label: "Relevance", value: "relevance" },
                      { label: "Price: Low to High", value: "price-low" },
                      { label: "Price: High to Low", value: "price-high" },
                    ] as { label: string; value: SortOption }[]
                  ).map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setSortOption(opt.value)}
                      className={cn(
                        "w-full text-left text-sm px-3 py-2 rounded-lg transition-colors",
                        sortOption === opt.value
                          ? "bg-orange-500 text-white"
                          : "hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-300"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                <hr className="border-gray-100 dark:border-slate-700" />

                {/* Category */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Category
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setSelectedCategories([])}
                      className={cn(
                        "text-xs px-3 py-1.5 rounded-full border transition-colors",
                        selectedCategories.length === 0
                          ? "bg-orange-500 border-orange-500 text-white"
                          : "border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-300"
                      )}
                    >
                      All
                    </button>
                    {(["Concerts", "Sports", "Theater"] as const).map((cat) => (
                      <button
                        key={cat}
                        onClick={() =>
                          setSelectedCategories((prev) => toggleValue(prev, cat))
                        }
                        className={cn(
                          "text-xs px-3 py-1.5 rounded-full border transition-colors",
                          selectedCategories.includes(cat)
                            ? "bg-orange-500 border-orange-500 text-white"
                            : "border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-300"
                        )}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                <hr className="border-gray-100 dark:border-slate-700" />

                {/* Date range */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Event Date Range
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 dark:border-slate-600
                                 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm
                                 text-gray-700 dark:text-gray-300"
                    />
                    <span className="text-gray-400 shrink-0">—</span>
                    <input
                      type="date"
                      value={dateTo}
                      min={dateFrom}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 dark:border-slate-600
                                 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm
                                 text-gray-700 dark:text-gray-300"
                    />
                  </div>
                </div>

                <hr className="border-gray-100 dark:border-slate-700" />

                {/* Price range */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Price Range (USDC)
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      placeholder="Min"
                      value={minPrice}
                      min={0}
                      onChange={(e) => setMinPrice(Number(e.target.value))}
                      className="w-full rounded-lg border border-gray-200 dark:border-slate-600
                                 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm
                                 text-gray-700 dark:text-gray-300"
                    />
                    <span className="text-gray-400">—</span>
                    <input
                      type="number"
                      placeholder="Max"
                      value={maxPrice}
                      min={0}
                      onChange={(e) => setMaxPrice(Number(e.target.value))}
                      className="w-full rounded-lg border border-gray-200 dark:border-slate-600
                                 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm
                                 text-gray-700 dark:text-gray-300"
                    />
                  </div>
                </div>

                <hr className="border-gray-100 dark:border-slate-700" />

                {/* Reset */}
                <button
                  onClick={() => {
                    setSortOption("relevance");
                    setSelectedCategories([]);
                    setSelectedSectionTab("all");
                    setSelectedSections([]);
                    setDateFrom("");
                    setDateTo("");
                    setSearchQuery("");
                    setMinPrice(0);
                    setMaxPrice(1000);
                  }}
                  className="w-full text-sm text-center text-orange-500 hover:text-orange-600 font-medium"
                >
                  Reset all filters
                </button>
              </PopoverContent>
            </Popover>
          </div>

          {/* Section tier tabs */}
          <div className="mt-6">
            <SectionTabs selected={selectedSectionTab} onSelect={setSelectedSectionTab} />
          </div>

          <div className="mt-8">
            {filteredListings.length === 0 ? (
              <div className="py-16 text-center text-gray-500 dark:text-gray-400">
                <p className="text-lg font-medium">No tickets match your filters.</p>
                <p className="mt-2 text-sm">Try adjusting your search or date range.</p>
              </div>
            ) : (
              <TicketListingGrid
                listings={filteredListings}
                onApartmentClick={handleListingClick}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
