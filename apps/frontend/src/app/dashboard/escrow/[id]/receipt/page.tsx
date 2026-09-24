import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { getStubEscrow } from "@/components/escrow/views/stubEscrow";
import { PrintReceiptButton } from "@/components/escrow/PrintReceiptButton";
import { formatEscrowAmount } from "@/lib/formatEscrowAmount";
import { isFeatureEnabled } from "@/lib/featureFlags";

export const dynamic = "force-dynamic";

const explorerNetwork =
  process.env.NEXT_PUBLIC_TRUSTLESS_NETWORK === "mainnet" ? "public" : "testnet";

export default async function EscrowReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!isFeatureEnabled("ESCROW_RECEIPTS")) notFound();

  const { id } = await params;
  // TODO: replace with GET_ESCROW_BY_ID once GraphQL wiring lands.
  const escrow = getStubEscrow(id);
  const amount = formatEscrowAmount(escrow.amount, escrow.currency);
  const explorerUrl = `https://stellar.expert/explorer/${explorerNetwork}/contract/${encodeURIComponent(escrow.id)}`;

  const rows: [string, string][] = [
    ["Receipt for", escrow.invoiceNumber],
    ["Event / listing", escrow.subject],
    ["Amount", amount],
    ["Buyer", `${escrow.tenant.name} (${escrow.tenant.wallet})`],
    ["Seller", `${escrow.beneficiary.name} (${escrow.beneficiary.wallet})`],
    ["Issued", escrow.issued],
    ["Completed", escrow.beneficiary.releasedDate],
    ["Escrow contract", escrow.id],
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <Link
          href={`/dashboard/escrow/${encodeURIComponent(id)}`}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-900 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to escrow
        </Link>
        <PrintReceiptButton />
      </div>

      <article className="print-receipt rounded-2xl border border-gray-200 bg-white p-8 text-gray-900 shadow-sm">
        <header className="border-b border-gray-200 pb-4">
          <p className="text-sm font-medium text-blue-600">TrueStub</p>
          <h1 className="text-2xl font-semibold">Escrow receipt</h1>
          <p className="text-sm text-gray-500">Transaction complete</p>
        </header>

        <dl className="mt-6 grid gap-4 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-6">
              <dt className="text-gray-500">{label}</dt>
              <dd className="break-all text-right font-medium">{value}</dd>
            </div>
          ))}
        </dl>

        <footer className="mt-8 border-t border-gray-200 pt-4 text-xs text-gray-500">
          <p>
            Verify this transaction on the Stellar network:{" "}
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 break-all text-blue-600 underline"
            >
              {explorerUrl}
              <ExternalLink className="h-3 w-3 print:hidden" />
            </a>
          </p>
        </footer>
      </article>
    </div>
  );
}
