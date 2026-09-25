"use client";

import Link from "next/link";
import { useQuery } from "@apollo/client/react";
import { PlusCircle } from "lucide-react";

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

export default function EventsPage() {
  const { data, loading, error } = useQuery<{ events: EventRow[] }>(GET_EVENTS, {
    fetchPolicy: "cache-and-network",
  });
  const events = data?.events ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Events
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your events
          </p>
        </div>
        <Link
          href="/dashboard/events/new"
          className="flex items-center gap-2 rounded-lg bg-orange-500
                     hover:bg-orange-600 text-white text-sm font-semibold
                     px-4 py-2 transition-colors"
        >
          <PlusCircle className="h-4 w-4" />
          New Event
        </Link>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-200
                      dark:border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-slate-800 text-left">
              {["Name", "Address", "Area", "Description", "Actions"].map(
                (col) => (
                  <th
                    key={col}
                    className="px-4 py-3 font-medium
                               text-gray-500 dark:text-gray-400"
                  >
                    {col}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
            {STUB_EVENTS.map((event) => (
              <tr
                key={event.id}
                className="bg-white dark:bg-slate-900
                           hover:bg-gray-50 dark:hover:bg-slate-800
                           transition-colors"
              >
                <td className="px-4 py-3 font-semibold
                               text-gray-900 dark:text-white">
                  {event.name}
                </td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                  {event.address}
                </td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                  {event.location_area}
                </td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400
                               max-w-[200px] truncate">
                  {event.description}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/dashboard/events/${event.id}`}
                    className="text-sm font-medium text-orange-500
                               hover:text-orange-600 transition-colors"
                  >
                    View →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
