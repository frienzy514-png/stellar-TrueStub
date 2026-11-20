"use client";
import Link from "next/link";
import { useQuery } from "@apollo/client/react";
import { PlusCircle } from "lucide-react";
import { GET_EVENTS, type EventRow } from "@/graphql/queries/event-queries";

export default function EventsPage() {
  const { data, loading, error } = useQuery<{ events: EventRow[] }>(GET_EVENTS, { fetchPolicy: "cache-and-network" });
  const events = data?.events ?? [];
  return <div className="space-y-6">
    <div className="flex items-center justify-between"><div><h1 className="text-2xl font-bold text-gray-900 dark:text-white">Events</h1><p className="text-sm text-muted-foreground mt-1">Manage your events</p></div><Link href="/dashboard/events/new" className="flex items-center gap-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-4 py-2"><PlusCircle className="h-4 w-4" />New Event</Link></div>
    {loading && <p role="status" className="text-sm text-muted-foreground">Loading events…</p>}
    {error && <p role="alert" className="text-sm text-red-600">Unable to load events. Please try again.</p>}
    {!loading && !error && events.length === 0 && <p className="rounded-xl border p-8 text-center text-sm text-muted-foreground">No events have been created yet.</p>}
    {!loading && !error && events.length > 0 && <div className="rounded-xl border overflow-hidden"><table className="w-full text-sm"><thead><tr className="bg-gray-50 dark:bg-slate-800 text-left">{["Name","Address","Area","Description","Actions"].map((col) => <th key={col} className="px-4 py-3 font-medium text-gray-500">{col}</th>)}</tr></thead><tbody className="divide-y">{events.map((event) => <tr key={event.id}><td className="px-4 py-3 font-semibold">{event.name}</td><td className="px-4 py-3">{event.address}</td><td className="px-4 py-3">{event.location_area || "—"}</td><td className="px-4 py-3 max-w-[200px] truncate">{event.description || "—"}</td><td className="px-4 py-3"><Link href={`/dashboard/events/${event.id}`} className="text-orange-500">View →</Link></td></tr>)}</tbody></table></div>}
  </div>;
}
