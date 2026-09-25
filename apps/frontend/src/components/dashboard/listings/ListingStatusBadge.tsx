import { cn } from "@/lib/utils";

export type ListingOccupancyStatus = "available" | "unavailable";

export const STATUS_STYLES: Record<ListingOccupancyStatus, string> = {
  available: "bg-green-100 text-green-800",
  unavailable: "bg-gray-800 text-white",
};

const STATUS_LABEL: Record<ListingOccupancyStatus, string> = {
  available: "Available",
  unavailable: "Unavailable",
};

interface ListingStatusBadgeProps {
  status: ListingOccupancyStatus;
  className?: string;
}

export function ListingStatusBadge({ status, className }: ListingStatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        STATUS_STYLES[status],
        className,
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
