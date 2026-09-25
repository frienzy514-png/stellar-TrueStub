import type { ListingOccupancyStatus as ListingStatus } from "@/components/dashboard/listings/ListingStatusBadge";

export interface TicketListing {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  warranty_deposit: number;
  is_available: boolean;
  image_urls?: string[] | null;
  address: {
    street?: string;
    neighborhood?: string;
    city?: string;
    country?: string;
  };
  location: string;
  offers: number;
  status: ListingStatus;
  promoted: boolean;
  available_from: string;
  available_until?: string | null;
  created_at: string;
  owner_id: string;
}

/**
 * Static fixture data for tests and Storybook only.
 * Live listing data comes from Hasura via `useTicketListings`.
 */
export const MOCK_LISTINGS: TicketListing[] = [
  {
    id: "1",
    name: "Coldplay — West Floor",
    description: "One verified West Floor ticket. Face value: $280; resale price: $405.",
    price: 1200,
    warranty_deposit: 2400,
    is_available: true,
    image_urls: ["/img/room1.png"],
    address: {
      street: "Calle 42, Avenida 8",
      neighborhood: "Sabana Norte",
      city: "San José",
      country: "Costa Rica",
    },
    location: "San José",
    offers: 2,
    status: "available",
    promoted: true,
    available_from: "2026-06-01T00:00:00Z",
    available_until: null,
    created_at: "2026-05-20T10:00:00Z",
    owner_id: "mock-owner-1",
  },
  {
    id: "2",
    name: "Los Yoses TicketListing",
    description: "One East Stand ticket. Face value: $120; resale price: $190.",
    price: 950,
    warranty_deposit: 1900,
    is_available: true,
    image_urls: ["/img/room2.png"],
    address: {
      street: "329 Calle Santos",
      neighborhood: "Los Yoses",
      city: "San José",
      country: "Costa Rica",
    },
    location: "San José",
    offers: 5,
    status: "unavailable",
    promoted: false,
    available_from: "2026-06-15T00:00:00Z",
    available_until: null,
    created_at: "2026-05-18T08:30:00Z",
    owner_id: "mock-owner-1",
  },
  {
    id: "3",
    name: "Karol G — Premium North",
    description: "One Premium North ticket. Face value: $210; resale price: $320.",
    price: 1500,
    warranty_deposit: 3000,
    is_available: false,
    image_urls: ["/img/event/event1.jpg"],
    address: {
      street: "Avenida Central",
      neighborhood: "Centro",
      city: "Heredia",
      country: "Costa Rica",
    },
    location: "Heredia",
    offers: 7,
    status: "unavailable",
    promoted: false,
    available_from: "2026-07-01T00:00:00Z",
    available_until: "2026-12-31T00:00:00Z",
    created_at: "2026-05-10T14:00:00Z",
    owner_id: "mock-owner-1",
  },
  {
    id: "4",
    name: "Hamilton — Orchestra",
    description: "One Orchestra ticket. Face value: $175; resale price: $265.",
    price: 700,
    warranty_deposit: 1400,
    is_available: true,
    image_urls: [],
    address: {
      street: "Calle 15",
      neighborhood: "Curridabat",
      city: "San José",
      country: "Costa Rica",
    },
    location: "San José",
    offers: 1,
    status: "available",
    promoted: false,
    available_from: "2026-06-10T00:00:00Z",
    available_until: null,
    created_at: "2026-05-05T09:00:00Z",
    owner_id: "mock-owner-1",
  },
  {
    id: "5",
    name: "Swan Lake — Balcony Center",
    description: "One Balcony Center ticket. Face value: $100; resale price: $145.",
    price: 2200,
    warranty_deposit: 4400,
    is_available: true,
    image_urls: ["/img/buildings.png"],
    address: {
      street: "Plaza Itskatzu",
      neighborhood: "Escazú",
      city: "San José",
      country: "Costa Rica",
    },
    location: "San José",
    offers: 2,
    status: "available",
    promoted: true,
    available_from: "2026-06-20T00:00:00Z",
    available_until: null,
    created_at: "2026-05-01T11:00:00Z",
    owner_id: "mock-owner-1",
  },
  {
    id: "6",
    name: "Monster Jam — Grandstand B",
    description: "One Grandstand B ticket. Face value: $65; resale price: $95.",
    price: 1100,
    warranty_deposit: 2200,
    is_available: false,
    image_urls: [],
    address: {
      street: "Calle Real",
      neighborhood: "Centro",
      city: "Alajuela",
      country: "Costa Rica",
    },
    location: "Alajuela",
    offers: 3,
    status: "unavailable",
    promoted: false,
    available_from: "2026-08-01T00:00:00Z",
    available_until: null,
    created_at: "2026-04-28T16:45:00Z",
    owner_id: "mock-owner-1",
  },
];

export const MOCK_AGGREGATE_COUNT = MOCK_LISTINGS.length;