"use client";

import { StarRating } from "./StarRating";
import { Badge } from "@/components/ui/badge";
import { User, MessageSquare } from "lucide-react";
import type { Review } from "@/types/ratings";

interface ReviewsListProps {
  reviews?: Review[];
  title?: string;
  emptyMessage?: string;
}

const STUB_REVIEWS: Review[] = [
  {
    id: "rev-1",
    escrow_id: "escrow-101",
    reviewer_id: "usr-201",
    reviewer_name: "Alice Cooper",
    reviewee_id: "usr-100",
    rating: 5,
    comment: "Super fast ticket transfer! Funds released smoothly through escrow with zero hassle.",
    role: "buyer",
    created_at: "2025-02-14T15:30:00Z",
  },
  {
    id: "rev-2",
    escrow_id: "escrow-102",
    reviewer_id: "usr-202",
    reviewer_name: "Carlos Mendez",
    reviewee_id: "usr-100",
    rating: 5,
    comment: "Great buyer! Prompt payment into the escrow contract and verified ticket receipt immediately.",
    role: "seller",
    created_at: "2025-02-08T10:15:00Z",
  },
  {
    id: "rev-3",
    escrow_id: "escrow-103",
    reviewer_id: "usr-203",
    reviewer_name: "Emma Watson",
    reviewee_id: "usr-100",
    rating: 4,
    comment: "Everything went fine, smooth transaction on Stellar.",
    role: "buyer",
    created_at: "2025-01-28T18:45:00Z",
  },
];

export function ReviewsList({
  reviews = STUB_REVIEWS,
  title = "Recent Reviews & Feedback",
  emptyMessage = "No reviews yet.",
}: ReviewsListProps) {
  const items = reviews.length > 0 ? reviews : STUB_REVIEWS;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {title} ({items.length})
        </h4>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-6 text-sm text-muted-foreground bg-muted/20 rounded-xl border border-dashed">
          <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-40" />
          {emptyMessage}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((review) => (
            <div
              key={review.id}
              className="p-4 rounded-xl border bg-card/60 hover:bg-card transition-colors space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <span className="font-medium text-sm text-foreground">
                      {review.reviewer_name || "Verified Trader"}
                    </span>
                    <Badge variant="secondary" className="ml-2 text-[10px] capitalize font-normal">
                      {review.role}
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StarRating rating={review.rating} size="sm" />
                  <span className="text-xs text-muted-foreground hidden sm:inline">
                    {new Date(review.created_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </div>
              </div>

              {review.comment && (
                <p className="text-sm text-muted-foreground pl-9 leading-relaxed">
                  &ldquo;{review.comment}&rdquo;
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
