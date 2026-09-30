"use client";

/**
 * Small pieces the /admin/staff and /admin/roles pages share (G10): badges, the role picker, and
 * the reason dialog every destructive staff action goes through.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Crown, WarningCircle } from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ALL_ADMIN_PERMISSIONS } from "@/lib/admin/staff-permissions";
import { getErrorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import type { StaffRoleDto, StaffStatus } from "@/types/admin-staff";

/** Same minimum the account actions use: long enough to say why, which is the point of asking. */
export const MIN_REASON_LENGTH = 10;

const STATUS_CLASSNAMES: Record<StaffStatus, string> = {
  active: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  suspended: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
};

export function StaffStatusBadge({ status, accountActive }: { status: StaffStatus; accountActive: boolean }) {
  const t = useTranslations("adminStaff.status");
  // A staff row over a deactivated ACCOUNT has no access either; say so rather than show "Active".
  const label = !accountActive ? t("accountDeactivated") : t(status);
  const className = !accountActive ? STATUS_CLASSNAMES.suspended : STATUS_CLASSNAMES[status] ?? STATUS_CLASSNAMES.suspended;
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium", className)}>
      {label}
    </span>
  );
}

export function StaffRoleBadge({ name, isSuperAdmin }: { name: string; isSuperAdmin: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 truncate rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
        isSuperAdmin
          ? "border-violet-500/25 bg-violet-500/10 text-violet-700 dark:text-violet-300"
          : "border-hairline bg-surface-2 text-ink",
      )}
    >
      {isSuperAdmin ? <Crown size={11} weight="fill" /> : null}
      <span className="truncate">{name}</span>
    </span>
  );
}

export function formatStaffDate(value: string | null | undefined, locale: string): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

/**
 * The roles to choose from, as cards: name, what it is for, and how much it grants. Roles the
 * chooser may not grant are shown disabled rather than hidden, with the reason — a missing option
 * reads as a bug, a disabled one with "beyond your own permissions" reads as a rule.
 */
export function RoleChoiceList({
  roles,
  value,
  onChange,
  isGrantable,
  currentRoleId,
}: {
  roles: readonly StaffRoleDto[];
  value: string | null;
  onChange: (roleId: string) => void;
  isGrantable: (role: StaffRoleDto) => boolean;
  currentRoleId?: string;
}) {
  const t = useTranslations("adminStaff.roleChoice");
  return (
    <div role="radiogroup" className="grid max-h-[320px] gap-1.5 overflow-y-auto pr-1">
      {roles.map((role) => {
        const grantable = isGrantable(role);
        const isCurrent = role.id === currentRoleId;
        const selected = value === role.id;
        return (
          <button
            key={role.id}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={!grantable || isCurrent}
            onClick={() => onChange(role.id)}
            className={cn(
              "rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
              selected ? "border-ink/40 bg-surface-2" : "border-hairline hover:bg-surface-2/60",
              (!grantable || isCurrent) && "cursor-not-allowed opacity-55 hover:bg-transparent",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <StaffRoleBadge name={role.name} isSuperAdmin={role.isSuperAdmin} />
              <span className="shrink-0 text-[11px] text-ink-subtle">
                {role.isSuperAdmin
                  ? t("allPermissions")
                  : t("permissionCount", { count: role.permissions.length, total: ALL_ADMIN_PERMISSIONS.length })}
              </span>
            </div>
            {role.description ? <p className="mt-1 text-[12px] leading-5 text-ink-muted">{role.description}</p> : null}
            {isCurrent ? <p className="mt-1 text-[11px] text-ink-subtle">{t("current")}</p> : null}
            {!grantable && !isCurrent ? <p className="mt-1 text-[11px] text-ink-subtle">{t("beyondYou")}</p> : null}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Confirm-with-a-reason for suspend, reactivate, remove, revoke and delete. The server requires
 * the reason and writes it to the audit log before the change commits; a failure here usually
 * means nothing happened, which is what the error copy says.
 */
export function StaffReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  subject,
  confirmLabel,
  pendingLabel,
  destructive = false,
  onSubmit,
  isSaving,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  subject?: { primary: string; secondary?: string };
  confirmLabel: string;
  pendingLabel: string;
  destructive?: boolean;
  onSubmit: (reason: string) => Promise<unknown>;
  isSaving: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 sm:max-w-md">
        {open ? (
          <ReasonForm
            title={title}
            description={description}
            subject={subject}
            confirmLabel={confirmLabel}
            pendingLabel={pendingLabel}
            destructive={destructive}
            onCancel={() => onOpenChange(false)}
            onSubmit={onSubmit}
            onDone={() => onOpenChange(false)}
            isSaving={isSaving}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ReasonForm({
  title,
  description,
  subject,
  confirmLabel,
  pendingLabel,
  destructive,
  onCancel,
  onSubmit,
  onDone,
  isSaving,
}: {
  title: string;
  description: string;
  subject?: { primary: string; secondary?: string };
  confirmLabel: string;
  pendingLabel: string;
  destructive: boolean;
  onCancel: () => void;
  onSubmit: (reason: string) => Promise<unknown>;
  onDone: () => void;
  isSaving: boolean;
}) {
  const t = useTranslations("adminStaff.reasonDialog");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const trimmed = reason.trim();
    if (trimmed.length < MIN_REASON_LENGTH) {
      setError(t("reasonTooShort", { count: MIN_REASON_LENGTH }));
      return;
    }
    try {
      setError(null);
      await onSubmit(trimmed);
      onDone();
    } catch (err) {
      setError(getErrorMessage(err, t("genericError")));
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <div className="mt-4 grid gap-3">
        {subject ? (
          <div className="rounded-lg border border-hairline/60 px-3 py-2 text-[12px]">
            <p className="font-medium text-ink">{subject.primary}</p>
            {subject.secondary ? <p className="mt-0.5 text-[11px] text-ink-subtle">{subject.secondary}</p> : null}
          </div>
        ) : null}
        <div>
          <Label htmlFor="staff-reason" className="text-[12px] text-ink-muted">
            {t("reasonLabel")}
          </Label>
          <Textarea
            id="staff-reason"
            className="mt-1.5"
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t("reasonPlaceholder")}
          />
        </div>
        {error ? <InlineError message={error} /> : null}
      </div>
      <DialogFooter className="mt-5">
        <Button variant="outline" onClick={onCancel} disabled={isSaving}>
          {t("back")}
        </Button>
        <Button variant={destructive ? "destructive" : "default"} onClick={() => void submit()} disabled={isSaving}>
          {isSaving ? pendingLabel : confirmLabel}
        </Button>
      </DialogFooter>
    </>
  );
}

export function InlineError({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-[12px] text-destructive"
    >
      <WarningCircle size={14} weight="duotone" className="mt-0.5 shrink-0" />
      {message}
    </p>
  );
}
