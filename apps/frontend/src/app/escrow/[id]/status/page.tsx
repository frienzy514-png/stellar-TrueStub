import type { Metadata } from "next";
import { CheckCircle2, Clock, ShieldAlert, Wallet, SearchX } from "lucide-react";

import {
  getPublicEscrowStatus,
  type PublicEscrowStatus,
} from "@/lib/server/hasura";

// Status changes over time and must never be served from a shared cache.
export const dynamic = "force-dynamic";

// Shared links shouldn't be indexed, and the ID shouldn't leak via referrer.
export const metadata: Metadata = {
  title: "Escrow status",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const STATUS_VIEW: Record<
  PublicEscrowStatus,
  { label: string; description: string; icon: typeof Clock; tone: string }
> = {
  pending: {
    label: "Pending",
    description: "The escrow has been created and is waiting to be funded.",
    icon: Clock,
    tone: "text-amber-600 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400",
  },
  funded: {
    label: "Funded",
    description: "Funds are securely held in escrow until the transfer completes.",
    icon: Wallet,
    tone: "text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400",
  },
  released: {
    label: "Released",
    description: "The transfer is complete and funds have been released.",
    icon: CheckCircle2,
    tone: "text-blue-600 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400",
  },
  disputed: {
    label: "Disputed",
    description: "A dispute has been raised and is under review.",
    icon: ShieldAlert,
    tone: "text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400",
  },
};

export default async function PublicEscrowStatusPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getPublicEscrowStatus(id);
  const view = result ? STATUS_VIEW[result.status] : null;

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-950 p-4">
      <div className="w-full max-w-md rounded-xl border bg-white dark:bg-gray-900 p-8 text-center shadow-sm">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          TrueStub escrow status
        </p>

        {view ? (
          <>
            <div
              className={`mx-auto mt-6 flex h-16 w-16 items-center justify-center rounded-full ${view.tone}`}
            >
              <view.icon className="h-8 w-8" aria-hidden="true" />
            </div>
            <h1 className="mt-4 text-2xl font-semibold" data-testid="escrow-status">
              {view.label}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">{view.description}</p>
          </>
        ) : (
          <>
            <div className="mx-auto mt-6 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 text-gray-500 dark:bg-gray-800">
              <SearchX className="h-8 w-8" aria-hidden="true" />
            </div>
            <h1 className="mt-4 text-2xl font-semibold">Escrow not found</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              We couldn&apos;t find an escrow for this link. Check the link and try again.
            </p>
          </>
        )}

        <p className="mt-6 text-xs text-muted-foreground">
          This page only shows the current status. Sign in to view full details.
        </p>
      </div>
    </main>
  );
}
