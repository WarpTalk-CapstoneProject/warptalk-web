"use client";

import type { ReactNode } from "react";

import { AdminFilterTabs, type AdminTab } from "@/components/admin/admin-page-chrome";
import { enumValue, singleEnumFilter } from "@/lib/admin/list-state";

import type { AdminListController } from "./use-admin-list-state";

/**
 * Status as view tabs — "All · Active · Suspended · Deleted" — bound to a single-select enum
 * filter in the list state, the way Linear pairs its view tabs with the filter bar.
 *
 * The property is then deliberately left OUT of the Filter menu: two controls for one question
 * would disagree the moment one of them was used. "Clear filters" still returns it to All.
 */
export function AdminStatusTabs<T extends string>({
  list,
  filterKey,
  tabs,
  allValue = "all" as T,
  label,
  trailing,
}: {
  list: AdminListController;
  filterKey: string;
  tabs: readonly AdminTab<T>[];
  allValue?: T;
  label: string;
  trailing?: ReactNode;
}) {
  const current = (enumValue(list.state.filters, filterKey) as T | undefined) ?? allValue;
  return (
    <AdminFilterTabs
      tabs={tabs}
      value={current}
      onChange={(value) => list.setFilter(filterKey, singleEnumFilter(value, allValue))}
      label={label}
      trailing={trailing}
    />
  );
}
