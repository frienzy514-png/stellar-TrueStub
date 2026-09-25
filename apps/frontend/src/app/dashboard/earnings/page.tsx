"use client";

import { SellerEarnings } from "@/components/dashboard/SellerEarnings";
import type { PayoutEscrow } from "@/lib/earnings";

// TODO: replace with Apollo query → public.escrow_transactions (Hasura), filtered
// to the signed-in seller's released escrows.
const STUB_PAYOUTS: PayoutEscrow[] = [
  { id: "p1", listingName: "Hamilton", amount: 265, currency: "USDC", status: "released", releasedAt: "2026-05-12T15:00:00Z" },
  { id: "p2", listingName: "Swan Lake", amount: 145, currency: "USDC", status: "released", releasedAt: "2026-06-03T18:30:00Z" },
  { id: "p3", listingName: "Costa Rica vs. Mexico", amount: 190, currency: "USDC", status: "released", releasedAt: "2026-06-21T12:00:00Z" },
  { id: "p4", listingName: "Monster Jam", amount: 95, currency: "USDC", status: "released", releasedAt: "2026-07-09T09:15:00Z" },
  { id: "p5", listingName: "Coldplay", amount: 405, currency: "USDC", status: "released", releasedAt: "2026-08-02T20:00:00Z" },
  { id: "p6", listingName: "Karol G", amount: 320, currency: "USDC", status: "funded" },
];

export default function EarningsPage() {
  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">Earnings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Payouts from completed sales, released from escrow to your wallet.
        </p>
      </div>
      <SellerEarnings escrows={STUB_PAYOUTS} />
    </div>
  );
}
