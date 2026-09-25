"use client";

import { Copy, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { exportWalletsToCSV } from "@/lib/exportToCSV";

const PAGE_SIZE_OPTIONS = [5, 10, 25] as const;
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

interface WalletEntry {
  address: string;
  fullAddress?: string;
  isPrimary: boolean;
  network: string;
}

interface WalletAddressTableProps {
  wallets: WalletEntry[];
  /** Show skeleton rows instead of wallet data while a query resolves. */
  isLoading?: boolean;
}

function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export function WalletAddressTable({ wallets }: WalletAddressTableProps) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(5);

  const totalItems = wallets.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const pageItems = wallets.slice(startIndex, startIndex + pageSize);

  async function handleCopy(wallet: WalletEntry) {
    try {
      await navigator.clipboard.writeText(wallet.fullAddress ?? wallet.address);
    } catch (err) {
      console.error("Failed to copy address:", err);
    }
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  }

  function handleExport() {
    exportWalletsToCSV(
      wallets.map((w) => ({
        address: w.fullAddress ?? w.address,
        network: w.network,
        isPrimary: w.isPrimary,
      })),
    );
  }

  const sortedWallets = useMemo(() => {
    if (!sortKey) return wallets;

    const sorted = [...wallets].sort((a, b) => {
      let comparison = 0;
      switch (sortKey) {
        case "address":
          comparison = (a.fullAddress ?? a.address).localeCompare(b.fullAddress ?? b.address);
          break;
        case "network":
          comparison = a.network.localeCompare(b.network);
          break;
        case "isPrimary":
          comparison = Number(a.isPrimary) - Number(b.isPrimary);
          break;
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });

    return sorted;
  }, [wallets, sortKey, sortDirection]);

  const SortableHeader = ({ sortKey: key, label, className }: { sortKey: SortKey; label: string; className?: string }) => (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => handleSort(key)}
        className="flex items-center gap-1 font-medium text-foreground hover:text-foreground/80 transition-colors"
      >
        {label}
        {sortKey === key ? (
          sortDirection === "asc" ? (
            <ArrowUp className="h-3.5 w-3.5" />
          ) : (
            <ArrowDown className="h-3.5 w-3.5" />
          )
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
        )}
      </button>
    </TableHead>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Wallet Addresses
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={handleExport}
            disabled={wallets.length === 0}
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
          <Button variant="outline" size="sm" className="gap-1" onClick={onAddWallet}>
            <Plus className="h-4 w-4" />
            Add Wallet
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Address</TableHead>
                <TableHead>Network</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="h-16 text-center text-muted-foreground">
                    No wallet addresses found.
                  </TableCell>
                </TableRow>
              ) : (
                pageItems.map((wallet) => (
                  <TableRow key={wallet.address}>
                    <TableCell className="font-mono text-sm">
                      {truncateAddress(wallet.address)}
                      {wallet.isPrimary && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                          Primary
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{wallet.network}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopy(wallet)}
                        className="gap-1"
                      >
                        <Copy className="h-4 w-4" />
                        Copy
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination controls — only shown when total rows exceed minimum page size */}
        {totalItems > PAGE_SIZE_OPTIONS[0] && (
          <div className="flex items-center justify-between pt-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <span>Rows per page:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value) as PageSize);
                  setPage(1);
                }}
                className="rounded border border-input bg-background px-2 py-1 text-sm"
                aria-label="Rows per page"
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span>
                {totalItems === 0
                  ? '0 results'
                  : `${startIndex + 1}–${Math.min(startIndex + pageSize, totalItems)} of ${totalItems}`}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
