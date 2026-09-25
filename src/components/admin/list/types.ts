import type { ReactNode } from "react";

import type { ListFilterDef, ListStateConfig } from "@/lib/admin/list-state";

export interface AdminFilterOption {
  value: string;
  label: string;
  /** A second, quieter line — an email under a name, a slug under a workspace. */
  hint?: string;
}

interface FieldBase {
  /** The URL parameter, and the key in `ListState.filters`. */
  key: string;
  label: string;
  icon?: ReactNode;
}

/**
 * A filterable property as the toolbar presents it. The `kind` must agree with the matching
 * `ListFilterDef` in the page's `ListStateConfig` — `filterDefsFromFields` derives those defs from
 * these fields when a page has nothing else to say about them.
 */
export type AdminFilterField =
  | (FieldBase & { kind: "enum"; multiple?: boolean; options: readonly AdminFilterOption[] })
  | (FieldBase & { kind: "boolean"; trueLabel?: string; falseLabel?: string })
  | (FieldBase & { kind: "dateRange" })
  | (FieldBase & {
      kind: "numberRange";
      /** Shown after the bound in the chip — "credits", "members". */
      unit?: string;
      presets?: readonly { label: string; min?: number; max?: number }[];
      step?: number;
    })
  | (FieldBase & {
      kind: "entity";
      multiple?: boolean;
      placeholder?: string;
      /** Options for what was typed. Called debounced, never for an empty query. */
      search: (query: string) => Promise<AdminFilterOption[]>;
      /** Labels for ids that arrived in the URL, so a shared link's chip names the entity. */
      resolve?: (ids: readonly string[]) => Promise<AdminFilterOption[]>;
    });

export interface AdminSortOption {
  field: string;
  label: string;
}

export interface AdminDisplayConfig {
  sortOptions: readonly AdminSortOption[];
  groupOptions?: readonly { key: string; label: string }[];
  /** Offer the List/Board switch. The page's config must list both views. */
  board?: boolean;
  toggles?: readonly { key: string; label: string; description?: string }[];
  /** Hideable columns, in display order. The primary column is never listed here. */
  columns?: readonly { id: string; label: string }[];
}

/** Filter defs for a `ListStateConfig`, straight from the toolbar fields. */
export function filterDefsFromFields(fields: readonly AdminFilterField[]): ListFilterDef[] {
  return fields.map((field) => {
    if (field.kind === "enum") {
      return {
        key: field.key,
        kind: "enum",
        multiple: field.multiple,
        values: field.options.map((option) => option.value),
      };
    }
    if (field.kind === "entity") return { key: field.key, kind: "entity", multiple: field.multiple };
    return { key: field.key, kind: field.kind };
  });
}

export type { ListStateConfig };
