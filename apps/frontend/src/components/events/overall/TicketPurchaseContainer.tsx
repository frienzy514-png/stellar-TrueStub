import EventGrid from "./EventGrid";
import SearchFilters from "./SearchFilters";

export default function TicketPurchaseContainer() {
  return (
    <div className="p-6 w-full">
      <h1 className="text-2xl font-semibold mb-4">Find an event</h1>

      {/* Search and Filters */}
      <SearchFilters />

      {/* Event Grid */}
      <EventGrid />
    </div>
  );
}
