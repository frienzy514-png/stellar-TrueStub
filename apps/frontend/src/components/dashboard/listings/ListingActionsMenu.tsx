"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation } from "@apollo/client/react";
import { MoreHorizontal, Pencil, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DELETE_TICKET_LISTING } from "@/graphql/mutations/ticket-listing-mutations";

interface ListingActionsMenuProps {
  listingId: number;
  onDeleteConfirmed?: (id: number) => void;
}

export function ListingActionsMenu({ listingId, onDeleteConfirmed }: ListingActionsMenuProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [deleteListing, { loading: isDeleting }] = useMutation<{
    delete_ticket_listings_by_pk: { id: number } | null;
  }>(DELETE_TICKET_LISTING, {
    refetchQueries: ["GetTicketListings"],
  });

  const handleConfirmDelete = async () => {
    try {
      const { data } = await deleteListing({ variables: { id: listingId } });
      // Hasura returns null when the row is missing or not owned by the caller.
      if (!data?.delete_ticket_listings_by_pk) {
        toast.error("Listing could not be deleted.");
        return;
      }
      toast.success(`Listing ${listingId} deleted`);
      onDeleteConfirmed?.(listingId);
      setDeleteOpen(false);
    } catch {
      toast.error("Failed to delete listing. Please try again.");
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0" aria-label="Open listing actions">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild className="cursor-pointer">
            <Link href={`/dashboard/listings/${listingId}/offers`}>
              <Users className="mr-2 h-4 w-4" />
              View interested people
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="cursor-pointer">
            <Link href={`/dashboard/listings/${listingId}/edit`}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit listing
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="cursor-pointer text-destructive focus:text-destructive"
            onSelect={() => setDeleteOpen(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete listing
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete listing</DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete listing #{listingId}{" "}
              from your listings.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
