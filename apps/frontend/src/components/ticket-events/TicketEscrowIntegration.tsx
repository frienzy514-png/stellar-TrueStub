"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  BookingData,
  EventData,
  RoomData,
  EscrowResponse,
  EscrowType,
} from "@/interfaces/booking-escrow.interface";
import { EventEscrowForm } from "./EventEscrowForm";
import {
  fetchBookingEscrowContext,
  recordBookingEscrow,
} from "@/lib/booking-escrow-api";

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
  bookingId: string;
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
  bookingId,
  escrowData,
  onComplete,
}: {
  bookingId: string;
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
 * TicketEscrowIntegration Component
 * 
 * Main integration component for the event booking escrow flow
 */
export function TicketEscrowIntegration({
  bookingId,
  onComplete,
}: TicketEscrowIntegrationProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [escrowCreated, setEscrowCreated] = useState(false);
  const [escrowData, setEscrowData] = useState<EscrowResponse | null>(null);

  // Data states
  const [booking, setBooking] = useState<BookingData | null>(null);
  const [event, setEvent] = useState<EventData | null>(null);
  const [room, setRoom] = useState<RoomData | null>(null);

  // Load data on mount
  useEffect(() => {
    async function loadData() {
      try {
        setIsLoading(true);
        
        const context = await fetchBookingEscrowContext(bookingId);
        setBooking(context.booking);
        setEvent(context.event);
        setRoom(context.room);
      } catch (error) {
        console.error("Failed to load data:", error);
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [bookingId]);

  // Handle escrow creation success
  const handleEscrowCreated = async (escrowResponse: EscrowResponse) => {
    try {
      // Update booking with escrow details
      await recordBookingEscrow(bookingId, {
        contractId: escrowResponse.contractId,
        escrowStatus: escrowResponse.status,
        amount: booking?.totalAmount ?? 0,
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
        bookingId={bookingId}
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
