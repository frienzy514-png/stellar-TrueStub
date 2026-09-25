"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Mail, Bell, Smartphone, ShieldAlert, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export function NotificationPreferences() {
  const [preferences, setPreferences] = useState({
    emailFunded: true,
    emailDisputed: true,
    emailReleased: true,
    pushFunded: true,
    pushDisputed: true,
    pushReleased: true,
    smsDisputesOnly: false,
  });

  const [emailAddress, setEmailAddress] = useState("john_s@gmail.com");
  const [isSaved, setIsSaved] = useState(false);

  const toggle = (key: keyof typeof preferences) => {
    setPreferences((prev) => ({ ...prev, [key]: !prev[key] }));
    setIsSaved(false);
  };

  const handleSave = () => {
    setIsSaved(true);
    toast.success("Notification preferences saved successfully!");
    setTimeout(() => setIsSaved(false), 2000);
  };

  return (
    <Card className="border-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg">Out-of-App Escrow Notifications</CardTitle>
            <CardDescription>
              Configure instant email and push alerts whenever your escrow changes status (funded, disputed, released).
            </CardDescription>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 px-2.5 py-1 rounded-full font-medium">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Active Webhooks</span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Email alerts section */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 font-medium text-sm text-foreground">
            <Mail className="h-4 w-4 text-blue-500" />
            <span>Email Notifications ({emailAddress})</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pl-6">
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={preferences.emailFunded}
                onChange={() => toggle("emailFunded")}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span>Escrow Funded</span>
            </label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={preferences.emailDisputed}
                onChange={() => toggle("emailDisputed")}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span>Dispute Raised / Updated</span>
            </label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={preferences.emailReleased}
                onChange={() => toggle("emailReleased")}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span>Funds Released / Resolved</span>
            </label>
          </div>
        </div>

        {/* Push alerts section */}
        <div className="space-y-3 border-t pt-4">
          <div className="flex items-center gap-2 font-medium text-sm text-foreground">
            <Bell className="h-4 w-4 text-purple-500" />
            <span>Push & Browser Notifications</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pl-6">
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={preferences.pushFunded}
                onChange={() => toggle("pushFunded")}
                className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
              />
              <span>Deposit Confirmations</span>
            </label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={preferences.pushDisputed}
                onChange={() => toggle("pushDisputed")}
                className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
              />
              <span>Dispute Actions</span>
            </label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={preferences.pushReleased}
                onChange={() => toggle("pushReleased")}
                className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
              />
              <span>Payout Approvals</span>
            </label>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button
            size="sm"
            onClick={handleSave}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isSaved ? "Saved!" : "Save Notification Preferences"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
