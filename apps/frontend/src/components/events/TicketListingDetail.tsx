'use client';

import type { EventListing } from '@/types/event';
import Image from 'next/image';
import { FaMapMarkerAlt } from 'react-icons/fa';
import ListingFeatureIcons from './ListingFeatureIcons';
import { formatListingPrice } from './formatListingPrice';
import EventImageGallery from './EventImageGallery';

interface TicketListingDetailProps {
  listing: EventListing;
  onBook: () => void;
}

export default function TicketListingDetail({
  listing,
  onBook,
}: TicketListingDetailProps) {
  return (
    <section className="flex-1 px-6 py-8 lg:px-10">
      <EventImageGallery
        images={listing.images}
        promoted={listing.promoted}
        altText={listing.name}
      />

      <div className="mt-8 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex-1">
          <h1 className="text-[34px] font-semibold tracking-[-0.04em] text-[#181818]">
            {listing.name}
          </h1>

          <div className="mt-5 flex items-center gap-3 text-sm text-[#717171]">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-[#fff1e7] text-[#ff6a00]">
              <FaMapMarkerAlt className="h-4 w-4" />
            </span>
            <span>{listing.address}</span>
          </div>

          <div className="mt-8">
            <ListingFeatureIcons
              seatCount={listing.seatCount}
              rowCount={listing.rowCount}
              mobileTransfer={listing.mobileTransfer}
            />
          </div>
        </div>

        <div className="w-full rounded-[12px] lg:max-w-[210px]">
          <button
            type="button"
            onClick={onBook}
            className="w-full rounded-[8px] bg-[#ff6a00] px-6 py-4 text-xl font-semibold text-white transition hover:bg-[#ec6200]"
          >
            BOOK
          </button>
          <div className="mt-4 flex items-end gap-2">
            <span className="text-[34px] font-semibold leading-none text-[#10a156]">
              {formatListingPrice(listing.price)}
            </span>
            <span className="pb-1 text-sm text-[#808080]">Per month</span>
          </div>

          <div className="mt-8 flex items-center justify-end gap-3">
            <span className="text-sm font-medium text-[#5a5a5a]">
              {listing.owner.name}
            </span>
            <Image
              src={listing.owner.avatar}
              alt={listing.owner.name}
              width={34}
              height={34}
              className="h-[34px] w-[34px] rounded-full object-cover"
            />
          </div>
        </div>
      </div>

      <div className="mt-10 max-w-[760px]">
        <h2 className="text-[22px] font-semibold text-[#1b1b1b]">
          Apartment details
        </h2>
        <p className="mt-4 text-sm leading-6 text-[#6d6d6d]">
          {listing.description}
        </p>
      </div>
    </section>
  );
}
