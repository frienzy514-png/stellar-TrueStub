"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@apollo/client/react";
import { ArrowLeft, Building2, MapPin } from "lucide-react";
import { GET_EVENT_BY_ID, type EventRow } from "@/graphql/queries/event-queries";

export default function EventDetailPage() {
  const params = useParams<{ id: string }>();
  const { data, loading, error } = useQuery<{ events_by_pk: EventRow | null }>(GET_EVENT_BY_ID, { variables: { id: params.id }, skip: !params.id });
  if (loading) return <p role="status" className="text-sm text-muted-foreground">Loading event…</p>;
  if (error) return <p role="alert" className="text-sm text-red-600">Unable to load this event.</p>;
  const event = data?.events_by_pk;
  if (!event) return <div className="space-y-6"><Link href="/dashboard/events" className="flex items-center gap-2 text-sm"><ArrowLeft className="h-4 w-4" />Back to Events</Link><div className="py-20 text-center"><Building2 className="mx-auto h-12 w-12 text-gray-400 mb-4" /><h2 className="text-xl font-semibold">Event not found</h2><p className="text-sm text-muted-foreground mt-1">The event you&apos;re looking for doesn&apos;t exist.</p></div></div>;
  return <div className="space-y-6 max-w-2xl mx-auto"><Link href="/dashboard/events" className="flex items-center gap-2 text-sm"><ArrowLeft className="h-4 w-4" />Back to Events</Link><div><h1 className="text-2xl font-bold">{event.name}</h1><p className="text-sm text-muted-foreground mt-1">Event details and information</p></div><div className="rounded-xl border bg-white dark:bg-slate-900 overflow-hidden"><div className="p-6 space-y-6"><div className="flex items-start gap-3"><Building2 className="h-5 w-5 text-orange-400" /><div><p className="text-xs uppercase text-gray-500">Name</p><p className="text-sm font-semibold mt-0.5">{event.name}</p></div></div><div className="flex items-start gap-3"><MapPin className="h-5 w-5 text-orange-400" /><div><p className="text-xs uppercase text-gray-500">Address</p><p className="text-sm mt-0.5">{event.address}</p></div></div><div className="flex items-start gap-3"><MapPin className="h-5 w-5 text-orange-400" /><div><p className="text-xs uppercase text-gray-500">Area</p><p className="text-sm mt-0.5">{event.location_area || "—"}</p></div></div>{event.description && <div><p className="text-xs uppercase text-gray-500">Description</p><p className="text-sm mt-0.5">{event.description}</p></div>}</div></div></div>;
}
