import { gql } from "@apollo/client";

export interface EventRow {
  id: string;
  name: string;
  address: string;
  location_area: string | null;
  description: string | null;
}

export const GET_EVENTS = gql`
  query GetEvents {
    events(order_by: { created_at: desc }) {
      id
      name
      address
      location_area
      description
    }
  }
`;

export const GET_EVENT_BY_ID = gql`
  query GetEventById($id: uuid!) {
    events_by_pk(id: $id) {
      id
      name
      address
      location_area
      description
    }
  }
`;
