"use client";

import { EscrowStatusBadge } from "@/components/dashboard/EscrowStatusBadge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

const STUB_ESCROWS = [
  {
    id: "abc-123",
    event: "Coldplay Live — West Floor",
    amount: 4000,
    status: "PENDING" as const,
    createdAt: "2025-01-20",
  },
  {
    id: "def-456",
    event: "Costa Rica vs Mexico — East Stand",
    amount: 2500,
    status: "ACTIVE" as const,
    createdAt: "2025-01-15",
  },
  {
    id: "ghi-789",
    event: "Hamilton — Orchestra",
    amount: 6000,
    status: "COMPLETED" as const,
    createdAt: "2025-01-10",
  },
];

const FILTER_TABS = [
  "All",
  "Pending",
  "Active",
  "Completed",
  "Disputed",
] as const;

export default function EscrowPage() {
  const router = useRouter();
  const [activeFilter, setActiveFilter] =
    useState<(typeof FILTER_TABS)[number]>("All");

  const handleViewEscrow = (id: string) => {
    router.push(`/dashboard/escrow/${id}`);
  };

  const handleNewEscrow = () => {
    // TODO: Navigate to new escrow creation page
    console.log("Navigate to new escrow creation");
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const filteredEscrows = STUB_ESCROWS.filter((escrow) => {
    if (activeFilter === "All") return true;
    return escrow.status.toUpperCase() === activeFilter.toUpperCase();
  });

  return (
    <div className="space-y-6 w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
          My Escrows
        </h1>
        <Button
          onClick={handleNewEscrow}
          className="flex items-center gap-2 sm:w-auto w-fit"
        >
          <PlusIcon className="h-4 w-4" />
          New Escrow
        </Button>
      </div>

      {/* Filter Tabs */}
      <div className="border-b border-gray-200 dark:border-slate-700 overflow-hidden">
        <nav className="-mb-px space-x-3  lg:space-x-8 w-full flex gap-2 overflow-hidden whitespace-nowrap items-start">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveFilter(tab)}
              className={`
                py-2 px-1 border-b-2 lg:text-sm text-xs font-medium transition-colors whitespace-nowrap
                ${
                  activeFilter === tab
                    ? "border-blue-500 text-blue-600 dark:text-blue-400"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:border-slate-600"
                }
              `}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-800 shadow rounded-lg w-screen lg:w-full border border-gray-200 dark:border-slate-700">
        <div className="scrollbar-thin w-full ">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50 dark:bg-slate-700 border-b border-gray-200 dark:border-slate-700">
                <TableHead className="w-[100px] min-w-[100px] text-gray-600 dark:text-gray-300 font-semibold">ID</TableHead>
                <TableHead className="min-w-[200px] text-gray-600 dark:text-gray-300 font-semibold">Event</TableHead>
                <TableHead className="w-[120px] min-w-[120px] text-gray-600 dark:text-gray-300 font-semibold">
                  Amount
                </TableHead>
                <TableHead className="w-[120px] min-w-[120px] text-gray-600 dark:text-gray-300 font-semibold">
                  Status
                </TableHead>
                <TableHead className="w-[100px] min-w-[100px] text-right text-gray-600 dark:text-gray-300 font-semibold">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEscrows.length === 0 ? (
                <TableRow className="border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                  <TableCell
                    colSpan={5}
                    className="h-24 text-center text-gray-500 dark:text-slate-400"
                  >
                    No escrows found
                  </TableCell>
                </TableRow>
              ) : (
                filteredEscrows.map((escrow) => (
                  <TableRow key={escrow.id} className="overflow-scroll border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700/50">
                    <TableCell className="font-mono text-sm text-gray-500 dark:text-gray-400">
                      {escrow.id.slice(0, 8)}...
                    </TableCell>
                    <TableCell className="font-medium min-w-[200px] text-gray-900 dark:text-white">
                      <div className="truncate" title={escrow.event}>
                        {escrow.event}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium min-w-[120px] text-gray-900 dark:text-white">
                      {formatCurrency(escrow.amount)}
                    </TableCell>
                    <TableCell className="min-w-[120px]">
                      <EscrowStatusBadge status={escrow.status} />
                    </TableCell>
                    <TableCell className="text-right min-w-[100px]">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewEscrow(escrow.id)}
                        className="whitespace-nowrap bg-white border-gray-300 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-300"
                      >
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        <div className="px-4 sm:px-6 py-3 border-t border-gray-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="text-sm text-gray-700 dark:text-slate-300">
            Showing <span className="font-medium">1</span> to{" "}
            <span className="font-medium">{filteredEscrows.length}</span> of{" "}
            <span className="font-medium">{filteredEscrows.length}</span>{" "}
            results
          </div>
          <div className="flex items-center space-x-1">
            <Button 
              variant="outline" 
              size="sm" 
              disabled
              className="bg-white border-gray-300 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-400"
            >
              ←
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-600 dark:text-white dark:border-blue-500"
            >
              1
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              disabled
              className="bg-white border-gray-300 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-400"
            >
              2
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              disabled
              className="bg-white border-gray-300 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-400"
            >
              3
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              disabled
              className="bg-white border-gray-300 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-400"
            >
              →
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
