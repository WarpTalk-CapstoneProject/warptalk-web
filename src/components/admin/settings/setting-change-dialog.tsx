"use client";

/**
 * The confirmation every setting write goes through: old → new at a named scope, the notices the
 * setting carries (risky, security, restart), and a reason — required for risky and Security
 * settings, optional otherwise. Sends the version that was read; a 409 means someone else saved
 * first, and the dialog says so and offers to reload rather than overwrite them.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, ArrowsClockwise, ShieldWarning, Warning } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAdminPlatformSettingsActions } from "@/hooks/use-admin-platform-settings";
import {
  buildSettingDiff,
  MIN_SETTING_REASON_LENGTH,
  reasonIsValid,
  type SettingScopeRef,
} from "@/lib/admin/platform-settings";
import { apiErrorCode, getErrorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import type { PlatformSettingDto, SettingJson } from "@/types/admin-platform-settings";

import { useSettingsCopy } from "./settings-i18n";

export interface PendingSettingChange {
  setting: PlatformSettingDto;
  scope: SettingScopeRef;
  /** The new stored value, or null to remove what is stored at this scope (reset). */
  next: SettingJson | null;
}

export function SettingChangeDialog({
  pending,
  onClose,
  onSaved,
  onReload,
}: {
  pending: PendingSettingChange | null;
  onClose: () => void;
  onSaved: () => void;
  onReload: () => void;
}) {
  return (
    <Dialog open={pending !== null} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto sm:max-w-lg">
        {pending ? <ChangeForm pending={pending} onClose={onClose} onSaved={onSaved} onReload={onReload} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function ChangeForm({
  pending,
  onClose,
  onSaved,
  onReload,
}: {
  pending: PendingSettingChange;
  onClose: () => void;
  onSaved: () => void;
  onReload: () => void;
}) {
  const t = useTranslations("adminPlatformSettings.confirm");
  const copy = useSettingsCopy();
  const actions = useAdminPlatformSettingsActions();
  const { setting, scope, next } = pending;
  const diff = buildSettingDiff(setting, scope, next);
  const [reason, setReason] = useState("");
  const [failure, setFailure] = useState<{ kind: "conflict" | "error"; message: string } | null>(null);
  const saving = actions.set.isPending || actions.reset.isPending;
  const reasonOk = reasonIsValid(reason, diff.requiresReason);
  const isOverride = scope.scopeType !== "platform";

  const submit = async () => {
    setFailure(null);
    const trimmed = reason.trim() || undefined;
    const scopeFields = isOverride ? { scopeType: scope.scopeType, scopeId: scope.scopeId.trim() } : {};
    try {
      if (diff.kind === "reset") {
        await actions.reset.mutateAsync({
          key: setting.key,
          request: { ...scopeFields, expectedVersion: diff.expectedVersion, reason: trimmed },
        });
        toast.success(t("resetDone", { label: setting.label }));
      } else {
        await actions.set.mutateAsync({
          key: setting.key,
          request: { value: next as SettingJson, ...scopeFields, expectedVersion: diff.expectedVersion, reason: trimmed },
        });
        toast.success(t("saved", { label: setting.label }));
      }
      onSaved();
    } catch (error) {
      const code = apiErrorCode(error);
      if (code === "CONFLICT" || code === 409) {
        setFailure({ kind: "conflict", message: t("conflict") });
      } else if (code === "FORBIDDEN" || code === 403) {
        setFailure({ kind: "error", message: getErrorMessage(error, t("forbidden")) });
      } else {
        setFailure({ kind: "error", message: getErrorMessage(error, t("failed")) });
      }
    }
  };

  const valueCell = (value: SettingJson | null) =>
    value === null ? (
      <span className="italic text-ink-subtle">{t("notSet")}</span>
    ) : (
      <span className="break-words">{copy.format(setting, value)}</span>
    );

  const title = diff.kind === "reset" ? (isOverride ? t("removeOverrideTitle") : t("resetTitle")) : t("title");

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-[15px]">{title}</DialogTitle>
        <DialogDescription className="text-[13px]">
          <span className="font-medium text-ink">{setting.label}</span>{" "}
          <span className="font-mono text-[11px] text-ink-subtle">{setting.key}</span>
        </DialogDescription>
      </DialogHeader>

      <div className="mt-4 space-y-4">
        <dl className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-2 text-[13px]">
          <dt className="text-ink-muted">{t("scope")}</dt>
          <dd className="text-ink">
            {copy.scopeName(scope.scopeType)}
            {isOverride ? <span className="ml-1.5 font-mono text-[12px] text-ink-muted">{scope.scopeId}</span> : null}
          </dd>
        </dl>

        <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2 rounded-lg border border-hairline bg-surface-2/50 p-3 text-[13px]">
          <div className="min-w-0">
            <p className="mb-1 text-[11px] font-medium text-ink-muted">{t("before")}</p>
            <p className="text-ink">{valueCell(diff.before)}</p>
          </div>
          <ArrowRight size={14} className="mt-6 text-ink-subtle" aria-hidden />
          <div className="min-w-0">
            <p className="mb-1 text-[11px] font-medium text-ink-muted">{t("after")}</p>
            <p className="font-medium text-ink">{valueCell(diff.after)}</p>
          </div>
        </div>

        {diff.added.length || diff.removed.length ? (
          <div className="space-y-1 text-[12px]">
            {diff.added.length ? (
              <p className="text-emerald-700 dark:text-emerald-300">
                {t("added")}: <span className="font-mono">{diff.added.join(", ")}</span>
              </p>
            ) : null}
            {diff.removed.length ? (
              <p className="text-destructive">
                {t("removed")}: <span className="font-mono">{diff.removed.join(", ")}</span>
              </p>
            ) : null}
          </div>
        ) : null}

        {diff.fields.length && diff.before !== null && diff.after !== null ? (
          <ul className="space-y-1 text-[12px] text-ink-muted">
            {diff.fields.map((field) => (
              <li key={field.field}>
                <span className="text-ink">{t(`flagFields.${field.field}`)}</span>: {JSON.stringify(field.before)} → {JSON.stringify(field.after)}
              </li>
            ))}
          </ul>
        ) : null}

        {diff.kind === "reset" && !isOverride ? (
          <p className="text-[12px] text-ink-muted">
            {t("resetExplain", { service: setting.owningService, value: copy.format(setting, setting.defaultValue) })}
          </p>
        ) : null}

        {setting.risky ? (
          <Notice tone="danger" icon={<Warning size={14} weight="fill" />}>
            {t("riskyNotice")}
          </Notice>
        ) : null}
        {setting.requiresSecurityPermission ? (
          <Notice tone="warning" icon={<ShieldWarning size={14} weight="fill" />}>
            {t("securityNotice")}
          </Notice>
        ) : null}
        {setting.requiresRestart ? (
          <Notice tone="warning" icon={<ArrowsClockwise size={14} />}>
            {t("restartNotice", { service: setting.owningService })}
          </Notice>
        ) : null}

        {diff.unchanged ? <p className="text-[12px] text-ink-muted">{t("unchanged")}</p> : null}

        <div className="space-y-1.5">
          <Label htmlFor="setting-change-reason" className="text-[12px] text-ink-muted">
            {t("reason")}
          </Label>
          <Textarea
            id="setting-change-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t("reasonPlaceholder")}
            rows={3}
            maxLength={1000}
            className="text-[13px]"
          />
          <p className={cn("text-[11px]", diff.requiresReason && !reasonOk ? "text-warning" : "text-ink-subtle")}>
            {diff.requiresReason ? t("reasonRequired", { min: MIN_SETTING_REASON_LENGTH }) : t("reasonOptional")}
          </p>
        </div>

        {failure ? (
          <div
            role="alert"
            className={cn(
              "flex items-start justify-between gap-3 rounded-lg border px-3 py-2 text-[12px]",
              failure.kind === "conflict" ? "border-warning/40 bg-warning/10 text-ink" : "border-destructive/30 bg-destructive/5 text-destructive",
            )}
          >
            <span>{failure.message}</span>
            {failure.kind === "conflict" ? (
              <Button size="sm" variant="outline" onClick={onReload}>
                <ArrowsClockwise size={13} />
                {t("reload")}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <DialogFooter className="mt-5">
        <Button variant="outline" onClick={onClose} disabled={saving}>
          {t("cancel")}
        </Button>
        <Button
          variant={diff.kind === "reset" || setting.risky ? "destructive" : "default"}
          disabled={saving || diff.unchanged || !reasonOk || failure?.kind === "conflict"}
          onClick={() => void submit()}
        >
          {saving ? t("saving") : diff.kind === "reset" ? t("confirmReset") : t("confirm")}
        </Button>
      </DialogFooter>
    </>
  );
}

function Notice({ tone, icon, children }: { tone: "danger" | "warning"; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <p
      className={cn(
        "flex items-start gap-2 rounded-lg px-3 py-2 text-[12px]",
        tone === "danger" ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning",
      )}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span>{children}</span>
    </p>
  );
}
