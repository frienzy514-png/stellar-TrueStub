"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert, Scale, Clock, AlertTriangle, ExternalLink, CheckCircle } from "lucide-react";

interface DisputeArbitrationCardProps {
  contractId: string;
  engagementId?: string;
  disputeReason?: string;
  disputeDescription?: string;
  evidenceUrl?: string;
  arbitratorAddress?: string;
  status?: "open" | "under_review" | "resolved";
  openedDate?: string;
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
}: DisputeArbitrationCardProps) {
  return (
    <Card className="border-red-300 dark:border-red-900/60 bg-red-50/30 dark:bg-red-950/10 shadow-sm overflow-hidden">
      <CardHeader className="bg-red-100/50 dark:bg-red-950/30 border-b border-red-200 dark:border-red-900/40 pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
            <ShieldAlert className="h-5 w-5" />
            <CardTitle className="text-base font-semibold">Active On-Chain Dispute & Arbitration</CardTitle>
          </div>
          <Badge className="bg-red-600 text-white hover:bg-red-600 border-none uppercase text-[10px] tracking-wider w-fit">
            Arbitration In Progress
          </Badge>
        </div>
        <CardDescription className="text-xs text-red-600/80 dark:text-red-400/80">
          Escrow fund releases are suspended pending arbitrator verdict.
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
      </CardContent>
    </Card>
  );
}
