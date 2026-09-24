"use client";

import { Check, FunnelSimple, X } from "@phosphor-icons/react/dist/ssr";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DATE_PRESETS,
  countActiveFilters,
  datePresetRange,
  isFilterActive,
  matchDatePreset,
  toggleFilterValue,
  type DatePreset,
  type FilterValue,
} from "@/lib/admin/list-state";
import { matchesSearch } from "@/lib/admin/search-text";
import { cn } from "@/lib/utils";

import type { AdminFilterField, AdminFilterOption } from "./types";
import type { AdminListController } from "./use-admin-list-state";

/**
 * Labels for entity ids, remembered for the session. A chip for "Workspace is Acme" should not
 * flash a raw id every time the list re-renders, and a picked entity's label is known the moment
 * it is picked — the resolver is only for ids that arrived in a shared link.
 */
const entityLabels = new Map<string, AdminFilterOption>();
const labelKey = (field: string, id: string) => `${field}:${id}`;

function rememberEntities(field: string, options: readonly AdminFilterOption[]) {
  for (const option of options) entityLabels.set(labelKey(field, option.value), option);
}

function useEntityOptions(field: AdminFilterField | undefined, ids: readonly string[]) {
  const entityField = field?.kind === "entity" ? field : undefined;
  const missing = entityField ? ids.filter((id) => !entityLabels.has(labelKey(entityField.key, id))) : [];
  const query = useQuery({
    queryKey: ["admin-list-entity-labels", entityField?.key ?? "", missing] as const,
    queryFn: async () => {
      const options = await entityField!.resolve!(missing);
      rememberEntities(entityField!.key, options);
      return options;
    },
    enabled: Boolean(entityField?.resolve) && missing.length > 0,
    staleTime: 5 * 60_000,
  });
  return ids.map(
    (id) =>
      (entityField && entityLabels.get(labelKey(entityField.key, id))) ??
      query.data?.find((option) => option.value === id) ?? { value: id, label: id.length > 12 ? `${id.slice(0, 8)}…` : id },
  );
}

function useDateFormatter() {
  const locale = useLocale();
  return useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", year: "numeric" });
    return (day: string) => {
      const [y, m, d] = day.split("-").map(Number);
      return formatter.format(new Date(y, m - 1, d));
    };
  }, [locale]);
}

function useNumberFormatter() {
  const locale = useLocale();
  return useMemo(() => new Intl.NumberFormat(locale), [locale]);
}

// ───────────────────────────── the Filter menu ─────────────────────────────

/**
 * The "Filter" button: pick a property, then a value, Linear-style. Enum and boolean properties are
 * chosen right in the submenu; ranges offer presets there and hand anything custom to the chip's
 * own editor, which is where a date or a number can actually be typed.
 */
