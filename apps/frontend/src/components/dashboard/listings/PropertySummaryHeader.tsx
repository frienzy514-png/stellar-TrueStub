"use client";

import { Home, MapPin, Bed, Bath } from "lucide-react";
import { StarRating } from "@/components/ratings/StarRating";

interface PropertySummaryHeaderProps {
  name: string;
  address: string;
  bedrooms: number;
  bathrooms: number;
  price: number;
  sellerRating?: number;
  sellerReviewCount?: number;
}

export function PropertySummaryHeader({
  name,
  address,
  bedrooms,
  bathrooms,
  price,
  sellerRating = 4.9,
  sellerReviewCount = 24,
}: PropertySummaryHeaderProps) {
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(amount);

  return (
    <div className="rounded-lg border bg-card p-6 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-orange-100 p-3">
            <Home className="h-6 w-6 text-orange-600" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-semibold text-gray-900">{name}</h1>
              {sellerRating && (
                <div className="flex items-center gap-1.5 bg-yellow-500/10 border border-yellow-500/20 px-2 py-0.5 rounded-full text-xs">
                  <StarRating rating={sellerRating} size="sm" />
                  <span className="font-semibold text-yellow-700 dark:text-yellow-400">
                    {sellerRating.toFixed(1)}
                  </span>
                  {sellerReviewCount && (
                    <span className="text-muted-foreground">({sellerReviewCount})</span>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="h-4 w-4" />
              <span className="text-sm">{address}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 rounded-lg bg-orange-50 px-3 py-2">
            <Bed className="h-4 w-4 text-orange-600" />
            <span className="text-sm font-medium text-gray-700">
              {bedrooms} bd
            </span>
          </div>

          <div className="flex items-center gap-2 rounded-lg bg-orange-50 px-3 py-2">
            <Bath className="h-4 w-4 text-orange-600" />
            <span className="text-sm font-medium text-gray-700">
              {bathrooms} ba
            </span>
          </div>

          <div className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2">
            <span className="text-sm font-medium text-gray-500">
              {formatCurrency(price)}
            </span>
            <span className="text-xs text-muted-foreground">Per month</span>
          </div>
        </div>
      </div>
    </div>
  );
}

