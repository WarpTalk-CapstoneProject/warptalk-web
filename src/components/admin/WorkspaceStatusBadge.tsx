import { cn } from "@/lib/utils";
import type { AdminWorkspaceStatus } from "@/types/admin-workspace";

const STATUS_STYLES: Record<AdminWorkspaceStatus, { label: string; className: string }> = {
  active: {
    label: "Active",
    className: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  suspended: {
    label: "Suspended",
    className: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  deleted: {
    label: "Deleted",
    className: "border-destructive/20 bg-destructive/10 text-destructive",
  },
};

export function WorkspaceStatusBadge({
  status,
  className,
}: {
  status: AdminWorkspaceStatus;
  className?: string;
}) {
  const style = STATUS_STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        style.className,
        className,
      )}
    >
      {style.label}
    </span>
  );
}
