"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation } from "@apollo/client/react";
import { ArrowLeft, MapPin, Building2, FileText } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { INSERT_EVENT } from "@/graphql/mutations/event-mutations";
import { GET_EVENTS } from "@/graphql/queries/event-queries";
import { useCurrentUserId } from "@/hooks/useCurrentUserId";

interface EventFormData {
  name: string;
  description: string;
  address: string;
  location_area: string;
  latitude: string;
  longitude: string;
}

const EMPTY_FORM: EventFormData = {
  name: "",
  description: "",
  address: "",
  location_area: "",
  latitude: "9.9281",
  longitude: "-84.0907",
};

export default function NewEventPage() {
  const router = useRouter();
  const [form, setForm] = useState<EventFormData>(EMPTY_FORM);
  const userId = useCurrentUserId();
  const [insertEvent, { loading: isSubmitting }] = useMutation(INSERT_EVENT, {
    refetchQueries: [{ query: GET_EVENTS }],
  });

  const set = (field: keyof EventFormData, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const latitude = parseFloat(form.latitude);
    const longitude = parseFloat(form.longitude);

    try {
      await insertEvent({
        variables: {
          object: {
            name: form.name,
            description: form.description || null,
            address: form.address,
            location_area: form.location_area || null,
            owner_id: userId,
            // Hasura takes PostGIS geometry as GeoJSON — coordinates are [lng, lat].
            coordinates:
              Number.isFinite(latitude) && Number.isFinite(longitude)
                ? { type: "Point", coordinates: [longitude, latitude] }
                : null,
          },
        },
      });
      toast.success("Event created");
      router.push("/dashboard/events");
    } catch {
      toast.error("Failed to create event. Please try again.");
    }
  };

  const inputClass = cn(
    "w-full rounded-lg border border-gray-200 dark:border-slate-600",
    "bg-white dark:bg-slate-900 px-4 py-2.5 text-sm",
    "text-gray-900 dark:text-white",
    "placeholder:text-gray-400 dark:placeholder:text-gray-500",
    "focus:outline-none focus:ring-2 focus:ring-orange-500",
    "transition-colors",
  );

  const labelClass =
    "block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1";

  return (
    <div className="space-y-6 max-w-4xl mx-auto">

      {/* Back */}
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
          New Event
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Register a new event property on TrueStub
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* ── Left column ── */}
          <div className="space-y-4">

            {/* Name */}
            <div>
              <label htmlFor="event-name" className={labelClass}>
                Event Name <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2
                                      h-4 w-4 text-orange-400" />
                <input
                  id="event-name"
                  type="text"
                  required
                  maxLength={20}
                  placeholder="e.g. Metropolitan Tower"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  className={cn(inputClass, "pl-9")}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {form.name.length}/20 characters
              </p>
            </div>

            {/* Address */}
            <div>
              <label htmlFor="event-address" className={labelClass}>
                Address <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2
                                   h-4 w-4 text-orange-400" />
                <input
                  id="event-address"
                  type="text"
                  required
                  maxLength={50}
                  placeholder="e.g. Avenida Central 100, San José"
                  value={form.address}
                  onChange={(e) => set("address", e.target.value)}
                  className={cn(inputClass, "pl-9")}
                />
              </div>
            </div>

            {/* Location area */}
            <div>
              <label htmlFor="event-location-area" className={labelClass}>Location Area</label>
              <input
                id="event-location-area"
                type="text"
                maxLength={20}
                placeholder="e.g. San José Centro"
                value={form.location_area}
                onChange={(e) => set("location_area", e.target.value)}
                className={inputClass}
              />
            </div>

            {/* Coordinates */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="event-latitude" className={labelClass}>Latitude</label>
                <input
                  id="event-latitude"
                  type="number"
                  step="any"
                  placeholder="9.9281"
                  value={form.latitude}
                  onChange={(e) => set("latitude", e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="event-longitude" className={labelClass}>Longitude</label>
                <input
                  id="event-longitude"
                  type="number"
                  step="any"
                  placeholder="-84.0907"
                  value={form.longitude}
                  onChange={(e) => set("longitude", e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
            <p className="text-xs text-gray-400 -mt-2">
              PostGIS coordinates — default is San José, Costa Rica center
            </p>

          </div>

          {/* ── Right column ── */}
          <div className="space-y-4">

            {/* Description */}
            <div>
              <label htmlFor="event-description" className={labelClass}>
                Description
              </label>
              <div className="relative">
                <FileText className="absolute left-3 top-3
                                     h-4 w-4 text-orange-400" />
                <textarea
                  id="event-description"
                  maxLength={50}
                  rows={5}
                  placeholder="Describe the event — features, nearby amenities, special conditions..."
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  className={cn(inputClass, "pl-9 resize-none")}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {form.description.length}/50 characters
              </p>
            </div>

            {/* Schema note */}
            <div className="rounded-lg border border-blue-200
                            dark:border-blue-800 bg-blue-50
                            dark:bg-blue-900/10 p-4 space-y-1">
              <p className="text-xs font-semibold text-blue-600
                             dark:text-blue-400">
                Schema constraints (public.events)
              </p>
              <ul className="text-xs text-blue-500 dark:text-blue-400
                              space-y-0.5 list-disc list-inside">
                <li>name — max 20 characters, required</li>
                <li>description — max 50 characters</li>
                <li>address — max 50 characters, required</li>
                <li>location_area — max 20 characters</li>
                <li>coordinates — PostGIS Point (longitude, latitude)</li>
              </ul>
            </div>

          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-4
                        border-t border-gray-200 dark:border-slate-700">
          <Link
            href="/dashboard/events"
            className="px-6 py-2.5 rounded-lg border border-gray-200
                       dark:border-slate-600 text-sm font-medium
                       text-gray-600 dark:text-gray-300
                       hover:bg-gray-50 dark:hover:bg-slate-800
                       transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2.5 rounded-lg bg-orange-500
                       hover:bg-orange-600 active:bg-orange-700
                       text-white text-sm font-semibold
                       transition-colors disabled:opacity-60
                       disabled:cursor-not-allowed"
          >
            {isSubmitting ? "Creating..." : "Create Event"}
          </button>
        </div>
      </form>
    </div>
  );
}
