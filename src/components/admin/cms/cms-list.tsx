"use client";

/**
 * The list half of both CMS screens (Email templates, Announcements): the toolbar with search,
 * filter chips, sort and the card/table toggle; the selection checkbox; the bulk bar that appears
 * once something is ticked; and the empty state.
 */

import { useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { MagnifyingGlass, Rows, SquaresFour, X } from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { headerState, parseListView, type ListView } from "@/lib/admin/cms-selection";
import { cn } from "@/lib/utils";

/** The chosen view, remembered per list in this browser. */
export function useListView(storageKey: string): [ListView, (view: ListView) => void] {
  const [view, setView] = useState<ListView>("cards");
  useEffect(() => {
    try {
      // Read after mount: the server render has no storage, and a mismatch would warn.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from storage
      setView(parseListView(window.localStorage.getItem(storageKey)));
    } catch {
      /* storage blocked: cards */
    }
  }, [storageKey]);
  const choose = (next: ListView) => {
    setView(next);
    try {
      window.localStorage.setItem(storageKey, next);
    } catch {
      /* not remembered */
    }
  };
  return [view, choose];
}

export function CmsViewToggle({ view, onChange }: { view: ListView; onChange: (view: ListView) => void }) {
  const t = useTranslations("adminCms.common.list");
  return (
    <div role="radiogroup" aria-label={t("view")} className="flex items-center rounded-lg border border-border p-0.5">
      {(["cards", "table"] as const).map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={view === option}
          aria-label={t(option)}
          title={t(option)}
          onClick={() => onChange(option)}
          className={cn(
            "flex size-7 items-center justify-center rounded-md text-ink-muted transition-colors hover:text-ink",
            view === option && "bg-surface-2 text-ink",
          )}
        >
          {option === "cards" ? <SquaresFour size={15} /> : <Rows size={15} />}
        </button>
      ))}
    </div>
  );
}

export function CmsSearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const t = useTranslations("adminCms.common.list");
  return (
    <div className="relative w-full sm:w-64">
      <MagnifyingGlass size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-subtle" />
      <Input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-8 pl-8 pr-7 text-[13px]"
      />
      {value ? (
        <button
          type="button"
          aria-label={t("clearSearch")}
          onClick={() => onChange("")}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-ink-subtle hover:text-ink"
        >
          <X size={12} />
        </button>
      ) : null}
    </div>
  );
}

export function CmsSortSelect<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const t = useTranslations("adminCms.common.list");
  return (
    <label className="flex items-center gap-1.5 text-[12px] text-ink-muted">
      <span className="hidden sm:inline">{t("sortBy")}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="h-8 rounded-lg border border-border bg-surface-1 px-2 text-[12.5px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** The row under the header: filter chips on the left, search/sort/view on the right. */
export function CmsToolbar({ chips, controls }: { chips: ReactNode; controls: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-b border-border py-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">{chips}</div>
      <div className="flex flex-wrap items-center gap-2">{controls}</div>
    </div>
  );
}

export function CmsSelectBox({
  checked,
  onChange,
  label,
  className,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  className?: string;
}) {
  return (
    <Checkbox
      checked={checked}
      onCheckedChange={() => onChange()}
      aria-label={label}
      onClick={(event) => event.stopPropagation()}
      className={className}
    />
  );
}

/** The "select all visible" box: ticked, empty, or indeterminate. */
export function CmsSelectAll({
  selected,
  visible,
  onToggle,
}: {
  selected: readonly string[];
  visible: readonly string[];
  onToggle: () => void;
}) {
  const t = useTranslations("adminCms.common.list");
  const state = headerState(selected, visible);
  return (
    <Checkbox
      checked={state === "all"}
      indeterminate={state === "some"}
      onCheckedChange={() => onToggle()}
      aria-label={t("selectAll")}
      disabled={visible.length === 0}
    />
  );
}

/**
 * Appears once something is ticked, pinned to the bottom of the viewport so it is reachable from
 * anywhere in a long list. The actions are the caller's — only those that apply to at least one
 * selected item.
 */
export function CmsBulkBar({
  count,
  onClear,
  children,
}: {
  count: number;
  onClear: () => void;
  children: ReactNode;
}) {
  const t = useTranslations("adminCms.common.bulk");
  if (count === 0) return null;
  return (
    <div className="pointer-events-none sticky bottom-4 z-30 mt-4 flex justify-center">
      <div
        role="toolbar"
        aria-label={t("label")}
        className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface-1 px-3 py-2 shadow-[0_16px_40px_-12px_rgba(17,18,20,0.3)]"
      >
        <span className="px-1 text-[12.5px] font-medium tabular-nums text-ink">{t("selected", { count })}</span>
        <span className="h-4 w-px bg-border" aria-hidden />
        {children}
        <Button variant="ghost" size="sm" onClick={onClear}>
          {t("clear")}
        </Button>
      </div>
    </div>
  );
}

export function CmsEmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-surface-1 px-6 py-14 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-surface-2 text-ink-muted">{icon}</span>
      <p className="mt-3 text-[14px] font-medium text-ink">{title}</p>
      {description ? <p className="mt-1 max-w-md text-[12.5px] text-ink-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/** A table shell matching the admin tables: a bordered panel, 12px header, hover rows. */
export function CmsTable({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface-1">
      <table className="w-full min-w-[760px] text-left text-[13px]">
        <thead className="border-b border-border text-[11.5px] text-ink-muted">
          <tr>{head}</tr>
        </thead>
        <tbody className="divide-y divide-border/70">{children}</tbody>
      </table>
    </div>
  );
}

export function CmsTh({ children, className }: { children?: ReactNode; className?: string }) {
  return <th className={cn("px-3 py-2.5 font-medium", className)}>{children}</th>;
}

export function CmsTd({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cn("px-3 py-2.5 align-middle", className)}>{children}</td>;
}
