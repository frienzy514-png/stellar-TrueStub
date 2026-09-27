"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShieldAlert, Scale, Clock, AlertTriangle, ExternalLink, CheckCircle, ArrowUpCircle, Gavel, Undo2 } from "lucide-react";

type DisputeStatus = "open" | "escalated" | "under_review" | "resolved" | "withdrawn";

interface DisputeArbitrationCardProps {
  contractId: string;
  engagementId?: string;
  disputeReason?: string;
  disputeDescription?: string;
  evidenceUrl?: string;
  arbitratorAddress?: string;
  status?: DisputeStatus;
  openedDate?: string;
  onEscalate?: (contractId: string) => void | Promise<void>;
  onResolve?: (contractId: string) => void | Promise<void>;
  onWithdraw?: (contractId: string) => void | Promise<void>;
}

export function DisputeArbitrationCard({
  contractId,
  engagementId,
  disputeReason = "Ticket delivery contested",
  disputeDescription = "Buyer reported that the ticket barcode was not delivered within the agreed transfer window.",
  evidenceUrl,
  arbitratorAddress = "GDISPUTE...RESOLVER",
  status = "under_review",
  openedDate = "Today",
  onEscalate,
  onResolve,
  onWithdraw,
}: DisputeArbitrationCardProps) {
  const [pendingAction, setPendingAction] = useState<"escalate" | "resolve" | "withdraw" | null>(null);

  const isTerminal = status === "resolved" || status === "withdrawn";
  const canEscalate = status === "open";
  const canResolve = status === "open" || status === "escalated" || status === "under_review";
  const canWithdraw = status === "open" || status === "escalated" || status === "under_review";

  const runAction = async (
    action: "escalate" | "resolve" | "withdraw",
    handler?: (contractId: string) => void | Promise<void>,
  ) => {
    if (!handler) return;
    try {
      setPendingAction(action);
      await handler(contractId);
    } finally {
      setPendingAction(null);
    }
  };

  const statusLabel =
    status === "resolved"
      ? "Resolved"
      : status === "withdrawn"
        ? "Withdrawn"
        : status === "escalated"
          ? "Escalated"
          : status === "open"
            ? "Open"
            : "Arbitration In Progress";

  return (
    <Card className="border-red-300 dark:border-red-900/60 bg-red-50/30 dark:bg-red-950/10 shadow-sm overflow-hidden">
      <CardHeader className="bg-red-100/50 dark:bg-red-950/30 border-b border-red-200 dark:border-red-900/40 pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
            <ShieldAlert className="h-5 w-5" />
            <CardTitle className="text-base font-semibold">Active On-Chain Dispute & Arbitration</CardTitle>
          </div>
          <Badge className="bg-red-600 text-white hover:bg-red-600 border-none uppercase text-[10px] tracking-wider w-fit">
            {statusLabel}
          </Badge>
        </div>
        <CardDescription className="text-xs text-red-600/80 dark:text-red-400/80">
          {isTerminal
            ? "This dispute has been closed. Escrow fund releases follow the recorded verdict."
            : "Escrow fund releases are suspended pending arbitrator verdict."}
        </CardDescription>
      </CardHeader>

      <CardContent className="p-5 space-y-4 text-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Dispute Reason
            </span>
            <p className="font-medium text-foreground">{disputeReason}</p>
          </div>

          <div className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Designated Arbitrator
            </span>
            <p className="font-mono text-xs text-foreground break-all flex items-center gap-1">
              <Scale className="h-3.5 w-3.5 text-red-500 shrink-0" />
              {arbitratorAddress}
            </p>
          </div>
        </div>

        <div className="space-y-1 bg-background/60 p-3 rounded-lg border border-border">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Claimant Statement
          </span>
          <p className="text-xs text-muted-foreground leading-relaxed mt-1">
            &ldquo;{disputeDescription}&rdquo;
          </p>
          {evidenceUrl && (
            <div className="mt-2 pt-2 border-t text-xs">
              <a
                href={evidenceUrl}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 hover:underline inline-flex items-center gap-1"
              >
                <ExternalLink className="h-3 w-3" /> View Submitted Evidence
              </a>
            </div>
          )}
        </div>

        {/* Timeline */}
        <div className="pt-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">
            Resolution Pipeline
          </span>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs border rounded-lg p-3 bg-background/40">
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-medium">
              <CheckCircle className="h-4 w-4" />
              <span>1. Dispute Raised ({openedDate})</span>
            </div>
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-medium">
              <Clock className="h-4 w-4 animate-pulse" />
              <span>2. Under Arbitrator Review</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground font-normal">
              <Scale className="h-4 w-4" />
              <span>3. Verdict & Fund Distribution</span>
            </div>
          </div>
        </div>

        {/* State machine actions: OPEN -> ESCALATED, OPEN|ESCALATED -> RESOLVED, OPEN|ESCALATED -> WITHDRAWN */}
        {!isTerminal && (
          <div className="pt-2 border-t border-border space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">
              Dispute Actions
            </span>
            <div className="flex flex-wrap gap-2">
              {canEscalate && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!onEscalate || pendingAction !== null}
                  onClick={() => runAction("escalate", onEscalate)}
                >
                  <ArrowUpCircle className="h-4 w-4 mr-1" />
                  {pendingAction === "escalate" ? "Escalating..." : "Escalate Dispute"}
                </Button>
              )}
              {canResolve && (
                <Button
                  type="button"
                  size="sm"
                  disabled={!onResolve || pendingAction !== null}
                  onClick={() => runAction("resolve", onResolve)}
                >
                  <Gavel className="h-4 w-4 mr-1" />
                  {pendingAction === "resolve" ? "Resolving..." : "Resolve Dispute"}
                </Button>
              )}
              {canWithdraw && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={!onWithdraw || pendingAction !== null}
                  onClick={() => runAction("withdraw", onWithdraw)}
                >
                  <Undo2 className="h-4 w-4 mr-1" />
                  {pendingAction === "withdraw" ? "Withdrawing..." : "Withdraw Dispute"}
                </Button>
              )}
            </div>
            {!onEscalate && !onResolve && !onWithdraw && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" />
                No dispute actions are available for your role on this contract.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
