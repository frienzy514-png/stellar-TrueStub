"use client";

import type { EventListing } from "@/types/event";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { AiOutlineHeart } from "react-icons/ai";
import { FaFireAlt } from "react-icons/fa";
import ListingFeatureIcons from "./ListingFeatureIcons";
import { formatListingPrice } from "./formatListingPrice";

interface ListingCardProps {
  listing: EventListing;
  onClick?: () => void;
}

export default function ListingCard({
  listing,
  onClick,
}: ListingCardProps) {
  return (
    <div
      onClick={onClick}
      className="group w-full overflow-hidden rounded-[16px] border dark:border-slate-700 bg-white dark:bg-slate-800 text-left transition hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(0,0,0,0.08)]"
    >
      <div className="relative">
        <Image
          src={listing.images[0]}
          alt={listing.name}
          width={420}
          height={280}
          className="h-[170px] w-full object-cover"
        />
        {listing.promoted ? (
          <span className="absolute bottom-0 left-0 inline-flex items-center gap-1 rounded-tr-[10px] bg-orange-500 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.02em] text-white">
            <FaFireAlt className="h-3.5 w-3.5" />
            Promoted
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col px-4 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-end gap-2">
            <span className="text-[30px] font-semibold leading-none text-green-600">
              {formatListingPrice(listing.price)}
            </span>
            <span className="pb-1 text-xs text-gray-500">Per month</span>
          </div>
          <AiOutlineHeart
            className={cn(
              "h-5 w-5",
              listing.favorite
                ? 'fill-red-500 text-red-500'
                : 'text-red-500'
            )}
          />
        </div>

        <div className="space-y-1">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
            {listing.name}
          </h3>
          <p className="line-clamp-1 text-xs text-gray-500">
            {listing.address}
          </p>
        </div>

        {/* Fixed-height amenities zone keeps Book button aligned across all cards */}
        <div className="mt-3 min-h-[56px]">
          <ListingFeatureIcons
            seatCount={listing.seatCount}
            rowCount={listing.rowCount}
            mobileTransfer={listing.mobileTransfer}
            compact
          />
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
          }}
          className="mt-auto w-full rounded-lg bg-orange-500 py-2 px-4 text-sm font-semibold text-white transition-colors duration-200 hover:bg-orange-600"
        >
          Book
        </button>
      </div>
    </div>
  );
}

