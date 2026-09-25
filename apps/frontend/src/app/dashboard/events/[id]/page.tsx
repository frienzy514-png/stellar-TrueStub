"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Building2, MapPin } from "lucide-react";

// TODO: replace with Hasura query → public.events
const STUB_EVENTS = [
  {
    id: "1",
    name: "Coldplay Live",
    address: "Estadio Nacional, La Sabana, San José",
    location_area: "San José Centro",
    description: "Music of the Spheres world tour",
  },
  {
    id: "2",
    name: "Costa Rica vs Mexico",
    address: "Estadio Nacional, La Sabana, San José",
    location_area: "San José Centro",
    description: "International football friendly",
  },
  {
    id: "3",
    name: "Hamilton",
    address: "Teatro Popular Melico Salazar, San José",
    location_area: "San José Centro",
    description: "Broadway musical, touring production",
  },
];

export default function EventDetailPage() {
  const params = useParams();
  const event = STUB_EVENTS.find((e) => e.id === params.id);

  if (!event) {
    return (
      <div className="space-y-6">
        <Link
          href="/dashboard/events"
          className="flex items-center gap-2 text-sm
                     text-gray-400 hover:text-white transition-colors w-fit"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Events
        </Link>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Building2 className="h-12 w-12 text-gray-300 dark:text-gray-600 mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Event not found
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            The event you&apos;re looking for doesn&apos;t exist.
          </p>
          <Link
            href="/dashboard/events"
            className="mt-6 rounded-lg bg-orange-500 hover:bg-orange-600
                       text-white text-sm font-semibold px-4 py-2 transition-colors"
          >
            View all events
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <Link
        href="/dashboard/events"
        className="flex items-center gap-2 text-sm
                   text-gray-400 hover:text-white transition-colors w-fit"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Events
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {event.name}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Event details and information
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-slate-700
                      bg-white dark:bg-slate-900 overflow-hidden">
        <div className="p-6 space-y-6">
          {/* Name */}
          <div className="flex items-start gap-3">
            <Building2 className="h-5 w-5 text-orange-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Name
              </p>
              <p className="text-sm font-semibold text-gray-900 dark:text-white mt-0.5">
                {event.name}
              </p>
            </div>
          </div>

          {/* Address */}
          <div className="flex items-start gap-3">
            <MapPin className="h-5 w-5 text-orange-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Address
              </p>
              <p className="text-sm text-gray-900 dark:text-white mt-0.5">
                {event.address}
              </p>
            </div>
          </div>

          {/* Location Area */}
          <div className="flex items-start gap-3">
            <MapPin className="h-5 w-5 text-orange-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Area
              </p>
              <p className="text-sm text-gray-900 dark:text-white mt-0.5">
                {event.location_area}
              </p>
            </div>
          </div>

          {/* Description */}
          {event.description && (
            <div className="flex items-start gap-3">
              <div className="h-5 w-5 flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-orange-400">i</span>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Description
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-300 mt-0.5">
                  {event.description}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
