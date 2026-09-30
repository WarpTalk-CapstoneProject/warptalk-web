"use client";

/**
 * One setting's changes, newest first: who, when, why, old → new, at which scope. A manager can
 * revert any of them; the revert restores the value that change replaced and is itself recorded as
 * a new change, so nothing is ever rewritten. Sensitive settings arrive redacted and read "hidden".
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowCounterClockwise, ClockCounterClockwise } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

import { StaffReasonDialog } from "@/components/admin/staff/staff-ui";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAdminPlatformSettingHistory, useAdminPlatformSettingsActions } from "@/hooks/use-admin-platform-settings";
import { cn } from "@/lib/utils";
import type { PlatformSettingChangeDto, PlatformSettingDto, SettingJson } from "@/types/admin-platform-settings";

import { useSettingsCopy } from "./settings-i18n";

const ACTION_TONES: Record<string, string> = {
  set: "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  reset: "border-hairline bg-surface-2 text-ink-muted",
  revert: "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  import: "border-violet-500/25 bg-violet-500/10 text-violet-700 dark:text-violet-300",
};

export function SettingHistorySheet({
  setting,
  canRevert,
  onClose,
}: {
  setting: PlatformSettingDto | null;
  canRevert: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet open={setting !== null} onOpenChange={(open) => (open ? null : onClose())}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-lg">
        {setting ? <HistoryBody setting={setting} canRevert={canRevert} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function HistoryBody({ setting, canRevert }: { setting: PlatformSettingDto; canRevert: boolean }) {
  const t = useTranslations("adminPlatformSettings.history");
  const copy = useSettingsCopy();
  const history = useAdminPlatformSettingHistory(setting.key);
  const actions = useAdminPlatformSettingsActions();
  const [reverting, setReverting] = useState<PlatformSettingChangeDto | null>(null);

  const valueText = (change: PlatformSettingChangeDto, value: SettingJson | null) =>
    change.redacted ? t("hidden") : value === null ? t("notSet") : copy.format(setting, value);

  return (
    <>
      <SheetHeader className="border-b border-hairline pb-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink-muted">
            <ClockCounterClockwise size={15} weight="duotone" />
          </span>
          <div className="min-w-0">
            <SheetTitle className="text-[15px]">{t("title")}</SheetTitle>
            <SheetDescription className="text-[13px]">
              {setting.label} <span className="font-mono text-[11px] text-ink-subtle">{setting.key}</span>
            </SheetDescription>
          </div>
        </div>
      </SheetHeader>

      <div className="p-4">
        {history.isPending ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-16 animate-pulse rounded-lg bg-surface-2" />
            ))}
          </div>
        ) : history.isError ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-3 text-[12px] text-destructive">
            {t("error")}
            <Button size="sm" variant="outline" className="ml-3" onClick={() => void history.refetch()}>
              {t("retry")}
            </Button>
          </div>
        ) : (history.data ?? []).length === 0 ? (
          <p className="py-10 text-center text-[12px] text-ink-muted">{t("empty")}</p>
        ) : (
          <ol className="space-y-2.5">
            {(history.data ?? []).map((change) => (
              <li key={change.id} className="rounded-lg border border-hairline bg-surface-1 px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium",
                      ACTION_TONES[change.action] ?? ACTION_TONES.reset,
                    )}
                  >
                    {t.has(`actions.${change.action}`) ? t(`actions.${change.action}`) : change.action}
                  </span>
                  {change.scopeType !== "platform" ? (
                    <span className="rounded-md border border-hairline px-1.5 py-0.5 text-[10px] text-ink-muted">
                      {copy.scopeName(change.scopeType)} <span className="font-mono">{change.scopeId}</span>
                    </span>
                  ) : null}
                  <span className="text-[11px] tabular-nums text-ink-subtle">v{change.version}</span>
                  <span className="ml-auto text-[11px] text-ink-subtle">{copy.dateTime(change.changedAt)}</span>
                </div>

                <p className="mt-1.5 text-[13px] text-ink">
                  <span className={cn(change.redacted && "italic text-ink-subtle")}>{valueText(change, change.oldValue)}</span>
                  <span className="mx-1.5 text-ink-subtle">→</span>
                  <span className={cn("font-medium", change.redacted && "italic font-normal text-ink-subtle")}>
                    {valueText(change, change.newValue)}
                  </span>
                </p>

                <p className="mt-1 text-[12px] text-ink-muted">
                  {t("by", { who: change.changedBy.name || change.changedBy.email || change.changedBy.id })}
                  {change.revertOf ? <span className="ml-1.5 text-ink-subtle">· {t("revertOf")}</span> : null}
                </p>
                <p className={cn("mt-1 text-[12px]", change.reason ? "text-ink" : "italic text-ink-subtle")}>
                  {change.reason ? `“${change.reason}”` : t("noReason")}
                </p>

                {canRevert ? (
                  <div className="mt-2 flex justify-end">
                    <Button size="sm" variant="ghost" onClick={() => setReverting(change)}>
                      <ArrowCounterClockwise size={13} />
                      {t("revert")}
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </div>

      <StaffReasonDialog
        open={reverting !== null}
        onOpenChange={(open) => {
          if (!open) setReverting(null);
        }}
        title={t("revertTitle")}
        description={t("revertDescription")}
        subject={
          reverting
            ? {
                primary: `${setting.label}: ${valueText(reverting, reverting.newValue)} → ${valueText(reverting, reverting.oldValue)}`,
                secondary: `${copy.dateTime(reverting.changedAt)} · ${reverting.changedBy.name || reverting.changedBy.email || ""}`,
              }
            : undefined
        }
        confirmLabel={t("revertConfirm")}
        pendingLabel={t("reverting")}
        destructive={setting.risky}
        isSaving={actions.revert.isPending}
        onSubmit={async (reason) => {
          if (!reverting) return;
          await actions.revert.mutateAsync({ changeId: reverting.id, reason });
          toast.success(t("reverted", { label: setting.label }));
          void history.refetch();
        }}
      />
    </>
  );
}
