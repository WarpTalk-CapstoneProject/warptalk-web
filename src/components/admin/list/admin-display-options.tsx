"use client";

import {
  ArrowDown,
  ArrowUp,
  Kanban,
  ListBullets,
  SlidersHorizontal,
} from "@phosphor-icons/react/dist/ssr";
import { useTranslations } from "next-intl";
import { useId } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { defaultListState } from "@/lib/admin/list-state";
import { cn } from "@/lib/utils";

import type { AdminDisplayConfig } from "./types";
import type { AdminListController } from "./use-admin-list-state";

const selectClass =
  "h-7 min-w-0 flex-1 rounded-md border border-hairline bg-surface-1 px-2 text-[12px] text-ink focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20";

/**
 * "Display": how the rows are shown, never which rows. View, grouping, ordering, the toggles that
 * change what a row means (show deleted), and which properties are columns. A reset returns all of
 * it to the list's defaults and leaves the filters alone — they are a different question.
 */
export function AdminDisplayOptions({
  list,
  display,
}: {
  list: AdminListController;
  display: AdminDisplayConfig;
}) {
  const t = useTranslations("adminLists.display");
  const id = useId();
  const { state } = list;
  const defaults = defaultListState(list.config);
  const changed =
    state.sort.field !== defaults.sort.field ||
    state.sort.direction !== defaults.sort.direction ||
    state.group !== defaults.group ||
    state.view !== defaults.view ||
    state.hidden.slice().sort().join() !== defaults.hidden.slice().sort().join() ||
    Object.entries(state.toggles).some(([key, value]) => defaults.toggles[key] !== value);

  return (
    <Popover>
      <PopoverTrigger
        aria-label={t("title")}
        className={cn(
          "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-hairline bg-surface-1 px-2.5 text-[13px] text-ink-muted transition-colors",
          "hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 data-popup-open:bg-surface-2 data-popup-open:text-ink",
        )}
      >
        <SlidersHorizontal size={14} aria-hidden />
        {t("button")}
        {changed ? <span className="size-1.5 rounded-full bg-primary" aria-hidden /> : null}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-0 p-0">
        {display.board ? (
          <div className="grid grid-cols-2 gap-1 border-b border-hairline p-2" role="radiogroup" aria-label={t("view")}>
            {(["list", "board"] as const).map((view) => {
              const Icon = view === "list" ? ListBullets : Kanban;
              const selected = state.view === view;
              return (
                <button
                  key={view}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => list.setView(view)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-md border py-2 text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                    selected
                      ? "border-border bg-surface-2 font-medium text-ink"
                      : "border-transparent text-ink-muted hover:bg-surface-2 hover:text-ink",
                  )}
                >
                  <Icon size={16} aria-hidden />
                  {t(view)}
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="flex flex-col gap-2 border-b border-hairline p-3">
          {display.groupOptions?.length ? (
            <div className="flex items-center gap-3">
              <label htmlFor={`${id}-group`} className="w-20 shrink-0 text-[12px] text-ink-muted">
                {t("grouping")}
              </label>
              <select
                id={`${id}-group`}
                value={state.group}
                onChange={(event) => list.setGroup(event.target.value)}
                className={selectClass}
              >
                <option value="none">{t("noGrouping")}</option>
                {display.groupOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {display.sortOptions.length ? (
            <div className="flex items-center gap-3">
              <label htmlFor={`${id}-sort`} className="w-20 shrink-0 text-[12px] text-ink-muted">
                {t("ordering")}
              </label>
              <select
                id={`${id}-sort`}
                value={state.sort.field}
                onChange={(event) => list.setSort(event.target.value, state.sort.direction)}
                className={selectClass}
              >
                {display.sortOptions.map((option) => (
                  <option key={option.field} value={option.field}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => list.setSort(state.sort.field, state.sort.direction === "asc" ? "desc" : "asc")}
                aria-label={state.sort.direction === "asc" ? t("ascending") : t("descending")}
                title={state.sort.direction === "asc" ? t("ascending") : t("descending")}
                className="grid size-7 shrink-0 place-items-center rounded-md border border-hairline text-ink-muted hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                {state.sort.direction === "asc" ? <ArrowUp size={13} /> : <ArrowDown size={13} />}
              </button>
            </div>
          ) : null}
        </div>

        {display.toggles?.length ? (
          <div className="flex flex-col gap-2 border-b border-hairline p-3">
            {display.toggles.map((toggle) => (
              <label key={toggle.key} className="flex items-center justify-between gap-3 text-[12px] text-ink">
                <span className="min-w-0">
                  <span className="block">{toggle.label}</span>
                  {toggle.description ? (
                    <span className="block text-[11px] text-ink-subtle">{toggle.description}</span>
                  ) : null}
                </span>
                <Switch
                  size="sm"
                  checked={state.toggles[toggle.key] ?? false}
                  onCheckedChange={(checked) => list.setToggle(toggle.key, Boolean(checked))}
                />
              </label>
            ))}
          </div>
        ) : null}

        {display.columns?.length ? (
          <div className="border-b border-hairline p-3">
            <p className="mb-2 text-[11px] font-medium text-ink-muted">{t("properties")}</p>
            <div className="flex flex-wrap gap-1.5">
              {display.columns.map((column) => {
                const shown = !state.hidden.includes(column.id);
                return (
                  <button
                    key={column.id}
                    type="button"
                    aria-pressed={shown}
                    onClick={() => list.setColumnHidden(column.id, shown)}
                    className={cn(
                      "rounded-md border px-2 py-1 text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                      shown
                        ? "border-border bg-surface-2 text-ink"
                        : "border-dashed border-hairline text-ink-subtle hover:text-ink",
                    )}
                  >
                    {column.label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="flex justify-end p-2">
          <button
            type="button"
            disabled={!changed}
            onClick={() => list.resetDisplay()}
            className="h-7 rounded-md px-2 text-[12px] text-ink-muted hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-40"
          >
            {t("reset")}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
