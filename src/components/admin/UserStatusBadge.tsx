import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import type { AdminUserStatus } from "@/types/admin-user";

/**
 * Five states, three colours. Locked and deactivated share amber because both mean "cannot sign
 * in right now" — what separates them is whether it clears itself, and that belongs in the label
 * rather than in a fourth hue nobody can name at a glance.
 *
 * Unverified is deliberately NOT amber: an account that has simply never confirmed its email is
 * the normal state of a fresh sign-up, not something an administrator has to act on.
 */
const STATUS_CLASSNAMES: Record<AdminUserStatus, string> = {
  active: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  locked: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  deactivated: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  unverified: "border-border bg-surface-2 text-ink-muted",
  deleted: "border-destructive/20 bg-destructive/10 text-destructive",
};

export function UserStatusBadge({
  status,
  className,
}: {
  status: AdminUserStatus;
  className?: string;
}) {
  const t = useTranslations("adminUsers.statusBadge");

  // An unknown status is shown as itself rather than crashing or being silently dropped: the
  // server owns this vocabulary, and a value this build has not been taught about is a real row.
  const isKnownStatus = status in STATUS_CLASSNAMES;
  const style = {
    label: isKnownStatus ? t(status as AdminUserStatus) : status,
    className: isKnownStatus
      ? STATUS_CLASSNAMES[status]
      : "border-border bg-surface-2 text-ink-muted",
  };

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
