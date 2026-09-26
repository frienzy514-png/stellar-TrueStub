"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  TicketPurchaseData,
  EventData,
  TicketListingData,
  EscrowResponse,
  EscrowType,
} from "@/interfaces/ticket-purchase-escrow.interface";
import { EventEscrowForm } from "./EventEscrowForm";

// Providers
import { TrustlessWorkProvider } from "@/components/tw-blocks/providers/TrustlessWork";
import { WalletProvider } from "@/components/tw-blocks/wallet-kit/WalletProvider";
import { EscrowProvider } from "@/components/tw-blocks/providers/EscrowProvider";

// UI Components
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, ArrowRight, ExternalLink } from "lucide-react";

export interface TicketEscrowIntegrationProps {
  purchaseId: string;
  onComplete?: () => void;
}

/**
 * Loading Spinner Component
 */
function LoadingSpinner() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-12">
        <Loader2 className="h-10 w-10 animate-spin text-emerald-500" />
        <p className="mt-4 text-sm text-slate-500">Loading booking details...</p>
      </CardContent>
    </Card>
  );
}

/**
 * Escrow Confirmation View
 */
function EscrowConfirmationView({
  purchaseId,
  escrowData,
  onComplete,
}: {
  purchaseId: string;
  escrowData: EscrowResponse;
  onComplete: () => void;
}) {
  return (
    <Card className="border-emerald-200 dark:border-emerald-800">
      <CardHeader className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-8 w-8 text-emerald-500" />
          <div>
            <CardTitle>Escrow Created Successfully!</CardTitle>
            <CardDescription>
              Your booking is now protected by blockchain escrow
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-6">
        <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-800">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Contract ID
          </p>
          <p className="mt-1 font-mono text-sm break-all">
            {escrowData.contractId}
          </p>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3 dark:border-slate-700">
          <span className="text-sm text-slate-600 dark:text-slate-400">
            Status
          </span>
          <Badge
            variant="outline"
            className="border-emerald-500 text-emerald-600"
          >
            {escrowData.status}
          </Badge>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-4">
          <Button onClick={onComplete} className="flex-1">
            Go to Dashboard
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              window.open(
                `https://stellar.expert/explorer/testnet/contract/${escrowData.contractId}`,
                "_blank"
              )
            }
            className="flex-1"
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            View on Explorer
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Simulated API functions - Replace with actual implementations
 */
async function getTicketPurchase(purchaseId: string): Promise<TicketPurchaseData> {
  // TODO: Replace with actual API call
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        id: purchaseId,
        listingId: "room-001",
        eventId: "event-001",
        totalAmount: 350.0,
        currency: "USDC",
        quantity: 1,
        transferDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        eventDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
        guestEmail: "guest@example.com",
        seatSection: "Standard Room",
        preferences: {
          milestonePayments: false,
        },
      });
    }, 800);
  });
}

async function getEvent(eventId: string): Promise<EventData> {
  // TODO: Replace with actual API call
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        id: eventId,
        name: "Stellar Grand Event",
        walletAddress: "GBCXK3ZQWFWMQJXLSIMVCAHUKTJVWRJPB5XYGZGQCVBWKWVEPTSYLUHI",
        rating: 4.5,
        location: "Miami Beach, FL",
      });
    }, 400);
  });
}

async function getTicketListing(listingId: string): Promise<TicketListingData> {
  // TODO: Replace with actual API call
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        id: listingId,
        name: "Ocean View Suite",
        seatSection: "General Admission",
        listingPrice: 120,
        ticketQuantity: 2,
        pricePerUnit: 60,
        allowPartialPurchase: true,
        amenities: ["WiFi", "Air Conditioning", "Mini Bar"],
      });
    }, 300);
  });
}

async function updateTicketPurchaseWithEscrow(
  purchaseId: string,
  escrowInfo: {
    contractId: string;
    escrowStatus: string;
    unsignedXDR?: string;
  }
): Promise<void> {
  // TODO: Replace with actual API call
  console.log("Updating booking with escrow:", { purchaseId, escrowInfo });
  return new Promise((resolve) => setTimeout(resolve, 500));
}

/**
 * TicketEscrowIntegration Component
 * 
 * Main integration component for the event booking escrow flow
 */
export function TicketEscrowIntegration({
  purchaseId,
  onComplete,
}: TicketEscrowIntegrationProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [escrowCreated, setEscrowCreated] = useState(false);
  const [escrowData, setEscrowData] = useState<EscrowResponse | null>(null);

  // Data states
  const [booking, setBooking] = useState<TicketPurchaseData | null>(null);
  const [event, setEvent] = useState<EventData | null>(null);
  const [room, setListing] = useState<TicketListingData | null>(null);

  // Load data on mount
  useEffect(() => {
    async function loadData() {
      try {
        setIsLoading(true);
        
        const purchaseData = await getTicketPurchase(purchaseId);
        setBooking(purchaseData);

        const [eventData, roomData] = await Promise.all([
          getEvent(purchaseData.eventId),
          getTicketListing(purchaseData.listingId),
        ]);

        setEvent(eventData);
        setListing(roomData);
      } catch (error) {
        console.error("Failed to load data:", error);
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [purchaseId]);

  // Handle escrow creation success
  const handleEscrowCreated = async (escrowResponse: EscrowResponse) => {
    try {
      // Update booking with escrow details
      await updateTicketPurchaseWithEscrow(purchaseId, {
        contractId: escrowResponse.contractId,
        escrowStatus: escrowResponse.status,
        unsignedXDR: escrowResponse.unsignedXDR,
      });

      setEscrowData(escrowResponse);
      setEscrowCreated(true);
    } catch (error) {
      console.error("Failed to update booking:", error);
      // Still show success since escrow was created
      setEscrowData(escrowResponse);
      setEscrowCreated(true);
    }
  };

  // Handle completion
  const handleComplete = () => {
    if (onComplete) {
      onComplete();
    } else {
      router.push("/dashboard");
    }
  };

  // Handle cancel
  const handleCancel = () => {
    router.push(`/dashboard/event/details?id=${booking?.eventId || ""}`);
  };

  // Determine escrow type
  const escrowType: EscrowType = booking?.preferences?.milestonePayments
    ? "multi_release"
    : "single_release";

  // Loading state
  if (isLoading) {
    return <LoadingSpinner />;
  }

  // Missing data
  if (!booking || !event) {
    return (
      <Card className="border-red-200 dark:border-red-800">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <p className="text-red-600 dark:text-red-400">
            Failed to load booking details
          </p>
          <Button
            variant="outline"
            onClick={() => window.location.reload()}
            className="mt-4"
          >
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Escrow created - show confirmation
  if (escrowCreated && escrowData) {
    return (
      <EscrowConfirmationView
        purchaseId={purchaseId}
        escrowData={escrowData}
        onComplete={handleComplete}
      />
    );
  }

  // Show escrow form
  return (
    <TrustlessWorkProvider>
      <WalletProvider>
        <EscrowProvider>
          <EventEscrowForm
            booking={booking}
            room={room || undefined}
            event={event}
            escrowType={escrowType}
            onEscrowCreated={handleEscrowCreated}
            onCancel={handleCancel}
          />
        </EscrowProvider>
      </WalletProvider>
    </TrustlessWorkProvider>
  );
}

export default TicketEscrowIntegration;
