"use client";

/**
 * The plan editor's plain-language controls (owner, 3 Oct 2026).
 *
 * PresetField  a dropdown of explained choices in place of a bare number ("25% of the plan's
 *              credits — 175 credits"), with "Custom…" for anything else. A stored value that
 *              matches no option opens as Custom showing that number, so opening and saving a plan
 *              never changes it.
 * FeaturesEditor  the `features` JSON as checkboxes: the keys it really carries, plus the lines the
 *              pricing page lists under the plan. Keys it does not know survive (plan-features.ts).
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "@phosphor-icons/react/dist/ssr";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  SUGGESTED_HIGHLIGHTS,
  type PlanFeatures,
} from "@/lib/billing/plan-features";
import {
  matchPreset,
  VOICE_CLONE_LIMIT_PRESETS,
  type PresetOption,
} from "@/lib/billing/plan-presets";
import { cn } from "@/lib/utils";

const CUSTOM = "__custom__";

const selectClass =
  "h-9 w-full rounded-lg border border-border bg-surface-1 px-3 text-[13px] text-ink outline-none focus:ring-2 focus:ring-ring/40";

export function PresetField({
  id,
  label,
  hint,
  value,
  options,
  onChange,
  inputMode = "numeric",
  className,
}: {
  id: string;
  label: string;
  hint?: string;
  /** The draft's string, as the rest of the form holds numbers. */
  value: string;
  options: readonly PresetOption[];
  onChange: (value: string) => void;
  inputMode?: "numeric" | "decimal";
  className?: string;
}) {
  const t = useTranslations("adminPlansSettings.pricingEditors.planForm.presets");
  const numeric = value.trim() === "" ? Number.NaN : Number(value);
  const matched = matchPreset(options, numeric);
  // Custom stays open once chosen, even if the typed number happens to equal an option.
  const [customOpen, setCustomOpen] = useState(() => matched === null);
  const selected = customOpen || matched === null ? CUSTOM : String(matched.value);

  return (
    <div className={cn("min-w-0", className)}>
      <Label htmlFor={id} className="text-[12px] text-ink-muted">
        {label}
      </Label>
      <div className="mt-1.5 grid gap-2">
        <select
          id={id}
          value={selected}
          onChange={(event) => {
            if (event.target.value === CUSTOM) {
              setCustomOpen(true);
              return;
            }
            setCustomOpen(false);
            onChange(event.target.value);
          }}
          className={selectClass}
        >
          {options.map((option) => (
            <option key={option.value} value={String(option.value)}>
              {t(option.labelKey, option.values)}
            </option>
          ))}
          <option value={CUSTOM}>{t("custom")}</option>
        </select>
        {selected === CUSTOM ? (
          <Input
            aria-label={t("customValue", { label })}
            inputMode={inputMode}
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
        ) : null}
      </div>
      {hint ? <p className="mt-1 text-[11px] text-ink-subtle">{hint}</p> : null}
    </div>
  );
}

function CheckRow({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-hairline/60 px-3 py-2.5">
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-primary,#5b5bd6)]"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="min-w-0">
        <span className="block text-[13px] text-ink">{label}</span>
        {hint ? <span className="mt-0.5 block text-[11px] text-ink-subtle">{hint}</span> : null}
      </span>
    </label>
  );
}

export function FeaturesEditor({
  features,
  onChange,
}: {
  features: PlanFeatures;
  onChange: (next: PlanFeatures) => void;
}) {
  const t = useTranslations("adminPlansSettings.pricingEditors.planForm.featureControls");
  const tp = useTranslations("adminPlansSettings.pricingEditors.planForm.presets");
  const [newLine, setNewLine] = useState("");
  const set = (patch: Partial<PlanFeatures>) => onChange({ ...features, ...patch });

  // The suggestions, then whatever this plan already lists that is not one of them.
  const lines = [
    ...SUGGESTED_HIGHLIGHTS,
    ...features.highlights.filter((line) => !(SUGGESTED_HIGHLIGHTS as readonly string[]).includes(line)),
  ];
  const toggleLine = (line: string, on: boolean) =>
    set({
      highlights: on
        ? [...features.highlights, line]
        : features.highlights.filter((existing) => existing !== line),
    });

  const addLine = () => {
    const line = newLine.trim();
    if (!line) return;
    if (!features.highlights.includes(line)) set({ highlights: [...features.highlights, line] });
    setNewLine("");
  };

  const voiceLimitSet = features.voiceCloneLimitMins !== null;
  const voiceMatched =
    voiceLimitSet && matchPreset(VOICE_CLONE_LIMIT_PRESETS, features.voiceCloneLimitMins as number);

  return (
    <div className="grid gap-3 sm:col-span-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <CheckRow
          checked={features.googleMeet}
          onChange={(googleMeet) => set({ googleMeet })}
          label={t("googleMeet")}
          hint={t("googleMeetHint")}
        />
        <CheckRow
          checked={features.contractBilling}
          onChange={(contractBilling) => set({ contractBilling })}
          label={t("contractBilling")}
          hint={t("contractBillingHint")}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-hairline/60 px-3 py-2.5">
        <label className="flex items-center gap-2 text-[13px] text-ink">
          <Switch
            checked={voiceLimitSet}
            onCheckedChange={(on) => set({ voiceCloneLimitMins: on ? -1 : null })}
          />
          {t("voiceCloneLimit")}
        </label>
        {voiceLimitSet ? (
          <select
            aria-label={t("voiceCloneLimit")}
            value={voiceMatched ? String(voiceMatched.value) : String(features.voiceCloneLimitMins)}
            onChange={(event) => set({ voiceCloneLimitMins: Number(event.target.value) })}
            className={cn(selectClass, "h-8 w-auto")}
          >
            {VOICE_CLONE_LIMIT_PRESETS.map((option) => (
              <option key={option.value} value={String(option.value)}>
                {tp(option.labelKey, option.values)}
              </option>
            ))}
            {!voiceMatched ? (
              <option value={String(features.voiceCloneLimitMins)}>
                {tp("voiceCloneMinutes", { minutes: features.voiceCloneLimitMins as number })}
              </option>
            ) : null}
          </select>
        ) : (
          <span className="text-[11px] text-ink-subtle">{t("voiceCloneLimitUnset")}</span>
        )}
      </div>

      <div>
        <p className="text-[12px] text-ink-muted">{t("highlights")}</p>
        <p className="mt-0.5 text-[11px] text-ink-subtle">{t("highlightsHint")}</p>
        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {lines.map((line) => (
            <label key={line} className="flex cursor-pointer items-center gap-2 text-[13px] text-ink">
              <input
                type="checkbox"
                className="h-4 w-4 shrink-0"
                checked={features.highlights.includes(line)}
                onChange={(event) => toggleLine(line, event.target.checked)}
              />
              <span className="min-w-0 truncate">{line}</span>
            </label>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <Input
            aria-label={t("addHighlight")}
            placeholder={t("addHighlight")}
            value={newLine}
            onChange={(event) => setNewLine(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addLine();
              }
            }}
          />
          <button
            type="button"
            onClick={addLine}
            className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-hairline px-3 text-[12px] text-ink-muted hover:bg-surface-2 hover:text-ink"
          >
            <Plus size={12} />
            {t("add")}
          </button>
        </div>
      </div>

      {Object.keys(features.rest).length > 0 ? (
        <p className="text-[11px] text-ink-subtle">
          {t("keptKeys", { keys: Object.keys(features.rest).join(", ") })}
        </p>
      ) : null}
    </div>
  );
}
