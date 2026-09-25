import { gql } from "@apollo/client";

export const INSERT_EVENT = gql`
  mutation InsertEvent($object: events_insert_input!) {
    insert_events_one(object: $object) {
      id
    }
  }
`;
