import { cn } from "@/lib/utils";

interface EscrowStatusBadgeProps {
  status:
    | "PENDING"
    | "ACTIVE"
    | "FUNDED"
    | "COMPLETED"
    | "DISPUTED"
    | "RESOLVED"
    | "CANCELLED"
    | string;
  className?: string;
}

const statusConfig: Record<string, { className: string; icon: string; text: string }> = {
  PENDING: {
    className:
      "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800",
    icon: "🟡",
    text: "Pending",
  },
  ACTIVE: {
    className:
      "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800",
    icon: "🟢",
    text: "Active",
  },
  FUNDED: {
    className:
      "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800",
    icon: "🟢",
    text: "Funded",
  },
  COMPLETED: {
    className:
      "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800",
    icon: "🔵",
    text: "Completed",
  },
  RELEASED: {
    className:
      "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800",
    icon: "🔵",
    text: "Released",
  },
  DISPUTED: {
    className:
      "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800",
    icon: "🔴",
    text: "Disputed",
  },
  INDISPUTE: {
    className:
      "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800",
    icon: "🔴",
    text: "In Dispute",
  },
  RESOLVED: {
    className:
      "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800",
    icon: "⚖️",
    text: "Resolved",
  },
  CANCELLED: {
    className:
      "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700",
    icon: "⚪",
    text: "Cancelled",
  },
};

export function EscrowStatusBadge({
  status,
  className,
}: EscrowStatusBadgeProps) {
  const normalizedKey = status.toUpperCase().replace(/[_\s-]/g, "");
  const config =
    statusConfig[normalizedKey] ||
    statusConfig[status.toUpperCase()] || {
      className:
        "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300",
      icon: "ℹ️",
      text: status,
    };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border",
        config.className,
        className,
      )}
    >
      <span className="text-xs">{config.icon}</span>
      {config.text}
    </span>
  );
}

