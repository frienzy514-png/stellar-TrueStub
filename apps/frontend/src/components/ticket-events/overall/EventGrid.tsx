"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Event } from "@/types/event.entity";
import { eventsMockData } from "@/components/ticket-events/mocks/events.mock";
import EventCard from "./EventCard";

export default function EventGrid() {
  const [events, setEvents] = useState<Event[]>(eventsMockData);

  const toggleFavorite = (id: number) => {
    setEvents(
      events.map((event) =>
        event.id === id ? { ...event, isFavorite: !event.isFavorite } : event,
      ),
    );
  };

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button variant="link" className="text-blue-500">
          View all
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {events.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            onToggleFavorite={toggleFavorite}
          />
        ))}
      </div>
    </>
  );
}
