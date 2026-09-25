/**
 * Domain types for the ratings / reputation feature.
 *
 * These are pure TypeScript types that describe the shape of review and
 * reputation data used across components (ReviewsList, UserReputationSummary).
 * They are intentionally NOT imported from src/graphql/types.ts — that
 * hand-maintained file has been removed (Issue #166) in favour of codegen and
 * co-located types.  When a real Hasura schema for ratings is introduced and
 * `yarn codegen` is run, these types should be superseded by the generated
 * output in src/graphql/generated/ and the imports updated accordingly.
 */

export type Review = {
  id: string;
  escrow_id: string;
  reviewer_id: string;
  reviewer_name?: string | null;
  reviewee_id: string;
  rating: number;
  comment?: string | null;
  role: "buyer" | "seller" | "tenant" | "owner";
  created_at: string;
};

export type UserReputationSummary = {
  user_id: string;
  total_reviews: number;
  average_rating: number;
  five_star_count: number;
  four_star_count: number;
  three_star_count: number;
  two_star_count: number;
  one_star_count: number;
  positive_percentage: number;
};
