"use client";

import { useState } from "react";
import { CheckCircle2, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  FLAG_SOURCE_LABEL,
  INITIAL_FLAGGED_LISTINGS,
  resolveFlag,
  type FlaggedListing,
} from "@/lib/moderation/flagged-listings";

// Admin-only: gated server-side by middleware.ts (/dashboard/admin requires the
// admin role). Actual approve/remove mutations must also be enforced by the
// backend — this UI is not the security boundary.
export default function ModerationQueuePage() {
  const [flags, setFlags] = useState<FlaggedListing[]>(INITIAL_FLAGGED_LISTINGS);

  const pending = flags.filter((f) => f.status === "pending");
  const resolved = flags.filter((f) => f.status !== "pending");

  const act = (flag: FlaggedListing, decision: "approved" | "removed") => {
    setFlags((prev) => resolveFlag(prev, flag.id, decision));
    toast.success(
      decision === "approved"
        ? `Approved "${flag.eventName}"`
        : `Removed "${flag.eventName}"`,
    );
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <ShieldAlert className="w-7 h-7 text-amber-600" />
        <div>
          <h1 className="text-2xl font-semibold">Moderation queue</h1>
          <p className="text-sm text-muted-foreground">
            Review flagged and reported listings.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pending review ({pending.length})</CardTitle>
          <CardDescription>
            Approve to keep a listing live, or remove it from the marketplace.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {pending.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nothing to review — the queue is clear.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Listing</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Flagged</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map((flag) => (
                  <TableRow key={flag.id}>
                    <TableCell>
                      <div className="font-medium">{flag.eventName}</div>
                      <div className="text-xs text-muted-foreground">
                        {flag.listingId} · seller {flag.sellerId} · ${flag.price}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{FLAG_SOURCE_LABEL[flag.source]}</Badge>
                    </TableCell>
                    <TableCell className="max-w-xs">{flag.reason}</TableCell>
                    <TableCell>
                      {new Date(flag.flaggedAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right space-x-2 whitespace-nowrap">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => act(flag, "approved")}
                      >
                        <CheckCircle2 className="w-4 h-4 mr-1" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => act(flag, "removed")}
                      >
                        <Trash2 className="w-4 h-4 mr-1" /> Remove
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {resolved.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Resolved ({resolved.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {resolved.map((flag) => (
              <div
                key={flag.id}
                className="flex items-center justify-between text-sm"
              >
                <span>{flag.eventName}</span>
                <Badge variant={flag.status === "removed" ? "destructive" : "secondary"}>
                  {flag.status === "removed" ? "Removed" : "Approved"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
