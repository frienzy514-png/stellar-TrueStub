"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
// import { useSuspenseQuery } from "@apollo/client";
import { ArrowLeft, MapPin, Tag, BadgeCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InterestedPeopleTable } from "@/components/dashboard/listings/InterestedPeopleTable";
// TODO: Uncomment after running `npm run codegen` with Hasura running
// import {
//   GET_TICKET_LISTING_BY_ID,
//   GET_LISTING_OFFERS,
// } from "@/graphql/queries/ticket-listing-queries";
import type { ListingOffer } from "@/components/dashboard/listings/InterestedPeopleTable";

export default function InterestedPeoplePage() {
  const params = useParams();
  const router = useRouter();
  const listingId = Number(params.id);

  // TODO: Replace with actual GraphQL queries once codegen is run
  // const { data: listingData } = useSuspenseQuery(GET_TICKET_LISTING_BY_ID, {
  //   variables: { id: listingId },
  // });
  // const { data: offersData } = useSuspenseQuery(GET_LISTING_OFFERS, {
  //   variables: { listing_id: listingId, order_by: [{ offer_date: "desc" }] },
  // });

  // Temporary stub data until GraphQL is set up
  const listingData = {
    ticket_listings_by_pk: {
      id: listingId,
      name: "Coldplay — West Floor",
      location: "San José",
      address: "329 Calle Santos, Paseo Colón, San José",
      is_available: true,
      warranty_deposit: 2400,
      price: 1200.0,
      status: "available",
      promoted: true,
    },
  };

  const offersData = {
    listing_offers: Array(10)
      .fill(null)
      .map((_, i) => ({
        id: i + 1,
        buyer_name: "Diego Duarte Fernández",
        buyer_phone: "+506 6483252",
        buyer_wallet_address: "XR6...32D",
        offer_date: new Date(2024, 8, 12 + i).toISOString(),
        bid_status: i === 1 ? "accepted" : i === 5 ? "rejected" : "pending",
      })),
    listing_offers_aggregate: { aggregate: { count: 10 } },
  };

  const listingLoading = false;
  const offersLoading = false;
  const listingError = null;
  const offersError = null;

  const listing = listingData?.ticket_listings_by_pk;
  const offers = offersData?.listing_offers || [];
  const totalCount =
    offersData?.listing_offers_aggregate?.aggregate?.count || 0;

  // Handle invalid listing ID
  useEffect(() => {
    if (!listingId || isNaN(listingId)) {
      router.push("/dashboard/listings");
    }
  }, [listingId, router]);

  // Handle listing not found
  useEffect(() => {
    if (!listingLoading && !listing && !listingError) {
      router.push("/dashboard/listings");
    }
  }, [listing, listingLoading, listingError, router]);

  if (listingLoading || offersLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (listingError || offersError) {
    return (
      <div className="space-y-6">
        <Button
          variant="ghost"
          onClick={() => router.push("/dashboard/listings")}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to listings
        </Button>
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6">
          <p className="text-destructive">
            Error loading data. Please try again later.
          </p>
        </div>
      </div>
    );
  }

  if (!listing) {
    return null;
  }

  const mappedOffers: ListingOffer[] = offers.map((offer: any) => ({
    id: offer.id,
    buyer_id: offer.buyer_id ?? null,
    buyer_name: offer.buyer_name,
    buyer_phone: offer.buyer_phone,
    buyer_wallet_address: offer.buyer_wallet_address,
    offer_date: offer.offer_date,
    bid_status: offer.bid_status,
  }));

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(amount);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          onClick={() => router.push("/dashboard/listings")}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <h2 className="text-lg font-medium text-muted-foreground">
          Interested people
        </h2>
      </div>

      <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-2xl font-semibold text-gray-900 dark:text-white">
              <span className="text-orange-500">🔥</span>
              {listing.name}
              <span className="font-normal text-gray-500 dark:text-gray-400">
                · Interested people
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
              <span className="flex items-center gap-1">
                <MapPin className="h-4 w-4 text-orange-500" />
                {listing.address || listing.location}
              </span>
              <span className="flex items-center gap-1">
                <BadgeCheck className="h-4 w-4 text-orange-500" />
                {listing.is_available ? "Available" : "Sold"}
              </span>
              <span className="flex items-center gap-1">
                <Tag className="h-4 w-4 text-orange-500" />
                {formatCurrency(listing.warranty_deposit)} deposit
              </span>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-2xl font-bold text-orange-500">
              {formatCurrency(listing.price)}
            </p>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Resale price
            </p>
          </div>
        </div>
      </div>

      <InterestedPeopleTable
        offers={mappedOffers}
        totalCount={totalCount}
        isLoading={offersLoading}
      />
    </div>
  );
}
