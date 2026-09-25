import type { Metadata } from "next";
import GuestDashboard from "@/components/dashboard/guest/GuestDashboard";
import { EventHeader } from "@/components/events";

export const metadata: Metadata = {
  title: "Buy tickets | TrueStub",
  description:
    "Browse verified resale ticket listings and track your escrow-backed purchases.",
};

/**
 * Buyer dashboard. In the ticket-resale domain a "guest" is a buyer: someone
 * browsing listings and purchasing tickets through escrow, as opposed to the
 * manager (seller) dashboard at /dashboard/manager.
 */
export default function GuestDashboardPage() {
  return (
    <div className="min-h-screen bg-white">
      <EventHeader />
      <GuestDashboard />
    </div>
  );
}
