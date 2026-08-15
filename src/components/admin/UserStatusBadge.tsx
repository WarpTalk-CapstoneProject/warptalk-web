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
const STATUS_STYLES: Record<AdminUserStatus, { label: string; className: string }> = {
  active: {
    label: "Active",
    className: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  locked: {
    label: "Locked",
    className: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  deactivated: {
    label: "Deactivated",
    className: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  unverified: {
    label: "Unverified",
    className: "border-border bg-surface-2 text-ink-muted",
  },
  deleted: {
    label: "Deleted",
    className: "border-destructive/20 bg-destructive/10 text-destructive",
  },
};

export function UserStatusBadge({
  status,
  className,
}: {
  status: AdminUserStatus;
  className?: string;
}) {
  // An unknown status is shown as itself rather than crashing or being silently dropped: the
  // server owns this vocabulary, and a value this build has not been taught about is a real row.
  const style = STATUS_STYLES[status] ?? {
    label: status,
    className: "border-border bg-surface-2 text-ink-muted",
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
