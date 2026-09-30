"use client";

/**
 * Import a file the export produced: parse and check its shape in the browser, ask the server for
 * a dry run, show every line with its outcome, then apply with a reason. The server applies an
 * import all-or-nothing, so a plan with a rejected line cannot be applied at all — the preview says
 * which lines to fix instead of offering a button that can only fail.
 */

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { FileArrowUp, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAdminPlatformSettingsActions } from "@/hooks/use-admin-platform-settings";
import {
  MAX_IMPORT_FILE_BYTES,
  MIN_SETTING_REASON_LENGTH,
  parseImportFile,
  reasonIsValid,
  scopeLabel,
} from "@/lib/admin/platform-settings";
import { getErrorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import type {
  PlatformSettingDto,
  PlatformSettingsExportEntryDto,
  PlatformSettingsImportResultDto,
  SettingJson,
} from "@/types/admin-platform-settings";

import { useSettingsCopy } from "./settings-i18n";

const OUTCOME_TONES: Record<string, string> = {
  create: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  update: "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  unchanged: "border-hairline bg-surface-2 text-ink-muted",
  rejected: "border-destructive/30 bg-destructive/10 text-destructive",
};

export function SettingsImportDialog({
  open,
  onOpenChange,
  settings,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The registry as the console holds it, to print values with their units. */
  settings: readonly PlatformSettingDto[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto sm:max-w-3xl">
        {open ? <ImportFlow settings={settings} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function ImportFlow({ settings, onDone }: { settings: readonly PlatformSettingDto[]; onDone: () => void }) {
  const t = useTranslations("adminPlatformSettings.import");
  const copy = useSettingsCopy();
  const actions = useAdminPlatformSettingsActions();
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [entries, setEntries] = useState<PlatformSettingsExportEntryDto[] | null>(null);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [plan, setPlan] = useState<PlatformSettingsImportResultDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const byKey = new Map(settings.map((setting) => [setting.key, setting]));

  const formatValue = (key: string, value: SettingJson | null) => {
    if (value === null) return t("notSet");
    const setting = byKey.get(key);
    return setting ? copy.format(setting, value) : JSON.stringify(value);
  };

  const pick = async (file: File | undefined) => {
    setError(null);
    setPlan(null);
    setEntries(null);
    if (!file) return;
    setFileName(file.name);
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      setError(t("errors.fileTooLarge"));
      return;
    }
    const parsed = parseImportFile(await file.text());
    if (!parsed.ok) {
      setError(copy.importError(parsed.error));
      return;
    }
    setEntries(parsed.entries);
    setExcluded(parsed.excluded);
    try {
      setPlan(await actions.importSettings.mutateAsync({ settings: parsed.entries, dryRun: true }));
    } catch (err) {
      setError(getErrorMessage(err, t("previewFailed")));
    }
  };

  const apply = async () => {
    if (!entries) return;
    setError(null);
    try {
      const result = await actions.importSettings.mutateAsync({ settings: entries, dryRun: false, reason: reason.trim() });
      if (result.applied) {
        toast.success(t("applied", { count: result.changed }));
        onDone();
      } else {
        setPlan(result);
        setError(t("notApplied"));
      }
    } catch (err) {
      setError(getErrorMessage(err, t("failed")));
    }
  };

  const toChange = plan ? plan.lines.filter((line) => line.outcome === "create" || line.outcome === "update").length : 0;
  const canApply = Boolean(plan) && plan!.rejected === 0 && toChange > 0 && reasonIsValid(reason, true) && !actions.importSettings.isPending;

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-[15px]">{t("title")}</DialogTitle>
        <DialogDescription className="text-[13px]">{t("description")}</DialogDescription>
      </DialogHeader>

      <div className="mt-4 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            aria-label={t("choose")}
            onChange={(event) => {
              void pick(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()} disabled={actions.importSettings.isPending}>
            <FileArrowUp size={14} />
            {fileName ? t("chooseAnother") : t("choose")}
          </Button>
          {fileName ? <span className="truncate font-mono text-[12px] text-ink-muted">{fileName}</span> : null}
          {actions.importSettings.isPending && !plan ? <span className="text-[12px] text-ink-subtle">{t("checking")}</span> : null}
        </div>

        {error ? (
          <p role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
            <WarningCircle size={14} weight="duotone" className="mt-0.5 shrink-0" />
            {error}
          </p>
        ) : null}

        {excluded.length ? (
          <p className="text-[12px] text-ink-muted">{t("excluded", { count: excluded.length, keys: excluded.join(", ") })}</p>
        ) : null}

        {plan ? (
          <>
            <p className="text-[12px] text-ink">
              {t("summary", { changed: toChange, unchanged: plan.unchanged, rejected: plan.rejected })}
            </p>
            <div className="max-h-[320px] overflow-auto rounded-lg border border-hairline">
              <table className="w-full min-w-[640px] text-left text-[12px]">
                <caption className="sr-only">{t("preview")}</caption>
                <thead className="sticky top-0 bg-surface-1">
                  <tr className="border-b border-hairline text-[11px] text-ink-muted">
                    <th scope="col" className="px-3 py-1.5 font-medium">{t("columns.setting")}</th>
                    <th scope="col" className="px-3 py-1.5 font-medium">{t("columns.scope")}</th>
                    <th scope="col" className="px-3 py-1.5 font-medium">{t("columns.outcome")}</th>
                    <th scope="col" className="px-3 py-1.5 font-medium">{t("columns.change")}</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.lines.map((line, index) => (
                    <tr key={`${line.key}:${line.scopeType}:${line.scopeId}:${index}`} className="border-b border-hairline/50 align-top last:border-b-0">
                      <td className="px-3 py-1.5">
                        <p className="text-ink">{byKey.get(line.key)?.label ?? line.key}</p>
                        <p className="font-mono text-[10px] text-ink-subtle">{line.key}</p>
                      </td>
                      <td className="px-3 py-1.5 font-mono text-[11px] text-ink-muted">{scopeLabel(line)}</td>
                      <td className="px-3 py-1.5">
                        <span
                          className={cn(
                            "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium",
                            OUTCOME_TONES[line.outcome] ?? OUTCOME_TONES.unchanged,
                          )}
                        >
                          {t.has(`outcomes.${line.outcome}`) ? t(`outcomes.${line.outcome}`) : line.outcome}
                        </span>
                      </td>
                      <td className="px-3 py-1.5">
                        {line.outcome === "rejected" ? (
                          <span className="text-destructive">{line.error ?? t("rejectedNoReason")}</span>
                        ) : line.outcome === "unchanged" ? (
                          <span className="text-ink-subtle">{formatValue(line.key, line.newValue)}</span>
                        ) : (
                          <span className="text-ink">
                            <span className="text-ink-muted">{formatValue(line.key, line.oldValue)}</span>
                            <span className="mx-1 text-ink-subtle">→</span>
                            {formatValue(line.key, line.newValue)}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {plan.rejected > 0 ? (
              <p className="text-[12px] text-warning">{t("hasRejected")}</p>
            ) : toChange === 0 ? (
              <p className="text-[12px] text-ink-muted">{t("nothingToApply")}</p>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="settings-import-reason" className="text-[12px] text-ink-muted">
                  {t("reason")}
                </Label>
                <Textarea
                  id="settings-import-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder={t("reasonPlaceholder")}
                  rows={2}
                  maxLength={1000}
                  className="text-[13px]"
                />
                <p className="text-[11px] text-ink-subtle">{t("reasonHint", { min: MIN_SETTING_REASON_LENGTH })}</p>
              </div>
            )}
          </>
        ) : null}
      </div>

      <DialogFooter className="mt-5">
        <Button variant="outline" onClick={onDone} disabled={actions.importSettings.isPending}>
          {t("cancel")}
        </Button>
        <Button disabled={!canApply} onClick={() => void apply()}>
          {actions.importSettings.isPending && plan ? t("applying") : t("apply", { count: toChange })}
        </Button>
      </DialogFooter>
    </>
  );
}
