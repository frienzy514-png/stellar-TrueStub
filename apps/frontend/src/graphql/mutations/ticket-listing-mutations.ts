import { gql } from "@apollo/client";

export const INSERT_TICKET_LISTING = gql`
  mutation InsertTicketListing($object: ticket_listings_insert_input!) {
    insert_ticket_listings_one(object: $object) {
      id
      name
      price
      status
    }
  }
`;

export const DELETE_TICKET_LISTING = gql`
  mutation DeleteTicketListing($id: Int!) {
    delete_ticket_listings_by_pk(id: $id) {
      id
    }
  }
`;
