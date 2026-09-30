"use client";

import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import type { AdminWorkspaceStatus } from "@/types/admin-workspace";

const STATUS_CLASSNAMES: Record<AdminWorkspaceStatus, string> = {
  active: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  suspended: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  deleted: "border-destructive/20 bg-destructive/10 text-destructive",
};

export function WorkspaceStatusBadge({
  status,
  className,
}: {
  status: AdminWorkspaceStatus;
  className?: string;
}) {
  const t = useTranslations("adminWorkspaces.statusBadge");
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        STATUS_CLASSNAMES[status],
        className,
      )}
    >
      {t(status)}
    </span>
  );
}
