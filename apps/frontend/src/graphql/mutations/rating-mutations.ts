import { gql } from "@apollo/client";

export const INSERT_REVIEW = gql`
  mutation InsertReview($object: reviews_insert_input!) {
    insert_reviews_one(object: $object) {
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
