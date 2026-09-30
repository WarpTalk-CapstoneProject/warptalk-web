"use client";

/**
 * One registry entry: what it is (label, key, description, owning service, badges), what is in
 * force (the stored value, or "Not set" and who decides instead), its default, its plan/workspace
 * overrides, and — for someone allowed to — an inline editor, reset and history.
 *
 * Whether a person may edit is decided twice and both must agree: the staff permissions the portal
 * renders from (settings.manage, plus settings.security for the Security category) and the
 * server's own `canEdit`, which is authoritative. When they refuse, the controls are not hidden
 * without a word: the row says which permission is missing.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowCounterClockwise,
  ArrowsClockwise,
  ClockCounterClockwise,
  Copy,
  EyeSlash,
  LockSimple,
  PencilSimple,
  Plus,
  ShieldCheck,
  Trash,
  Warning,
} from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import {
  explainEffectiveValue,
  isChangedFromDefault,
  overrideScopes,
  PLATFORM_SCOPE,
  validateSettingValue,
} from "@/lib/admin/platform-settings";
import { cn } from "@/lib/utils";
import type { PlatformSettingDto, PlatformSettingScopedValueDto, SettingJson } from "@/types/admin-platform-settings";

import { SettingChangeDialog, type PendingSettingChange } from "./setting-change-dialog";
import { SettingOverrideDialog } from "./setting-override-dialog";
import { SettingValueEditor } from "./setting-value-editor";
import { useSettingsCopy } from "./settings-i18n";

export type EditRefusal = "manage" | "security" | "server" | null;

export function settingDomId(key: string) {
  return `setting-${key.replace(/[^a-z0-9]+/gi, "-")}`;
}

export function SettingRow({
  setting,
  refusal,
  focused,
  onHistory,
  onReload,
}: {
  setting: PlatformSettingDto;
  /** Why this person may not change it; null when they may. */
  refusal: EditRefusal;
  focused: boolean;
  onHistory: () => void;
  onReload: () => void;
}) {
  const t = useTranslations("adminPlatformSettings.row");
  const tBadges = useTranslations("adminPlatformSettings.badges");
  const copy = useSettingsCopy();
  const canWrite = refusal === null;
  const [draft, setDraft] = useState<SettingJson | null>(null);
  const editing = draft !== null;
  const [pending, setPending] = useState<PendingSettingChange | null>(null);
  const [overrideEditor, setOverrideEditor] = useState<{ override: PlatformSettingScopedValueDto | null } | null>(null);

  const effective = explainEffectiveValue(setting);
  const draftError = editing ? validateSettingValue(setting, draft) : null;
  const scopesForOverrides = overrideScopes(setting);
  const changed = isChangedFromDefault(setting);

  const startEdit = () => setDraft(setting.value ?? setting.defaultValue);
  const copyKey = async () => {
    try {
      await navigator.clipboard.writeText(setting.key);
      toast.success(t("copied"));
    } catch {
      // Clipboard refused (insecure context, permissions): the key is on screen to select by hand.
    }
  };

  return (
    <article
      id={settingDomId(setting.key)}
      aria-labelledby={`${settingDomId(setting.key)}-label`}
      className={cn(
        "scroll-mt-24 border-b border-hairline/60 px-4 py-3.5 transition-colors last:border-b-0",
        focused && "bg-primary/[0.04] ring-2 ring-inset ring-primary/30",
      )}
    >
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 id={`${settingDomId(setting.key)}-label`} className="text-[13px] font-medium text-ink">
              {setting.label}
            </h3>
            {changed ? <Badge tone="info">{tBadges("changed")}</Badge> : null}
            {setting.risky ? (
              <Badge tone="danger" icon={<Warning size={10} weight="fill" />} hint={tBadges("riskyHint")}>
                {tBadges("risky")}
              </Badge>
            ) : null}
            {setting.requiresSecurityPermission ? (
              <Badge tone="warning" icon={<ShieldCheck size={10} weight="fill" />} hint={tBadges("securityHint")}>
                {tBadges("security")}
              </Badge>
            ) : null}
            {setting.requiresRestart ? (
              <Badge tone="warning" icon={<ArrowsClockwise size={10} />} hint={tBadges("restartHint")}>
                {tBadges("restart")}
              </Badge>
            ) : null}
            {setting.sensitive ? (
              <Badge tone="neutral" icon={<EyeSlash size={10} />} hint={tBadges("sensitiveHint")}>
                {tBadges("sensitive")}
              </Badge>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => void copyKey()}
            className="group mt-0.5 inline-flex max-w-full items-center gap-1 rounded font-mono text-[11px] text-ink-subtle hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            aria-label={t("copyKey", { key: setting.key })}
          >
            <span className="truncate">{setting.key}</span>
            <Copy size={11} className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
          </button>
          <p className="mt-1 max-w-3xl text-[12px] leading-5 text-ink-muted">{setting.description}</p>
          <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-ink-subtle">
            <span>{t("owner", { service: setting.owningService })}</span>
            <span>{t("default", { value: copy.format(setting, setting.defaultValue) })}</span>
            {setting.scopes.length > 1 ? (
              <span>{t("scopes", { scopes: setting.scopes.map((scope) => copy.scopeName(scope)).join(" · ") })}</span>
            ) : null}
            <span>
              {setting.lastChangedAt
                ? t("lastChanged", {
                    when: copy.dateTime(setting.lastChangedAt),
                    who: setting.lastChangedBy?.name || setting.lastChangedBy?.email || t("someone"),
                  })
                : t("neverChanged")}
            </span>
          </p>
        </div>

        <div className="w-full shrink-0 xl:w-[380px]">
          {editing ? (
            <div className="space-y-2">
              <SettingValueEditor setting={setting} value={draft} onChange={setDraft} invalid={Boolean(draftError)} idPrefix="row" />
              {draftError ? (
                <p role="alert" className="text-[11px] text-destructive">
                  {copy.validation(draftError)}
                </p>
              ) : null}
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
                  {t("cancel")}
                </Button>
                <Button
                  size="sm"
                  disabled={Boolean(draftError)}
                  onClick={() => setPending({ setting, scope: PLATFORM_SCOPE, next: draft })}
                >
                  {t("review")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="xl:text-right">
              {effective.state === "set" ? (
                <p className="break-words text-[13px] font-medium text-ink">{copy.format(setting, effective.value)}</p>
              ) : (
                <>
                  <p className="text-[13px] font-medium text-ink-muted">{t("notSet")}</p>
                  <p className="mt-0.5 text-[11px] text-ink-subtle">
                    {t("notSetExplain", { service: effective.service, value: copy.format(setting, effective.codeDefault) })}
                  </p>
                </>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-1 xl:justify-end">
                {canWrite ? (
                  <>
                    <Button size="sm" variant="outline" onClick={startEdit}>
                      <PencilSimple size={13} />
                      {t("edit")}
                    </Button>
                    {setting.isSet ? (
                      <Button size="sm" variant="ghost" onClick={() => setPending({ setting, scope: PLATFORM_SCOPE, next: null })}>
                        <ArrowCounterClockwise size={13} />
                        {t("reset")}
                      </Button>
                    ) : null}
                  </>
                ) : (
                  <Tooltip content={t(`refusal.${refusal}`)}>
                    <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-ink-subtle">
                      <LockSimple size={12} />
                      {t("readOnly")}
                    </span>
                  </Tooltip>
                )}
                <Button size="sm" variant="ghost" onClick={onHistory}>
                  <ClockCounterClockwise size={13} />
                  {t("history")}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {scopesForOverrides.length > 0 || setting.overrides.length > 0 ? (
        <div className="mt-3 rounded-lg border border-hairline bg-surface-2/40">
          <div className="flex items-center justify-between gap-2 px-3 py-1.5">
            <p className="text-[11px] font-medium text-ink-muted">
              {t("overrides", { count: setting.overrides.length })}
            </p>
            {canWrite && scopesForOverrides.length > 0 ? (
              <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => setOverrideEditor({ override: null })}>
                <Plus size={12} />
                {t("addOverride")}
              </Button>
            ) : null}
          </div>
          {setting.overrides.length ? (
            <ul className="border-t border-hairline/60">
              {setting.overrides.map((override) => (
                <li
                  key={`${override.scopeType}:${override.scopeId}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-hairline/40 px-3 py-1.5 text-[12px] last:border-b-0"
                >
                  <span className="rounded border border-hairline bg-surface-1 px-1.5 py-0.5 text-[10px] font-medium text-ink-muted">
                    {copy.scopeName(override.scopeType)}
                  </span>
                  <span className="min-w-0 truncate font-mono text-[11px] text-ink">{override.scopeId}</span>
                  <span className="font-medium text-ink">{copy.format(setting, override.value)}</span>
                  <span className="text-[11px] text-ink-subtle">{copy.dateTime(override.updatedAt)}</span>
                  {canWrite ? (
                    <span className="ml-auto flex gap-1">
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => setOverrideEditor({ override })}>
                        {t("editOverride")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-[11px] text-destructive hover:text-destructive"
                        onClick={() => setPending({ setting, scope: { scopeType: override.scopeType, scopeId: override.scopeId }, next: null })}
                      >
                        <Trash size={12} />
                        {t("removeOverride")}
                      </Button>
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="border-t border-hairline/60 px-3 py-1.5 text-[11px] text-ink-subtle">{t("noOverrides")}</p>
          )}
        </div>
      ) : null}

      {canWrite ? (
        <>
          <SettingOverrideDialog
            setting={setting}
            override={overrideEditor?.override ?? null}
            open={overrideEditor !== null}
            onOpenChange={(open) => {
              if (!open) setOverrideEditor(null);
            }}
            onReview={(change) => {
              setOverrideEditor(null);
              setPending(change);
            }}
          />
          <SettingChangeDialog
            pending={pending}
            onClose={() => setPending(null)}
            onSaved={() => {
              setPending(null);
              setDraft(null);
            }}
            onReload={() => {
              setPending(null);
              setDraft(null);
              onReload();
            }}
          />
        </>
      ) : null}
    </article>
  );
}

function Badge({
  tone,
  icon,
  hint,
  children,
}: {
  tone: "danger" | "warning" | "info" | "neutral";
  icon?: React.ReactNode;
  hint?: string;
  children: React.ReactNode;
}) {
  const badge = (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[10px] font-medium",
        tone === "danger" && "border-destructive/30 bg-destructive/10 text-destructive",
        tone === "warning" && "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
        tone === "info" && "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300",
        tone === "neutral" && "border-hairline bg-surface-2 text-ink-muted",
      )}
    >
      {icon}
      {children}
    </span>
  );
  return hint ? <Tooltip content={hint}>{badge}</Tooltip> : badge;
}
