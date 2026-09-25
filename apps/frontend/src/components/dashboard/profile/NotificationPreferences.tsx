"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useState } from "react";

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

// TODO: replace with the user's stored preferences from Hasura
const STUB_PREFERENCES: Record<NotificationPreferenceKey, boolean> = {
  offers: true,
  escrowUpdates: true,
  savedListingPriceDrops: false,
  eventReminders: true,
};

export function NotificationPreferences() {
  const [preferences, setPreferences] = useState(STUB_PREFERENCES);

  const handleToggle = (key: NotificationPreferenceKey, checked: boolean) => {
    setPreferences((prev) => ({ ...prev, [key]: checked }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: replace with mutation(UPDATE_NOTIFICATION_PREFERENCES)
    console.log("Save notification preferences", preferences);
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
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            Save preferences
          </Button>
        </div>
      </div>
    </form>
  );
}