export function AdminFilterMenu({
  fields,
  list,
  onEdit,
}: {
  fields: readonly AdminFilterField[];
  list: AdminListController;
  onEdit: (key: string) => void;
}) {
  const t = useTranslations("adminLists.filters");
  const tToolbar = useTranslations("adminLists.toolbar");
  const active = countActiveFilters(list.state);
  const now = useMemo(() => new Date(), []);

  // After the menu has closed and returned focus to its trigger — opening the chip's popover in the
  // same tick would have its focus stolen straight back by the closing menu.
  const editLater = (key: string) => window.setTimeout(() => onEdit(key), 60);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={tToolbar("filterAria")}
        className={cn(
          "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-hairline bg-surface-1 px-2.5 text-[13px] text-ink-muted transition-colors",
          "hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 data-popup-open:bg-surface-2 data-popup-open:text-ink",
        )}
      >
        <FunnelSimple size={14} aria-hidden />
        {tToolbar("filter")}
        {active > 0 ? (
          <span className="rounded-full bg-primary/15 px-1.5 text-[11px] font-medium tabular-nums text-primary">
            {active}
          </span>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("filterBy")}</DropdownMenuLabel>
          {fields.map((field) => {
            const value = list.state.filters[field.key];
            const set = (next: FilterValue | null) => list.setFilter(field.key, next);
            const trigger = (
              <>
                {field.icon ? <span className="text-ink-subtle">{field.icon}</span> : null}
                <span className="flex-1 truncate">{field.label}</span>
                {isFilterActive(value) ? <span className="size-1.5 rounded-full bg-primary" aria-hidden /> : null}
              </>
            );

            if (field.kind === "entity" || (field.kind === "numberRange" && !field.presets?.length)) {
              return (
                <DropdownMenuItem key={field.key} onClick={() => editLater(field.key)}>
                  {trigger}
                </DropdownMenuItem>
              );
            }

            return (
              <DropdownMenuSub key={field.key}>
                <DropdownMenuSubTrigger>{trigger}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="max-h-80 min-w-44">
                  {field.kind === "enum" && field.multiple
                    ? field.options.map((option) => (
                        <DropdownMenuCheckboxItem
                          key={option.value}
                          checked={value?.kind === "enum" && value.values.includes(option.value)}
                          onCheckedChange={() => set(toggleFilterValue(value, "enum", option.value, true))}
                        >
                          {option.label}
                        </DropdownMenuCheckboxItem>
                      ))
                    : null}
                  {field.kind === "enum" && !field.multiple ? (
                    <DropdownMenuRadioGroup
                      value={value?.kind === "enum" ? value.values[0] ?? "" : ""}
                      onValueChange={(next) => set(next ? { kind: "enum", values: [String(next)] } : null)}
                    >
                      {field.options.map((option) => (
                        <DropdownMenuRadioItem key={option.value} value={option.value} closeOnClick>
                          {option.label}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  ) : null}
                  {field.kind === "boolean" ? (
                    <DropdownMenuRadioGroup
                      value={value?.kind === "boolean" ? String(value.value) : ""}
                      onValueChange={(next) => set({ kind: "boolean", value: next === "true" })}
                    >
                      <DropdownMenuRadioItem value="true" closeOnClick>
                        {field.trueLabel ?? t("yes")}
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="false" closeOnClick>
                        {field.falseLabel ?? t("no")}
                      </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  ) : null}
                  {field.kind === "dateRange" ? (
                    <>
                      <DropdownMenuRadioGroup
                        value={value?.kind === "dateRange" ? matchDatePreset(value, now) ?? "" : ""}
                        onValueChange={(preset) =>
                          set({ kind: "dateRange", ...datePresetRange(preset as DatePreset, new Date()) })
                        }
                      >
                        {DATE_PRESETS.map((preset) => (
                          <DropdownMenuRadioItem key={preset} value={preset} closeOnClick>
                            {t(`presets.${preset}`)}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => editLater(field.key)}>{t("customRange")}</DropdownMenuItem>
                    </>
                  ) : null}
                  {field.kind === "numberRange" ? (
                    <>
                      {field.presets?.map((preset) => (
                        <DropdownMenuItem
                          key={preset.label}
                          onClick={() => set({ kind: "numberRange", min: preset.min, max: preset.max })}
                        >
                          {preset.label}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => editLater(field.key)}>{t("customRange")}</DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            );
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ───────────────────────────── active filter chips ─────────────────────────────

/**
 * One chip per active property: "Status · is any of · Active, Suspended · ×". The value segment
 * opens the property's editor; the × removes the whole property. A property the admin has just
 * asked to edit (a custom range) shows its chip before it has a value, and disappears again if the
 * editor is dismissed without applying anything.
 */
export function AdminFilterChips({
  fields,
  list,
  editingKey,
  onEditingKeyChange,
}: {
  fields: readonly AdminFilterField[];
  list: AdminListController;
  editingKey: string | null;
  onEditingKeyChange: (key: string | null) => void;
}) {
  const t = useTranslations("adminLists.toolbar");
  const shown = fields.filter((field) => isFilterActive(list.state.filters[field.key]) || editingKey === field.key);
  if (shown.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="list" aria-label={t("activeFiltersAria")}>
      {shown.map((field) => (
        <FilterChip
          key={field.key}
          field={field}
          value={list.state.filters[field.key]}
          open={editingKey === field.key}
          onOpenChange={(open) => onEditingKeyChange(open ? field.key : null)}
          onChange={(next) => list.setFilter(field.key, next)}
        />
      ))}
      {countActiveFilters(list.state) > 0 ? (
        <button
          type="button"
          onClick={() => list.clearFilters()}
          className="h-7 rounded-md px-2 text-[12px] text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          {t("clearFilters")}
        </button>
      ) : null}
    </div>
  );
}

function FilterChip({
  field,
  value,
  open,
  onOpenChange,
  onChange,
}: {
  field: AdminFilterField;
  value: FilterValue | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (value: FilterValue | null) => void;
}) {
  const t = useTranslations("adminLists.filters");
  const { operator, summary } = useChipText(field, value);

  return (
    <div
      role="listitem"
      className="inline-flex h-7 max-w-full items-stretch overflow-hidden rounded-md border border-hairline bg-surface-1 text-[12px] shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
    >
      <span className="flex items-center gap-1.5 border-r border-hairline px-2 text-ink-muted">
        {field.icon ? <span aria-hidden className="text-ink-subtle">{field.icon}</span> : null}
        {field.label}
      </span>
      {operator ? (
        <span className="flex items-center border-r border-hairline px-2 text-ink-subtle">{operator}</span>
      ) : null}
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger
          className="flex min-w-0 items-center px-2 font-medium text-ink transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none data-popup-open:bg-surface-2"
          aria-label={t("editAria", { label: field.label })}
        >
          <span className="max-w-[240px] truncate">{summary || t("chooseValue")}</span>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-2">
          <FilterEditor field={field} value={value} onChange={onChange} onDone={() => onOpenChange(false)} />
        </PopoverContent>
      </Popover>
      <button
        type="button"
        onClick={() => {
          onChange(null);
          onOpenChange(false);
        }}
        aria-label={t("remove", { label: field.label })}
        className="grid w-7 place-items-center border-l border-hairline text-ink-subtle transition-colors hover:bg-surface-2 hover:text-ink focus-visible:bg-surface-2 focus-visible:outline-none"
      >
        <X size={11} weight="bold" />
      </button>
    </div>
  );
}

function useChipText(field: AdminFilterField, value: FilterValue | undefined): { operator: string; summary: string } {
  const t = useTranslations("adminLists.filters");
  const formatDay = useDateFormatter();
  const numbers = useNumberFormatter();
  const entityIds = value?.kind === "entity" ? value.values : [];
  const entities = useEntityOptions(field, entityIds);

  if (!value || !isFilterActive(value)) return { operator: "", summary: "" };

  const list = (labels: string[]) =>
    labels.length <= 2 ? labels.join(", ") : `${labels.slice(0, 2).join(", ")} +${labels.length - 2}`;

  switch (value.kind) {
    case "enum": {
      const options = field.kind === "enum" ? field.options : [];
      const labels = value.values.map((v) => options.find((option) => option.value === v)?.label ?? v);
      return { operator: labels.length > 1 ? t("isAnyOf") : t("is"), summary: list(labels) };
    }
    case "entity":
      return {
        operator: entities.length > 1 ? t("isAnyOf") : t("is"),
        summary: list(entities.map((option) => option.label)),
      };
    case "boolean": {
      const f = field.kind === "boolean" ? field : undefined;
      return { operator: t("is"), summary: value.value ? f?.trueLabel ?? t("yes") : f?.falseLabel ?? t("no") };
    }
    case "dateRange": {
      const preset = matchDatePreset(value);
      if (preset) return { operator: t("is"), summary: t(`presets.${preset}`) };
      if (value.from && value.to) {
        return {
          operator: t("between"),
          summary: value.from === value.to ? formatDay(value.from) : `${formatDay(value.from)} – ${formatDay(value.to)}`,
        };
      }
      if (value.from) return { operator: t("onOrAfter"), summary: formatDay(value.from) };
      return { operator: t("onOrBefore"), summary: formatDay(value.to!) };
    }
    case "numberRange": {
      const unit = field.kind === "numberRange" && field.unit ? ` ${field.unit}` : "";
      if (value.min !== undefined && value.max !== undefined) {
        return {
          operator: t("between"),
          summary: `${numbers.format(value.min)}–${numbers.format(value.max)}${unit}`,
        };
      }
      if (value.min !== undefined) return { operator: t("atLeast"), summary: `${numbers.format(value.min)}${unit}` };
      return { operator: t("atMost"), summary: `${numbers.format(value.max!)}${unit}` };
    }
  }
}

// ───────────────────────────── editors ─────────────────────────────

function FilterEditor({
  field,
  value,
  onChange,
  onDone,
}: {
  field: AdminFilterField;
  value: FilterValue | undefined;
  onChange: (value: FilterValue | null) => void;
  onDone: () => void;
}) {
  switch (field.kind) {
    case "enum":
      return <EnumEditor field={field} value={value} onChange={onChange} />;
    case "boolean":
      return <BooleanEditor field={field} value={value} onChange={onChange} onDone={onDone} />;
    case "dateRange":
      return <DateRangeEditor value={value} onChange={onChange} onDone={onDone} />;
    case "numberRange":
      return <NumberRangeEditor field={field} value={value} onChange={onChange} onDone={onDone} />;
    case "entity":
      return <EntityEditor field={field} value={value} onChange={onChange} />;
  }
}

function OptionRow({
  selected,
  multiple,
  onSelect,
  children,
  hint,
}: {
  selected: boolean;
  multiple: boolean;
  onSelect: () => void;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <button
      type="button"
      role={multiple ? "menuitemcheckbox" : "menuitemradio"}
      aria-checked={selected}
      onClick={onSelect}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-ink transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
    >
      <span
        aria-hidden
        className={cn(
          "grid size-4 shrink-0 place-items-center border",
          multiple ? "rounded" : "rounded-full",
          selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface-1",
        )}
      >
        {selected ? <Check size={10} weight="bold" /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{children}</span>
        {hint ? <span className="block truncate text-[11px] text-ink-subtle">{hint}</span> : null}
      </span>
    </button>
  );
}

function EnumEditor({
  field,
  value,
  onChange,
}: {
  field: Extract<AdminFilterField, { kind: "enum" }>;
  value: FilterValue | undefined;
  onChange: (value: FilterValue | null) => void;
}) {
  const t = useTranslations("adminLists.filters");
  const [query, setQuery] = useState("");
  const selected = value?.kind === "enum" ? value.values : [];
  const multiple = Boolean(field.multiple);
  const options = field.options.filter((option) => matchesSearch(query, [option.label, option.value]));

  return (
    <div className="flex flex-col gap-1">
      {field.options.length > 7 ? (
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchOptionsAria", { label: field.label })}
          className="mb-1 h-8 rounded-md border border-hairline bg-surface-1 px-2 text-[13px] text-ink placeholder:text-ink-subtle focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      ) : null}
      <div role="menu" aria-label={field.label} className="max-h-64 overflow-y-auto">
        {options.length === 0 ? <p className="px-2 py-3 text-center text-[12px] text-ink-subtle">{t("noOptions")}</p> : null}
        {options.map((option) => (
          <OptionRow
            key={option.value}
            selected={selected.includes(option.value)}
            multiple={multiple}
            hint={option.hint}
            onSelect={() => onChange(toggleFilterValue(value, "enum", option.value, multiple))}
          >
            {option.label}
          </OptionRow>
        ))}
      </div>
    </div>
  );
}

function BooleanEditor({
  field,
  value,
  onChange,
  onDone,
}: {
  field: Extract<AdminFilterField, { kind: "boolean" }>;
  value: FilterValue | undefined;
  onChange: (value: FilterValue | null) => void;
  onDone: () => void;
}) {
  const t = useTranslations("adminLists.filters");
  const current = value?.kind === "boolean" ? value.value : undefined;
  return (
    <div role="menu" aria-label={field.label}>
      {[true, false].map((option) => (
        <OptionRow
          key={String(option)}
          selected={current === option}
          multiple={false}
          onSelect={() => {
            onChange({ kind: "boolean", value: option });
            onDone();
          }}
        >
          {option ? field.trueLabel ?? t("yes") : field.falseLabel ?? t("no")}
        </OptionRow>
      ))}
    </div>
  );
}

const fieldClass =
  "h-8 w-full rounded-md border border-hairline bg-surface-1 px-2 text-[13px] text-ink focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20";

function EditorActions({ onApply, onClear, applyDisabled }: { onApply: () => void; onClear: () => void; applyDisabled?: boolean }) {
  const t = useTranslations("adminLists.filters");
  return (
    <div className="mt-2 flex items-center justify-end gap-1.5">
      <button
        type="button"
        onClick={onClear}
        className="h-7 rounded-md px-2 text-[12px] text-ink-muted hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        {t("clear")}
      </button>
      <button
        type="submit"
        disabled={applyDisabled}
        onClick={onApply}
        className="h-7 rounded-md bg-primary px-2.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50"
      >
        {t("apply")}
      </button>
    </div>
  );
}

function DateRangeEditor({
  value,
  onChange,
  onDone,
}: {
  value: FilterValue | undefined;
  onChange: (value: FilterValue | null) => void;
  onDone: () => void;
}) {
  const t = useTranslations("adminLists.filters");
  const id = useId();
  const [from, setFrom] = useState(value?.kind === "dateRange" ? value.from ?? "" : "");
  const [to, setTo] = useState(value?.kind === "dateRange" ? value.to ?? "" : "");
  const apply = () => {
    const a = from || undefined;
    const b = to || undefined;
    if (!a && !b) onChange(null);
    else if (a && b && a > b) onChange({ kind: "dateRange", from: b, to: a });
    else onChange({ kind: "dateRange", from: a, to: b });
    onDone();
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        apply();
      }}
    >
      <div className="grid grid-cols-2 gap-1">
        {DATE_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => {
              onChange({ kind: "dateRange", ...datePresetRange(preset) });
              onDone();
            }}
            className="rounded-md px-2 py-1.5 text-left text-[12px] text-ink hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
          >
            {t(`presets.${preset}`)}
          </button>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 border-t border-hairline pt-2">
        <label className="flex flex-col gap-1 text-[11px] text-ink-muted" htmlFor={`${id}-from`}>
          {t("from")}
          <input id={`${id}-from`} type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={fieldClass} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-ink-muted" htmlFor={`${id}-to`}>
          {t("to")}
          <input id={`${id}-to`} type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={fieldClass} />
        </label>
      </div>
      <EditorActions
        onApply={() => undefined}
        onClear={() => {
          onChange(null);
          onDone();
        }}
      />
    </form>
  );
}

function NumberRangeEditor({
  field,
  value,
  onChange,
  onDone,
}: {
  field: Extract<AdminFilterField, { kind: "numberRange" }>;
  value: FilterValue | undefined;
  onChange: (value: FilterValue | null) => void;
  onDone: () => void;
}) {
  const t = useTranslations("adminLists.filters");
  const id = useId();
  const [min, setMin] = useState(value?.kind === "numberRange" && value.min !== undefined ? String(value.min) : "");
  const [max, setMax] = useState(value?.kind === "numberRange" && value.max !== undefined ? String(value.max) : "");
  const parse = (raw: string) => (raw.trim() === "" || !Number.isFinite(Number(raw)) ? undefined : Number(raw));

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const a = parse(min);
        const b = parse(max);
        if (a === undefined && b === undefined) onChange(null);
        else if (a !== undefined && b !== undefined && a > b) onChange({ kind: "numberRange", min: b, max: a });
        else onChange({ kind: "numberRange", min: a, max: b });
        onDone();
      }}
    >
      {field.presets?.length ? (
        <div className="mb-2 flex flex-wrap gap-1 border-b border-hairline pb-2">
          {field.presets.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => {
                onChange({ kind: "numberRange", min: preset.min, max: preset.max });
                onDone();
              }}
              className="rounded-md border border-hairline px-2 py-1 text-[12px] text-ink hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
            >
              {preset.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-[11px] text-ink-muted" htmlFor={`${id}-min`}>
          {t("min")}
          <input
            id={`${id}-min`}
            autoFocus
            type="number"
            inputMode="decimal"
            step={field.step ?? "any"}
            value={min}
            onChange={(e) => setMin(e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-ink-muted" htmlFor={`${id}-max`}>
          {t("max")}
          <input
            id={`${id}-max`}
            type="number"
            inputMode="decimal"
            step={field.step ?? "any"}
            value={max}
            onChange={(e) => setMax(e.target.value)}
            className={fieldClass}
          />
        </label>
      </div>
      <EditorActions
        onApply={() => undefined}
        onClear={() => {
          onChange(null);
          onDone();
        }}
      />
    </form>
  );
}

function EntityEditor({
  field,
  value,
  onChange,
}: {
  field: Extract<AdminFilterField, { kind: "entity" }>;
  value: FilterValue | undefined;
  onChange: (value: FilterValue | null) => void;
}) {
  const t = useTranslations("adminLists.filters");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const selectedIds = value?.kind === "entity" ? value.values : [];
  const selected = useEntityOptions(field, selectedIds);
  const results = useQuery({
    queryKey: ["admin-list-entity-search", field.key, debounced] as const,
    queryFn: async () => {
      const options = await field.search(debounced);
      rememberEntities(field.key, options);
      return options;
    },
    enabled: debounced.length > 0,
    staleTime: 30_000,
  });
  const multiple = Boolean(field.multiple);
  const pick = (option: AdminFilterOption) => {
    rememberEntities(field.key, [option]);
    onChange(toggleFilterValue(value, "entity", option.value, multiple));
  };
  const shown = debounced ? results.data ?? [] : selected;

  return (
    <div className="flex flex-col gap-1">
      <input
        autoFocus
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={field.placeholder ?? t("searchPlaceholder")}
        aria-label={field.placeholder ?? field.label}
        className="mb-1 h-8 rounded-md border border-hairline bg-surface-1 px-2 text-[13px] text-ink placeholder:text-ink-subtle focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
      <div role="menu" aria-label={field.label} aria-busy={results.isFetching} className="max-h-64 overflow-y-auto">
        {debounced && results.isFetching && !results.data ? (
          <p className="px-2 py-3 text-center text-[12px] text-ink-subtle">{t("loading")}</p>
        ) : null}
        {debounced && results.isError ? (
          <p className="px-2 py-3 text-center text-[12px] text-destructive">{t("searchFailed")}</p>
        ) : null}
        {debounced && results.data?.length === 0 ? (
          <p className="px-2 py-3 text-center text-[12px] text-ink-subtle">{t("noOptions")}</p>
        ) : null}
        {!debounced && selected.length === 0 ? (
          <p className="px-2 py-3 text-center text-[12px] text-ink-subtle">{t("typeToSearch")}</p>
        ) : null}
        {shown.map((option) => (
          <OptionRow
            key={option.value}
            selected={selectedIds.includes(option.value)}
            multiple={multiple}
            hint={option.hint}
            onSelect={() => pick(option)}
          >
            {option.label}
          </OptionRow>
        ))}
      </div>
    </div>
  );
}
