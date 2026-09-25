"use client";

import { StarRating } from "./StarRating";
import { ShieldCheck, ThumbsUp, Award } from "lucide-react";
import type { UserReputationSummary as ReputationSummaryType } from "@/types/ratings";

interface UserReputationSummaryProps {
  reputation?: ReputationSummaryType;
  compact?: boolean;
}

export function UserReputationSummary({
  reputation,
  compact = false,
}: UserReputationSummaryProps) {
  const rep: ReputationSummaryType = reputation || {
    user_id: "default",
    total_reviews: 28,
    average_rating: 4.9,
    five_star_count: 25,
    four_star_count: 3,
    three_star_count: 0,
    two_star_count: 0,
    one_star_count: 0,
    positive_percentage: 100,
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/20 px-2.5 py-1 rounded-full text-xs">
        <StarRating rating={rep.average_rating} size="sm" />
        <span className="font-semibold text-yellow-700 dark:text-yellow-400">
          {rep.average_rating.toFixed(1)}
        </span>
        <span className="text-muted-foreground">({rep.total_reviews})</span>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between border-b pb-3">
        <div className="flex items-center gap-2">
          <Award className="h-5 w-5 text-yellow-500" />
          <h3 className="text-base font-semibold text-foreground">Reputation & Trust Score</h3>
        </div>
        <div className="flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full">
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>Verified Trader</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center sm:text-left">
        <div className="flex flex-col items-center sm:items-start justify-center p-3 bg-muted/40 rounded-xl">
          <span className="text-3xl font-extrabold text-foreground tracking-tight">
            {rep.average_rating.toFixed(1)}
          </span>
          <StarRating rating={rep.average_rating} size="sm" className="mt-1" />
          <span className="text-xs text-muted-foreground mt-1">
            Based on {rep.total_reviews} reviews
          </span>
        </div>

        <div className="flex flex-col items-center sm:items-start justify-center p-3 bg-muted/40 rounded-xl">
          <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold text-2xl">
            <ThumbsUp className="h-5 w-5" />
            <span>{rep.positive_percentage}%</span>
          </div>
          <span className="text-xs text-muted-foreground mt-1">
            Positive Feedback Rate
          </span>
        </div>

        <div className="flex flex-col justify-center space-y-1 p-3 bg-muted/40 rounded-xl text-xs">
          {[5, 4, 3, 2, 1].map((stars) => {
            const count =
              stars === 5
                ? rep.five_star_count
                : stars === 4
                ? rep.four_star_count
                : stars === 3
                ? rep.three_star_count
                : stars === 2
                ? rep.two_star_count
                : rep.one_star_count;
            const pct = rep.total_reviews > 0 ? (count / rep.total_reviews) * 100 : 0;
            return (
              <div key={stars} className="flex items-center gap-2">
                <span className="w-3 text-muted-foreground">{stars}★</span>
                <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-yellow-400 rounded-full"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-4 text-right text-[10px] text-muted-foreground">{count}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
