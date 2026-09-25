import { gql } from "@apollo/client";

export const GET_USER_REVIEWS = gql`
  query GetUserReviews($userId: String!, $limit: Int = 10, $offset: Int = 0) {
    reviews(
      where: { reviewee_id: { _eq: $userId } }
      order_by: { created_at: desc }
      limit: $limit
      offset: $offset
    ) {
      id
      escrow_id
      reviewer_id
      reviewer_name
      reviewee_id
      rating
      comment
      role
      created_at
    }
    user_reputation_summary(where: { user_id: { _eq: $userId } }) {
      user_id
      total_reviews
      average_rating
      five_star_count
      four_star_count
      three_star_count
      two_star_count
      one_star_count
      positive_percentage
    }
  }
`;

export const GET_ESCROW_REVIEWS = gql`
  query GetEscrowReviews($escrowId: String!) {
    reviews(where: { escrow_id: { _eq: $escrowId } }) {
      id
      escrow_id
      reviewer_id
      reviewer_name
      reviewee_id
      rating
      comment
      role
      created_at
    }
  }
`;
