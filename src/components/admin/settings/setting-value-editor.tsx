"use client";

/**
 * The input for one setting value, chosen by the registry type: a switch, a number with its bounds
 * and unit, a text field, a select for an enum, a tag list for a string list, and the feature-flag
 * editor (kill switch, rollout, allow/deny lists). Controlled: the parent owns the draft value and
 * validates it with lib/admin/platform-settings.ts.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { X } from "@phosphor-icons/react/dist/ssr";

import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { flagToJson, normalizeFlag, parseNumberDraft, splitListInput, type FlagListField } from "@/lib/admin/platform-settings";
import { cn } from "@/lib/utils";
import type { PlatformSettingDto, SettingJson } from "@/types/admin-platform-settings";

type EditorSetting = Pick<PlatformSettingDto, "key" | "type" | "unit" | "min" | "max" | "allowedValues" | "maxLength" | "label">;

export function SettingValueEditor({
  setting,
  value,
  onChange,
  disabled,
  invalid,
  idPrefix,
}: {
  setting: EditorSetting;
  value: SettingJson | null;
  onChange: (value: SettingJson) => void;
  disabled?: boolean;
  invalid?: boolean;
  /** Distinguishes two editors for the same key (the row and the override dialog). */
  idPrefix: string;
}) {
  const t = useTranslations("adminPlatformSettings.editor");
  const id = `${idPrefix}-${setting.key.replace(/[^a-z0-9]+/gi, "-")}`;

  switch (setting.type) {
    case "boolean":
      return (
        <label htmlFor={id} className="inline-flex items-center gap-2 text-[13px] text-ink">
          <Switch id={id} checked={value === true} onCheckedChange={(checked) => onChange(Boolean(checked))} disabled={disabled} aria-label={setting.label} />
          {value === true ? t("on") : t("off")}
        </label>
      );
    case "integer":
    case "decimal":
      return <NumberEditor id={id} setting={setting} value={value} onChange={onChange} disabled={disabled} invalid={invalid} />;
    case "enum":
      return (
        <select
          id={id}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          aria-label={setting.label}
          aria-invalid={invalid || undefined}
          className="h-8 w-full max-w-[280px] rounded-lg border border-border bg-surface-1 px-2 text-[13px] text-ink"
        >
          {(setting.allowedValues ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    case "string_list":
      return (
        <TagListEditor
          id={id}
          values={Array.isArray(value) ? value.map(String) : []}
          onChange={onChange}
          disabled={disabled}
          invalid={invalid}
          placeholder={t("itemPlaceholder")}
          label={setting.label}
          max={setting.maxLength}
        />
      );
    case "feature_flag":
      return <FlagEditor id={id} value={value} onChange={onChange} disabled={disabled} />;
    case "string":
    default: {
      const text = typeof value === "string" ? value : "";
      const long = (setting.maxLength ?? 0) > 120;
      return (
        <div className="w-full">
          {long ? (
            <Textarea
              id={id}
              value={text}
              onChange={(event) => onChange(event.target.value)}
              disabled={disabled}
              aria-label={setting.label}
              aria-invalid={invalid || undefined}
              rows={3}
              className="min-h-[72px] text-[13px]"
            />
          ) : (
            <Input
              id={id}
              value={text}
              onChange={(event) => onChange(event.target.value)}
              disabled={disabled}
              aria-label={setting.label}
              aria-invalid={invalid || undefined}
              className="h-8 text-[13px]"
            />
          )}
          {setting.maxLength ? (
            <p className="mt-1 text-right text-[11px] tabular-nums text-ink-subtle">
              {t("length", { count: text.length, max: setting.maxLength })}
            </p>
          ) : null}
        </div>
      );
    }
  }
}

function NumberEditor({
  id,
  setting,
  value,
  onChange,
  disabled,
  invalid,
}: {
  id: string;
  setting: EditorSetting;
  value: SettingJson | null;
  onChange: (value: SettingJson) => void;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const t = useTranslations("adminPlatformSettings.editor");
  // The text is the draft: "0." and "-" are on the way to a number, so they stay as typed and the
  // parent receives the raw text (which fails validation) until they are one.
  const [text, setText] = useState(typeof value === "number" ? String(value) : typeof value === "string" ? value : "");
  const bounds =
    setting.min != null && setting.max != null
      ? t("range", { min: setting.min, max: setting.max })
      : setting.min != null
        ? t("min", { min: setting.min })
        : setting.max != null
          ? t("max", { max: setting.max })
          : null;
  return (
    <div className="flex items-center gap-2">
      <Input
        id={id}
        value={text}
        inputMode={setting.type === "integer" ? "numeric" : "decimal"}
        onChange={(event) => {
          setText(event.target.value);
          onChange(parseNumberDraft(event.target.value) ?? event.target.value);
        }}
        disabled={disabled}
        aria-label={setting.label}
        aria-invalid={invalid || undefined}
        className="h-8 w-28 text-right text-[13px] tabular-nums"
      />
      {setting.unit ? <span className="text-[12px] text-ink-muted">{setting.unit}</span> : null}
      {bounds ? <span className="text-[11px] text-ink-subtle">({bounds})</span> : null}
    </div>
  );
}

/** Entries as removable chips; Enter, comma or a pasted block adds. */
export function TagListEditor({
  id,
  values,
  onChange,
  disabled,
  invalid,
  placeholder,
  label,
  max,
  mono,
}: {
  id: string;
  values: string[];
  onChange: (values: string[]) => void;
  disabled?: boolean;
  invalid?: boolean;
  placeholder: string;
  label: string;
  max?: number | null;
  mono?: boolean;
}) {
  const t = useTranslations("adminPlatformSettings.editor");
  const [draft, setDraft] = useState("");

  const commit = (text: string) => {
    const items = splitListInput(text);
    if (items.length === 0) return;
    onChange([...values, ...items]);
    setDraft("");
  };

  return (
    <div
      className={cn(
        "w-full rounded-lg border bg-surface-1 p-1.5",
        invalid ? "border-destructive/60" : "border-border",
        disabled && "opacity-60",
      )}
    >
      {values.length ? (
        <ul className="mb-1 flex flex-wrap gap-1" aria-label={label}>
          {values.map((item, index) => (
            <li
              key={`${item}-${index}`}
              className={cn(
                "inline-flex max-w-full items-center gap-1 rounded-md border border-hairline bg-surface-2 py-0.5 pl-2 pr-1 text-[12px] text-ink",
                mono && "font-mono text-[11px]",
              )}
            >
              <span className="truncate">{item}</span>
              {!disabled ? (
                <button
                  type="button"
                  onClick={() => onChange(values.filter((_, i) => i !== index))}
                  aria-label={t("removeItem", { item })}
                  className="grid size-4 place-items-center rounded text-ink-subtle hover:bg-surface-1 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  <X size={10} weight="bold" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <input
        id={id}
        value={draft}
        onChange={(event) => {
          const next = event.target.value;
          if (/[,;\n]/.test(next)) commit(next);
          else setDraft(next);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit(draft);
          } else if (event.key === "Backspace" && !draft && values.length) {
            onChange(values.slice(0, -1));
          }
        }}
        onBlur={() => commit(draft)}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={label}
        aria-invalid={invalid || undefined}
        className={cn("h-6 w-full bg-transparent px-1 text-[12px] text-ink placeholder:text-ink-subtle focus:outline-none", mono && "font-mono")}
      />
      {max ? (
        <p className="px-1 text-right text-[11px] tabular-nums text-ink-subtle">{t("entries", { count: values.length, max })}</p>
      ) : null}
    </div>
  );
}

/**
 * The feature-flag editor. "Enabled" is the kill switch: off beats every list below it, so it is
 * the one control that turns a misbehaving feature off everywhere at once.
 */
function FlagEditor({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: SettingJson | null;
  onChange: (value: SettingJson) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("adminPlatformSettings.editor.flag");
  const flag = normalizeFlag(value);
  const update = (patch: Partial<typeof flag>) => onChange(flagToJson({ ...flag, ...patch }));
  const listField = (field: FlagListField, placeholder: string) => (
    <div>
      <p className="mb-1 text-[11px] font-medium text-ink-muted">{t(field)}</p>
      <TagListEditor
        id={`${id}-${field}`}
        values={flag[field]}
        onChange={(items) => update({ [field]: items })}
        disabled={disabled || !flag.enabled}
        placeholder={placeholder}
        label={t(field)}
        mono={field !== "allowPlans"}
      />
    </div>
  );

  return (
    <div className="w-full space-y-3 rounded-lg border border-hairline bg-surface-2/40 p-3 text-left">
      <label htmlFor={`${id}-enabled`} className="flex items-start gap-2.5">
        <Switch id={`${id}-enabled`} checked={flag.enabled} onCheckedChange={(checked) => update({ enabled: Boolean(checked) })} disabled={disabled} />
        <span>
          <span className="block text-[13px] font-medium text-ink">{flag.enabled ? t("enabled") : t("disabled")}</span>
          <span className="block text-[11px] text-ink-muted">{t("killSwitchHint")}</span>
        </span>
      </label>

      <div className={cn(!flag.enabled && "opacity-50")}>
        <p className="mb-1 text-[11px] font-medium text-ink-muted">{t("rollout")}</p>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={flag.rolloutPercent}
            onChange={(event) => update({ rolloutPercent: Number(event.target.value) })}
            disabled={disabled || !flag.enabled}
            aria-label={t("rollout")}
            className="h-1.5 flex-1 accent-primary"
          />
          <Input
            value={String(flag.rolloutPercent)}
            inputMode="numeric"
            onChange={(event) => {
              const parsed = parseNumberDraft(event.target.value);
              update({ rolloutPercent: parsed === null ? 0 : Math.max(0, Math.min(100, Math.round(parsed))) });
            }}
            disabled={disabled || !flag.enabled}
            aria-label={t("rolloutPercent")}
            className="h-7 w-16 text-right text-[12px] tabular-nums"
          />
          <span className="text-[12px] text-ink-muted">%</span>
        </div>
        <p className="mt-1 text-[11px] text-ink-subtle">{t("rolloutHint")}</p>
      </div>

      <div className={cn("grid gap-3", !flag.enabled && "opacity-50")}>
        {listField("allowPlans", t("planPlaceholder"))}
        {listField("allowWorkspaces", t("workspacePlaceholder"))}
        {listField("denyWorkspaces", t("workspacePlaceholder"))}
      </div>
    </div>
  );
}
