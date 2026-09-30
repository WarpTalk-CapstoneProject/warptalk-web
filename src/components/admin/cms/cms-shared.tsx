"use client";

/**
 * Pieces the two admin CMS screens (Announcements, Email templates) share, so their card grids
 * read as one system: the card shell, the status chip, and "edited when, by whom".
 */

import type { ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";

import { useAdminUserDetail } from "@/hooks/use-admin-users";
import { cn } from "@/lib/utils";

/** The responsive grid both CMS screens lay their cards out in. */
export function CmsCardGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <ul className={cn("grid gap-3 sm:grid-cols-2 xl:grid-cols-3", className)}>{children}</ul>
  );
}

export function CmsCard({
  children,
  accentClassName,
  className,
}: {
  children: ReactNode;
  /** A thin top rule in the item's colour (announcement type). */
  accentClassName?: string;
  className?: string;
}) {
  return (
    <li
      className={cn(
        "group relative flex min-h-[220px] flex-col overflow-hidden rounded-lg border border-border bg-surface-1 transition-colors hover:border-ink/20",
        className,
      )}
    >
      {accentClassName ? <span className={cn("h-0.5 w-full", accentClassName)} aria-hidden /> : null}
      {children}
    </li>
  );
}

export function CmsChip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        className,
      )}
    >
      {children}
    </span>
  );
}

export const CHIP_TONES = {
  positive: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  neutral: "border-border bg-surface-2 text-ink-muted",
  info: "border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  accent: "border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  warning: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
} as const;

export function useCmsDateFormatter() {
  const locale = useLocale();
  return (value: string | null | undefined) => {
    if (!value) return "—";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "—";
    return new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(parsed);
  };
}

/** "Edited 24 Sep 2026, 10:12 by Linh Nguyen". The name resolves from the admin user directory. */
export function EditedBy({ at, by }: { at: string | null; by: string | null }) {
  const t = useTranslations("adminCms.common");
  const formatDate = useCmsDateFormatter();
  const author = useAdminUserDetail(by ?? undefined);
  const name = author.data?.user.fullName || author.data?.user.email;
  if (!at) return null;
  return (
    <span className="truncate">
      {name ? t("editedBy", { date: formatDate(at), name }) : t("editedAt", { date: formatDate(at) })}
    </span>
  );
}
