export type EscrowViewKind = "paid" | "blocked" | "released" | "disputed" | "pending";

/**
 * Maps backend escrow.status to the detail-page view.
 * @see issue: status-driven escrow detail waterfall
 */
export function getViewForStatus(status: string): EscrowViewKind {
  switch (status.toLowerCase()) {
    case "funded":
      return "paid";
    case "active":
      return "blocked";
    case "completed":
    case "released":
      return "released";
    case "disputed":
    case "indispute":
      return "disputed";
    default:
      return "pending";
  }
}

