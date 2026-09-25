"use client";

import { Button } from "@/components/ui/button";
import { useGlobalAuthenticationStore } from "@/core/store/data";
import { Copy, Wallet } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

function truncateAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-6)}`;
}

export function ConnectedWalletSection() {
  const { address, name } = useGlobalAuthenticationStore();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="w-full">
      <h2 className="text-lg font-semibold mb-4">Connected wallet</h2>

      <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6">
        {address ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                <Wallet className="w-5 h-5 text-orange-600" />
              </div>
              <div className="min-w-0">
                <p className="font-medium">{name || "Stellar wallet"}</p>
                <p
                  className="text-sm text-muted-foreground font-mono truncate"
                  title={address}
                >
                  {truncateAddress(address)}
                </p>
              </div>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
              <Copy className="w-4 h-4 mr-2" />
              {copied ? "Copied" : "Copy address"}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="font-medium">No wallet connected</p>
              <p className="text-sm text-muted-foreground">
                Connect a Stellar wallet to buy tickets and receive escrow payouts.
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/login">Connect wallet</Link>
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
