"use client";

import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

import { AdminDisplayOptions } from "./admin-display-options";
import { AdminFilterChips, AdminFilterMenu } from "./admin-filter-bar";
import { AdminListSearch } from "./admin-list-search";
import type { AdminDisplayConfig, AdminFilterField } from "./types";
import type { AdminListController } from "./use-admin-list-state";

/**
 * The bar above every admin list: search, Filter, Display, the result count, and — on a second row
 * only when there is something to show — the active filter chips.
 *
 * Every popover in it is portalled (Base UI Menu/Popover), so it is never clipped by the
 * `overflow-hidden` panel the table sits in, or by a horizontally scrolling table on a phone.
 */
export function AdminListToolbar({
  list,
  searchPlaceholder,
  filters = [],
  display,
  count,
  countLabel,
  isFetching,
  trailing,
  className,
}: {
  list: AdminListController;
  /** Omit to hide the search box, for a list whose API cannot search. */
  searchPlaceholder?: string;
  filters?: readonly AdminFilterField[];
  display?: AdminDisplayConfig;
  /** Total rows matching, when known. */
  count?: number | null;
  /** Pre-formatted, e.g. "42 workspaces". Falls back to "42 results". */
  countLabel?: string;
  isFetching?: boolean;
  /** Page actions that belong beside the list controls (export, refresh). */
  trailing?: ReactNode;
  className?: string;
}) {
  const t = useTranslations("adminLists.toolbar");
  const [editingKey, setEditingKey] = useState<string | null>(null);

  return (
    <div className={cn("flex flex-col gap-2 py-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        {searchPlaceholder !== undefined ? (
          <AdminListSearch
            value={list.state.search}
            onChange={list.setSearch}
            placeholder={searchPlaceholder}
            className="w-full sm:w-72"
          />
        ) : null}
        {filters.length ? <AdminFilterMenu fields={filters} list={list} onEdit={setEditingKey} /> : null}
        {display ? <AdminDisplayOptions list={list} display={display} /> : null}
        <div className="ml-auto flex items-center gap-2">
          {count !== undefined && count !== null ? (
            <span className="text-[12px] tabular-nums text-ink-subtle" aria-live="polite" aria-atomic="true">
              {isFetching ? t("updating") : countLabel ?? t("results", { count })}
            </span>
          ) : null}
          {trailing}
        </div>
      </div>
      {filters.length ? (
        <AdminFilterChips fields={filters} list={list} editingKey={editingKey} onEditingKeyChange={setEditingKey} />
      ) : null}
    </div>
  );
}
