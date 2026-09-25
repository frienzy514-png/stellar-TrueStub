import type { TicketListingData } from "@/interfaces/ticket-purchase-escrow.interface";

/**
 * Computes the total price for purchasing `quantity` units of a listing.
 *
 * - If the buyer is purchasing the full listing quantity and the listing
 *   defines a `bundlePrice`, the bundle price is used.
 * - Otherwise the total is `quantity * pricePerUnit`.
 *
 * Does not perform availability checks (e.g. quantity <= ticketQuantity,
 * or allowPartialPurchase) — callers are responsible for validating those
 * before calling this function.
 */
export function calculatePurchaseTotal(
  listing: Pick<TicketListingData, "ticketQuantity" | "pricePerUnit" | "bundlePrice">,
  quantity: number
): number {
  const isFullBundle = quantity === listing.ticketQuantity;

  if (isFullBundle && typeof listing.bundlePrice === "number") {
    return listing.bundlePrice;
  }

  return quantity * listing.pricePerUnit;
}

/**
 * Validates a requested purchase quantity against a listing's rules.
 * Returns a list of human-readable error messages (empty if valid).
 */
export function validatePurchaseQuantity(
  listing: Pick<TicketListingData, "ticketQuantity" | "allowPartialPurchase">,
  quantity: number
): string[] {
  const errors: string[] = [];

  if (!Number.isInteger(quantity) || quantity <= 0) {
    errors.push("Quantity must be a whole number greater than 0.");
    return errors;
  }

  if (quantity > listing.ticketQuantity) {
    errors.push(`Only ${listing.ticketQuantity} ticket(s) are available in this listing.`);
  }

  if (!listing.allowPartialPurchase && quantity !== listing.ticketQuantity) {
    errors.push("This seller requires the full bundle to be purchased.");
  }

  return errors;
}
