"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useEffect, useState } from "react";

type NotificationPreferenceKey =
  | "offers"
  | "escrowUpdates"
  | "savedListingPriceDrops"
  | "eventReminders";

const PREFERENCE_OPTIONS: {
  key: NotificationPreferenceKey;
  label: string;
  description: string;
}[] = [
  {
    key: "offers",
    label: "Offers on my listings",
    description: "When a buyer makes or updates an offer on a ticket you listed.",
  },
  {
    key: "escrowUpdates",
    label: "Escrow status updates",
    description: "When an escrow is funded, a ticket is transferred, or funds are released.",
  },
  {
    key: "savedListingPriceDrops",
    label: "Price drops on saved listings",
    description: "When the price of a listing you saved goes down.",
  },
  {
    key: "eventReminders",
    label: "Event reminders",
    description: "A reminder before an event you hold tickets for.",
  },
];

const DEFAULT_PREFERENCES: Record<NotificationPreferenceKey, boolean> = {
  offers: true,
  escrowUpdates: true,
  savedListingPriceDrops: false,
  eventReminders: true,
};

const GET_NOTIFICATION_PREFERENCES = /* GraphQL */ `
  query GetNotificationPreferences {
    notification_preferences_by_pk {
      offers
      escrowUpdates
      savedListingPriceDrops
      eventReminders
    }
  }
`;

const UPDATE_NOTIFICATION_PREFERENCES = /* GraphQL */ `
  mutation UpdateNotificationPreferences(
    $offers: Boolean!
    $escrowUpdates: Boolean!
    $savedListingPriceDrops: Boolean!
    $eventReminders: Boolean!
  ) {
    update_notification_preferences_by_pk(
      pk_columns: { id: 1 }
      _set: {
        offers: $offers
        escrowUpdates: $escrowUpdates
        savedListingPriceDrops: $savedListingPriceDrops
        eventReminders: $eventReminders
      }
    ) {
      offers
      escrowUpdates
      savedListingPriceDrops
      eventReminders
    }
  }
`;

export function NotificationPreferences() {
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadPreferences() {
      try {
        const response = await fetch("/api/graphql", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: GET_NOTIFICATION_PREFERENCES }),
        });

        if (!response.ok) {
          return;
        }

        const { data } = await response.json();
        const stored = data?.notification_preferences_by_pk;

        if (!cancelled && stored) {
          setPreferences({
            offers: stored.offers ?? DEFAULT_PREFERENCES.offers,
            escrowUpdates:
              stored.escrowUpdates ?? DEFAULT_PREFERENCES.escrowUpdates,
            savedListingPriceDrops:
              stored.savedListingPriceDrops ??
              DEFAULT_PREFERENCES.savedListingPriceDrops,
            eventReminders:
              stored.eventReminders ?? DEFAULT_PREFERENCES.eventReminders,
          });
        }
      } catch {
        // Keep defaults if the stored preferences can't be loaded.
      }
    }

    loadPreferences();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggle = (key: NotificationPreferenceKey, checked: boolean) => {
    setPreferences((prev) => ({ ...prev, [key]: checked }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setIsSaving(true);

    try {
      await fetch("/api/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: UPDATE_NOTIFICATION_PREFERENCES,
          variables: {
            offers: preferences.offers,
            escrowUpdates: preferences.escrowUpdates,
            savedListingPriceDrops: preferences.savedListingPriceDrops,
            eventReminders: preferences.eventReminders,
          },
        }),
      });
    } catch {
      // Keep the optimistic state if the save request fails.
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <h2 className="text-lg font-semibold mb-4">Email notifications</h2>

      <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6 space-y-5">
        {PREFERENCE_OPTIONS.map(({ key, label, description }) => (
          <div key={key} className="flex items-start gap-3">
            <Checkbox
              id={`notify-${key}`}
              checked={preferences[key]}
              onCheckedChange={(checked) => handleToggle(key, checked === true)}
              className="mt-0.5"
            />
            <div>
              <Label htmlFor={`notify-${key}`} className="font-medium">
                {label}
              </Label>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
          </div>
        ))}

        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={isSaving}
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            {isSaving ? "Saving..." : "Save preferences"}
          </Button>
        </div>
      </div>
    </form>
  );
}
