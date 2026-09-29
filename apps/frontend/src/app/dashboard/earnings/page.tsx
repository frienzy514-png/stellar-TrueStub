"use client";

import { useQuery } from "@apollo/client";
import { gql } from "@apollo/client";
import { SellerEarnings } from "@/components/dashboard/SellerEarnings";
import type { PayoutEscrow } from "@/lib/earnings";

const SELLER_ESCROWS = gql`
  query SellerEscrows($sellerId: uuid!) {
    escrow_transactions(
      where: { seller_id: { _eq: $sellerId } }
      order_by: { released_at: desc }
    ) {
      id
      listing_name
      amount
      currency
      status
      released_at
    }
  }
`;

type EscrowRow = {
  id: string;
  listing_name: string;
  amount: number;
  currency: string;
  status: string;
  released_at: string | null;
};

function toPayoutEscrow(row: EscrowRow): PayoutEscrow {
  return {
    id: row.id,
    listingName: row.listing_name,
    amount: row.amount,
    currency: row.currency,
    status: row.status === "released" ? "released" : "funded",
    releasedAt: row.released_at ?? undefined,
  };
}

export default function EarningsPage() {
  const sellerId = process.env.NEXT_PUBLIC_SELLER_ID;

  const { data, loading, error } = useQuery<{ escrow_transactions: EscrowRow[] }>(
    SELLER_ESCROWS,
    { variables: { sellerId }, skip: !sellerId }
  );

  const escrows: PayoutEscrow[] = (data?.escrow_transactions ?? []).map(toPayoutEscrow);

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">Earnings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Payouts from completed sales, released from escrow to your wallet.
        </p>
      </div>
      {loading ? (
        <p className="text-muted-foreground text-sm">Loading earnings…</p>
      ) : error ? (
        <p className="text-destructive text-sm">
          Could not load earnings. Please try again.
        </p>
      ) : escrows.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No completed escrows yet. Your released payouts will appear here.
        </p>
      ) : (
        <SellerEarnings escrows={escrows} />
      )}
    </div>
  );
}
