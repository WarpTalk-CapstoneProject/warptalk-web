"use client";

/**
 * Add or edit one plan/workspace override. An override wins over the platform value for that one
 * plan or workspace (workspace first); the dialog only collects scope and value, then hands the
 * change to the same confirmation every other write goes through.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { overrideScopes, validateScopeId, validateSettingValue } from "@/lib/admin/platform-settings";
import type { PlatformSettingDto, PlatformSettingScope, PlatformSettingScopedValueDto, SettingJson } from "@/types/admin-platform-settings";

import type { PendingSettingChange } from "./setting-change-dialog";
import { SettingValueEditor } from "./setting-value-editor";
import { useSettingsCopy } from "./settings-i18n";

export function SettingOverrideDialog({
  setting,
  override,
  open,
  onOpenChange,
  onReview,
}: {
  setting: PlatformSettingDto;
  /** The override being edited; null adds a new one. */
  override: PlatformSettingScopedValueDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReview: (change: PendingSettingChange) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto sm:max-w-lg">
        {open ? <OverrideForm setting={setting} override={override} onCancel={() => onOpenChange(false)} onReview={onReview} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function OverrideForm({
  setting,
  override,
  onCancel,
  onReview,
}: {
  setting: PlatformSettingDto;
  override: PlatformSettingScopedValueDto | null;
  onCancel: () => void;
  onReview: (change: PendingSettingChange) => void;
}) {
  const t = useTranslations("adminPlatformSettings.override");
  const copy = useSettingsCopy();
  const scopes = overrideScopes(setting);
  const [scopeType, setScopeType] = useState<PlatformSettingScope>(override?.scopeType ?? scopes[0] ?? "workspace");
  const [scopeId, setScopeId] = useState(override?.scopeId ?? "");
  const [value, setValue] = useState<SettingJson | null>(override?.value ?? setting.value ?? setting.defaultValue);
  const [touched, setTouched] = useState(false);

  const scopeError = scopeId.trim() ? validateScopeId(setting, scopeType, scopeId) : null;
  const valueError = validateSettingValue(setting, value);
  const canReview = scopeId.trim().length > 0 && !scopeError && !valueError;

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-[15px]">{override ? t("editTitle") : t("addTitle")}</DialogTitle>
        <DialogDescription className="text-[13px]">
          <span className="font-medium text-ink">{setting.label}</span> — {t("description")}
        </DialogDescription>
      </DialogHeader>

      <div className="mt-4 grid gap-4">
        <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
          <div className="space-y-1.5">
            <Label htmlFor="override-scope-type" className="text-[12px] text-ink-muted">
              {t("scopeType")}
            </Label>
            <select
              id="override-scope-type"
              value={scopeType}
              disabled={Boolean(override)}
              onChange={(event) => setScopeType(event.target.value as PlatformSettingScope)}
              className="h-8 w-full rounded-lg border border-border bg-surface-1 px-2 text-[13px] text-ink"
            >
              {scopes.map((scope) => (
                <option key={scope} value={scope}>
                  {copy.scopeName(scope)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="override-scope-id" className="text-[12px] text-ink-muted">
              {scopeType === "plan" ? t("planSlug") : t("workspaceId")}
            </Label>
            <Input
              id="override-scope-id"
              value={scopeId}
              disabled={Boolean(override)}
              onChange={(event) => setScopeId(event.target.value)}
              onBlur={() => setTouched(true)}
              placeholder={scopeType === "plan" ? t("planPlaceholder") : t("workspacePlaceholder")}
              aria-invalid={Boolean(touched && scopeError) || undefined}
              className="h-8 font-mono text-[12px]"
            />
            {touched && scopeError ? <p className="text-[11px] text-destructive">{copy.scopeIdError(scopeError)}</p> : null}
            {scopeType === "workspace" ? <p className="text-[11px] text-ink-subtle">{t("workspaceHint")}</p> : null}
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-[12px] text-ink-muted">{t("value")}</p>
          <SettingValueEditor setting={setting} value={value} onChange={setValue} invalid={Boolean(valueError)} idPrefix="override" />
          {valueError ? <p className="text-[11px] text-destructive">{copy.validation(valueError)}</p> : null}
        </div>
      </div>

      <DialogFooter className="mt-5">
        <Button variant="outline" onClick={onCancel}>
          {t("cancel")}
        </Button>
        <Button
          disabled={!canReview}
          onClick={() => onReview({ setting, scope: { scopeType, scopeId: scopeId.trim() }, next: value })}
        >
          {t("review")}
        </Button>
      </DialogFooter>
    </>
  );
}
