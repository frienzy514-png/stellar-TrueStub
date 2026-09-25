"use client";

import { useState } from "react";
import { Star } from "lucide-react";

interface StarRatingProps {
  rating: number;
  maxRating?: number;
  interactive?: boolean;
  onChange?: (rating: number) => void;
  size?: "sm" | "md" | "lg";
  showNumber?: boolean;
  reviewCount?: number;
  className?: string;
}

export function StarRating({
  rating,
  maxRating = 5,
  interactive = false,
  onChange,
  size = "md",
  showNumber = false,
  reviewCount,
  className = "",
}: StarRatingProps) {
  const [hoverRating, setHoverRating] = useState<number | null>(null);

  const starSizeClasses = {
    sm: "h-3.5 w-3.5",
    md: "h-4 w-4",
    lg: "h-6 w-6",
  };

  const displayedRating = hoverRating !== null ? hoverRating : rating;

  return (
    <div className={`inline-flex items-center gap-1.5 ${className}`}>
      <div className="flex items-center">
        {Array.from({ length: maxRating }).map((_, index) => {
          const starValue = index + 1;
          const isFilled = displayedRating >= starValue;
          const isHalf = !isFilled && displayedRating >= starValue - 0.5;

          if (interactive) {
            return (
              <button
                key={index}
                type="button"
                className="p-0.5 focus:outline-none transition-transform hover:scale-110 text-yellow-400"
                onClick={() => onChange?.(starValue)}
                onMouseEnter={() => setHoverRating(starValue)}
                onMouseLeave={() => setHoverRating(null)}
                aria-label={`Rate ${starValue} of ${maxRating} stars`}
              >
                <Star
                  className={`${starSizeClasses[size]} ${
                    isFilled
                      ? "fill-yellow-400 text-yellow-400"
                      : "text-gray-300 dark:text-gray-600"
                  }`}
                />
              </button>
            );
          }

          return (
            <span key={index} className="inline-block">
              {isFilled ? (
                <Star className={`${starSizeClasses[size]} fill-yellow-400 text-yellow-400`} />
              ) : isHalf ? (
                <div className="relative">
                  <Star className={`${starSizeClasses[size]} text-gray-300 dark:text-gray-600`} />
                  <div className="absolute inset-0 overflow-hidden w-1/2">
                    <Star className={`${starSizeClasses[size]} fill-yellow-400 text-yellow-400`} />
                  </div>
                </div>
              ) : (
                <Star className={`${starSizeClasses[size]} text-gray-300 dark:text-gray-600`} />
              )}
            </span>
          );
        })}
      </div>

      {showNumber && (
        <span className="text-sm font-semibold text-gray-900 dark:text-white ml-0.5">
          {rating.toFixed(1)}
        </span>
      )}

      {reviewCount !== undefined && (
        <span className="text-xs text-muted-foreground">
          ({reviewCount} {reviewCount === 1 ? "review" : "reviews"})
        </span>
      )}
    </div>
  );
}
