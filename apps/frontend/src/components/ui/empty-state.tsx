import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  variant?: "empty" | "error";
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  variant = "empty",
  className,
}: EmptyStateProps) {
  const isError = variant === "error";

  return (
    <div
      role={isError ? "alert" : undefined}
      className={cn(
        "flex flex-col items-center justify-center gap-2 px-4 py-12 text-center",
        className,
      )}
    >
      <div
        className={cn(
          "flex h-12 w-12 items-center justify-center rounded-full",
          isError
            ? "bg-red-50 dark:bg-red-900/20"
            : "bg-gray-100 dark:bg-slate-700",
        )}
      >
        <Icon
          className={cn(
            "h-6 w-6",
            isError
              ? "text-red-500 dark:text-red-400"
              : "text-gray-400 dark:text-slate-400",
          )}
        />
      </div>
      <p className="text-sm font-medium text-gray-900 dark:text-white">
        {title}
      </p>
      {description && (
        <p className="max-w-sm text-sm text-gray-500 dark:text-slate-400">
          {description}
        </p>
      )}
      {actionLabel && onAction && (
        <Button
          variant={isError ? "outline" : "default"}
          size="sm"
          onClick={onAction}
          className="mt-2"
        >
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
