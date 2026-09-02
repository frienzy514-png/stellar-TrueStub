"use client";

import { useState } from "react";
import { toast } from "sonner";
import { deleteUser } from "firebase/auth";
import { Download, Trash2 } from "lucide-react";
import { auth } from "@/lib/firebase";
import { fetchMockEscrows } from "@/lib/mockData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Escrows in any of these statuses are still "in flight" and must resolve
// (complete or get cancelled) before the account can be deleted.
const ACTIVE_ESCROW_STATUSES = [
  "pending",
  "funded",
  "transfer_confirmed",
  "transfer_finalized",
];
const DELETE_CONFIRMATION_PHRASE = "DELETE";

export function PrivacyDataSection() {
  const [isExporting, setIsExporting] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isCheckingEscrows, setIsCheckingEscrows] = useState(false);
  const [blockingEscrowCount, setBlockingEscrowCount] = useState<number | null>(null);
  const [confirmationText, setConfirmationText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleExport() {
    setIsExporting(true);
    try {
      const escrows = await fetchMockEscrows();
      const exportPayload = {
        exportedAt: new Date().toISOString(),
        profile: {
          uid: auth.currentUser?.uid ?? null,
          email: auth.currentUser?.email ?? null,
        },
        escrows,
      };

      const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `truestub-data-export-${Date.now()}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      toast.success("Your data export has started downloading.");
    } catch (error) {
      console.error("Failed to export account data:", error);
      toast.error("Couldn't export your data. Please try again.");
    } finally {
      setIsExporting(false);
    }
  }

  async function handleOpenDelete() {
    setIsDeleteOpen(true);
    setConfirmationText("");
    setIsCheckingEscrows(true);
    try {
      const escrows = await fetchMockEscrows();
      const activeCount = escrows.filter((escrow) =>
        ACTIVE_ESCROW_STATUSES.includes(escrow.status)
      ).length;
      setBlockingEscrowCount(activeCount);
    } catch (error) {
      console.error("Failed to check active escrows before deletion:", error);
      // Fail closed: block deletion if escrow state can't be confirmed.
      setBlockingEscrowCount(1);
    } finally {
      setIsCheckingEscrows(false);
    }
  }

  async function handleConfirmDelete() {
    if (confirmationText !== DELETE_CONFIRMATION_PHRASE) return;

    setIsDeleting(true);
    try {
      const user = auth.currentUser;
      if (!user) {
        throw new Error("No signed-in user to delete");
      }

      // TODO: also delete/anonymize the user's row and related records in
      // Hasura via a backend endpoint, mirroring how sync-user.ts performs
      // Hasura writes server-side. This call only removes the Firebase Auth
      // account.
      await deleteUser(user);

      toast.success("Your account has been deleted.");
      setIsDeleteOpen(false);
      window.location.href = "/login";
    } catch (error) {
      console.error("Failed to delete account:", error);
      const code = (error as { code?: string })?.code;
      if (code === "auth/requires-recent-login") {
        toast.error("Please log out and back in, then try deleting your account again.");
      } else {
        toast.error("Couldn't delete your account. Please try again.");
      }
    } finally {
      setIsDeleting(false);
    }
  }

  const hasBlockingEscrows = (blockingEscrowCount ?? 0) > 0;

  return (
    <div>
      <h3 className="text-sm font-semibold mb-3">Privacy & data</h3>
      <div className="border rounded-lg p-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Export your data</p>
            <p className="text-xs text-muted-foreground">
              Download a JSON file of your profile and escrow data.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={isExporting}>
            <Download className="mr-2 h-4 w-4" />
            {isExporting ? "Preparing…" : "Export data"}
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t">
          <div>
            <p className="text-sm font-medium text-destructive">Delete account</p>
            <p className="text-xs text-muted-foreground">
              Permanently delete your account. This cannot be undone.
            </p>
          </div>
          <Button variant="destructive" size="sm" onClick={handleOpenDelete}>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete account
          </Button>
        </div>
      </div>

      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete account</DialogTitle>
            <DialogDescription>
              {isCheckingEscrows
                ? "Checking for active escrows…"
                : hasBlockingEscrows
                ? "You have active or unresolved escrows. Please wait until they complete or are cancelled before deleting your account."
                : `This action cannot be undone. Type "${DELETE_CONFIRMATION_PHRASE}" to confirm.`}
            </DialogDescription>
          </DialogHeader>

          {!isCheckingEscrows && !hasBlockingEscrows && (
            <div className="space-y-1.5">
              <Label htmlFor="delete-confirmation">Confirmation</Label>
              <Input
                id="delete-confirmation"
                value={confirmationText}
                onChange={(e) => setConfirmationText(e.target.value)}
                placeholder={DELETE_CONFIRMATION_PHRASE}
                autoComplete="off"
              />
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setIsDeleteOpen(false)}>
              Cancel
            </Button>
            {!hasBlockingEscrows && (
              <Button
                type="button"
                variant="destructive"
                disabled={
                  isCheckingEscrows ||
                  isDeleting ||
                  confirmationText !== DELETE_CONFIRMATION_PHRASE
                }
                onClick={handleConfirmDelete}
              >
                {isDeleting ? "Deleting…" : "Delete account"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
