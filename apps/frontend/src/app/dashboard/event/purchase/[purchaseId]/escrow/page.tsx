"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { TicketEscrowWrapper } from "@/components/ticket-purchase";

/**
 * Ticket Purchase Escrow Creation Page
 *
 * Route: /dashboard/event/purchase/[purchaseId]/escrow
 *
 * This page allows buyers to create a secure escrow contract
 * for their ticket purchase using Trustless Work's blockchain escrow system.
 */
export default function PurchaseEscrowPage() {
  const params = useParams();
  const router = useRouter();
  const purchaseId = params?.purchaseId as string;

  const handleComplete = () => {
    router.push(`/dashboard/event/purchase/${purchaseId}/confirmation`);
  };

  if (!purchaseId) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
            Purchase ID Required
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            Please provide a valid purchase ID to create an escrow.
          </p>
          <button
            onClick={() => router.push("/dashboard/event")}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
          >
            Go to Events
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="container mx-auto px-4 py-8">
        <TicketEscrowWrapper
          purchaseId={purchaseId}
          onComplete={handleComplete}
        />
      </div>
    </div>
  );
}
