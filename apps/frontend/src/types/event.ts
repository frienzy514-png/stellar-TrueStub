export interface EventListingFeatureSummary {
  seatCount: number;
  rowCount: number;
  mobileTransfer: boolean;
}

export interface EventOrganizer {
  name: string;
  avatar: string;
}

export interface EventListing extends EventListingFeatureSummary {
  id: string;
  name: string;
  /** Venue name, kept as address for the existing card layout. */
  address: string;
  /** Resale price in USDC. */
  price: number;
  faceValue: number;
  eventDate: string;
  section: string;
  seat: string;
  promoted: boolean;
  images: string[];
  category: 'Concerts' | 'Sports' | 'Theater';
  location: 'San José' | 'Heredia' | 'Alajuela' | 'Cartago';
  owner: EventOrganizer;
  description: string;
  favorite?: boolean;
}
