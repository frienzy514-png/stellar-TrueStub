import type { EventListing } from '@/types/event';

export const STUB_EVENTS: EventListing[] = [
  { id: '1', name: 'Coldplay: Music of the Spheres', address: 'Estadio Nacional, San José', price: 405, faceValue: 280, eventDate: '2026-11-14T20:00:00Z', section: 'West Floor', seat: 'Row 12, Seat 8', seatCount: 1, rowCount: 12, mobileTransfer: true, promoted: true, images: ['/img/hotel/hotel1.jpg'], category: 'Concerts', location: 'San José', owner: { name: 'Alberto Casas', avatar: '/img/person.png' }, description: 'Mobile-transfer ticket with a clear view of the main stage. Face value and resale price are shown before purchase.', favorite: false },
  { id: '2', name: 'Costa Rica vs. Mexico', address: 'Estadio Nacional, San José', price: 190, faceValue: 120, eventDate: '2026-10-03T19:30:00Z', section: 'East Stand', seat: 'Row 18, Seat 22', seatCount: 1, rowCount: 18, mobileTransfer: true, promoted: false, images: ['/img/hotel/hotel1.jpg'], category: 'Sports', location: 'San José', owner: { name: 'María López', avatar: '/img/person.png' }, description: 'Verified resale ticket for an international football match, delivered by mobile transfer.', favorite: false },
  { id: '3', name: 'Hamilton', address: 'Teatro Popular Melico Salazar, San José', price: 265, faceValue: 175, eventDate: '2026-09-21T20:00:00Z', section: 'Orchestra', seat: 'Row F, Seat 14', seatCount: 1, rowCount: 6, mobileTransfer: true, promoted: false, images: ['/img/hotel/hotel1.jpg'], category: 'Theater', location: 'San José', owner: { name: 'Randall Valenciano', avatar: '/img/person.png' }, description: 'Orchestra-level ticket for the touring production, with secure mobile delivery.', favorite: true },
  { id: '4', name: 'Karol G: Mañana Será Bonito', address: 'Estadio Rosabal Cordero, Heredia', price: 320, faceValue: 210, eventDate: '2026-12-05T20:30:00Z', section: 'Premium North', seat: 'Row 7, Seat 4', seatCount: 1, rowCount: 7, mobileTransfer: true, promoted: true, images: ['/img/hotel/hotel1.jpg'], category: 'Concerts', location: 'Heredia', owner: { name: 'Ana Ruiz', avatar: '/img/person.png' }, description: 'Premium reserved seat for a sold-out concert, backed by escrow until transfer.', favorite: false },
  { id: '5', name: 'Monster Jam', address: 'Parque Viva, Alajuela', price: 95, faceValue: 65, eventDate: '2026-08-29T18:00:00Z', section: 'Grandstand B', seat: 'Row 9, Seat 16', seatCount: 1, rowCount: 9, mobileTransfer: false, promoted: false, images: ['/img/hotel/hotel1.jpg'], category: 'Sports', location: 'Alajuela', owner: { name: 'Luis Salas', avatar: '/img/person.png' }, description: 'Reserved grandstand admission with ticket pickup instructions supplied after escrow funding.', favorite: true },
  { id: '6', name: 'Swan Lake', address: 'Teatro Municipal, Cartago', price: 145, faceValue: 100, eventDate: '2026-10-18T19:00:00Z', section: 'Balcony Center', seat: 'Row C, Seat 9', seatCount: 1, rowCount: 3, mobileTransfer: true, promoted: false, images: ['/img/hotel/hotel1.jpg'], category: 'Theater', location: 'Cartago', owner: { name: 'Sofía Vega', avatar: '/img/person.png' }, description: 'Center balcony ticket for a one-night ballet performance, ready for mobile transfer.', favorite: false },
];

export const EVENT_CATEGORIES = ['Concerts', 'Sports', 'Theater'] as const;
export const EVENT_LOCATIONS = ['San José', 'Heredia', 'Alajuela', 'Cartago'] as const;
export const SECTION_FILTERS = [
  { label: 'All sections', value: 'all' },
  { label: 'Floor', value: '1' },
  { label: 'Lower bowl', value: '2' },
  { label: 'Upper bowl', value: '3' },
] as const;

export function getEventById(id: string) {
  return STUB_EVENTS.find((event) => event.id === id) ?? STUB_EVENTS[0];
}

export function getSuggestedEvents(activeId: string) {
  return STUB_EVENTS.filter((event) => event.id !== activeId).slice(0, 5);
}
