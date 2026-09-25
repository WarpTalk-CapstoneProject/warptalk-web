/**
 * The state of an admin list — search, filters, ordering, grouping, view and visible columns — and
 * how it is written into, and read back out of, the URL.
 *
 * The URL is the only store. A view an admin builds is a link they can paste to a colleague, and
 * it survives a reload, a back button and a new tab. Everything here is pure so the round trip is
 * tested in node without a browser (`src/lib/admin/__tests__/list-state.test.ts`); the React hook
 * that drives it lives in `components/admin/list/use-admin-list-state.ts`.
 *
 * URL shape (every key omitted while it holds its default, so an untouched list has a bare URL):
 *
 *   q=acme                     search
 *   status=active,suspended    enum filter — comma-separated, OR within the property
 *   created=2026-01-01..2026-02-01   date range, both ends optional, calendar days, `to` inclusive
 *   members=5..                number range, both ends optional
 *   autoRenew=true             boolean filter
 *   workspace=<id>,<id>        entity filter (ids; the label is looked up by the page)
 *   sort=created&dir=desc      ordering
 *   group=status               grouping ("none" is the default and never written)
 *   view=board                 list | board
 *   hide=owner,created         hidden columns, written only when they differ from the defaults
 *   deleted=1                  a display toggle
 *   page=3                     page, dropped whenever anything else changes
 *
 * Filters across properties combine with AND; values inside one property combine with OR — the
 * same rule Linear's filter bar uses, and the only one that reads naturally from the chips.
 */

export type SortDirection = "asc" | "desc";
export type ListView = "list" | "board";

export type ListFilterKind = "enum" | "dateRange" | "numberRange" | "boolean" | "entity";

export interface ListFilterDef {
  /** The URL parameter. Must not be one of RESERVED_PARAMS. */
  key: string;
  kind: ListFilterKind;
  /** enum/entity: whether several values may be chosen at once. Default false. */
  multiple?: boolean;
  /**
   * enum: the values the URL may carry. Anything else is dropped on read, so a stale or
   * hand-edited link degrades to "no filter" instead of sending the server a value it rejects.
   * Omit for an open set (plan slugs, loaded after the page mounts).
   */
  values?: readonly string[];
}

export type FilterValue =
  | { kind: "enum"; values: string[] }
  | { kind: "entity"; values: string[] }
  | { kind: "dateRange"; from?: string; to?: string }
  | { kind: "numberRange"; min?: number; max?: number }
  | { kind: "boolean"; value: boolean };

export interface ListToggleDef {
  key: string;
  default: boolean;
}

export interface ListColumnDef {
  id: string;
  defaultHidden?: boolean;
}

export interface ListStateConfig {
  filters?: readonly ListFilterDef[];
  sortFields: readonly string[];
  defaultSort: { field: string; direction: SortDirection };
  columns?: readonly ListColumnDef[];
  /** Group keys this list can group by. "none" is always allowed and is the default. */
  groupings?: readonly string[];
  defaultGroup?: string;
  views?: readonly ListView[];
  defaultView?: ListView;
  toggles?: readonly ListToggleDef[];
}

export interface ListState {
  search: string;
  filters: Record<string, FilterValue>;
  sort: { field: string; direction: SortDirection };
  group: string;
  view: ListView;
  hidden: string[];
  toggles: Record<string, boolean>;
  page: number;
}

export const RESERVED_PARAMS = ["q", "sort", "dir", "group", "view", "hide", "page"] as const;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value: string | undefined): value is string {
  if (!value || !DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

function parseNumber(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function splitList(raw: string): string[] {
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Reads one filter out of its raw URL value; null when it is absent or unusable. */
export function parseFilterValue(def: ListFilterDef, raw: string | null): FilterValue | null {
  if (raw === null) return null;
  switch (def.kind) {
    case "enum": {
      let values = splitList(raw);
      if (def.values) values = values.filter((value) => def.values!.includes(value));
      values = Array.from(new Set(values));
      if (!def.multiple) values = values.slice(0, 1);
      return values.length ? { kind: "enum", values } : null;
    }
    case "entity": {
      let values = Array.from(new Set(splitList(raw)));
      if (!def.multiple) values = values.slice(0, 1);
      return values.length ? { kind: "entity", values } : null;
    }
    case "dateRange": {
      const [fromRaw, toRaw] = raw.split("..");
      const from = isValidDate(fromRaw) ? fromRaw : undefined;
      const to = isValidDate(toRaw) ? toRaw : undefined;
      if (!from && !to) return null;
      // A reversed range is a typo, not a request for nothing: swap it rather than return zero rows.
      if (from && to && from > to) return { kind: "dateRange", from: to, to: from };
      return { kind: "dateRange", from, to };
    }
    case "numberRange": {
      const [minRaw, maxRaw] = raw.split("..");
      const min = parseNumber(minRaw);
      const max = parseNumber(maxRaw);
      if (min === undefined && max === undefined) return null;
      if (min !== undefined && max !== undefined && min > max) {
        return { kind: "numberRange", min: max, max: min };
      }
      return { kind: "numberRange", min, max };
    }
    case "boolean": {
      if (raw === "true" || raw === "1") return { kind: "boolean", value: true };
      if (raw === "false" || raw === "0") return { kind: "boolean", value: false };
      return null;
    }
  }
}

/** Writes one filter back to its URL value; null when it has nothing to say. */
export function serializeFilterValue(value: FilterValue | null | undefined): string | null {
  if (!value) return null;
  switch (value.kind) {
    case "enum":
    case "entity":
      return value.values.length ? value.values.join(",") : null;
    case "dateRange":
      if (!value.from && !value.to) return null;
      return `${value.from ?? ""}..${value.to ?? ""}`;
    case "numberRange":
      if (value.min === undefined && value.max === undefined) return null;
      return `${value.min ?? ""}..${value.max ?? ""}`;
    case "boolean":
      return value.value ? "true" : "false";
  }
}

export function isFilterActive(value: FilterValue | null | undefined): boolean {
  return serializeFilterValue(value) !== null;
}

export function defaultHiddenColumns(config: ListStateConfig): string[] {
  return (config.columns ?? []).filter((column) => column.defaultHidden).map((column) => column.id);
}

export function defaultListState(config: ListStateConfig): ListState {
  return {
    search: "",
    filters: {},
    sort: { ...config.defaultSort },
    group: config.defaultGroup ?? "none",
    view: config.defaultView ?? "list",
    hidden: defaultHiddenColumns(config),
    toggles: Object.fromEntries((config.toggles ?? []).map((toggle) => [toggle.key, toggle.default])),
    page: 1,
  };
}

type ParamsLike = { get(name: string): string | null };

export function parseListState(params: ParamsLike, config: ListStateConfig): ListState {
  const state = defaultListState(config);

  state.search = (params.get("q") ?? "").trim();

  for (const def of config.filters ?? []) {
    const value = parseFilterValue(def, params.get(def.key));
    if (value) state.filters[def.key] = value;
  }

  const sortField = params.get("sort");
  if (sortField && config.sortFields.includes(sortField)) {
    state.sort.field = sortField;
    // A field chosen without a direction reads in the default direction for that list.
  }
  const dir = params.get("dir");
  if (dir === "asc" || dir === "desc") state.sort.direction = dir;

  const group = params.get("group");
  if (group && (group === "none" || (config.groupings ?? []).includes(group))) state.group = group;

  const view = params.get("view");
  if ((view === "list" || view === "board") && (config.views ?? ["list"]).includes(view)) {
    state.view = view;
  }

  const hide = params.get("hide");
  if (hide !== null) {
    const known = new Set((config.columns ?? []).map((column) => column.id));
    state.hidden = splitList(hide).filter((id) => known.has(id));
  }

  for (const toggle of config.toggles ?? []) {
    const raw = params.get(toggle.key);
    if (raw === "1" || raw === "true") state.toggles[toggle.key] = true;
    else if (raw === "0" || raw === "false") state.toggles[toggle.key] = false;
  }

  const page = Number.parseInt(params.get("page") ?? "1", 10);
  state.page = Number.isFinite(page) && page > 0 ? page : 1;

  return state;
}

/** Every URL key the toolkit owns for this config — the ones it may delete and rewrite. */
export function ownedParamKeys(config: ListStateConfig): string[] {
  return [
    ...RESERVED_PARAMS,
    ...(config.filters ?? []).map((def) => def.key),
    ...(config.toggles ?? []).map((toggle) => toggle.key),
  ];
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((item) => set.has(item));
}

/**
 * Writes `state` into a copy of `current`, keeping every parameter the list does not own (a page's
 * own `tab=`, say) and omitting every value that equals its default.
 */
export function serializeListState(
  state: ListState,
  config: ListStateConfig,
  current: ParamsLike & { toString(): string } = new URLSearchParams(),
): URLSearchParams {
  const params = new URLSearchParams(current.toString());
  for (const key of ownedParamKeys(config)) params.delete(key);

  const defaults = defaultListState(config);

  if (state.search.trim()) params.set("q", state.search.trim());

  for (const def of config.filters ?? []) {
    const raw = serializeFilterValue(state.filters[def.key]);
    if (raw !== null) params.set(def.key, raw);
  }

  if (state.sort.field !== defaults.sort.field) params.set("sort", state.sort.field);
  if (state.sort.direction !== defaults.sort.direction) params.set("dir", state.sort.direction);
  if (state.group !== defaults.group) params.set("group", state.group);
  if (state.view !== defaults.view) params.set("view", state.view);
  if (!sameSet(state.hidden, defaults.hidden)) params.set("hide", state.hidden.join(","));

  for (const toggle of config.toggles ?? []) {
    const value = state.toggles[toggle.key] ?? toggle.default;
    if (value !== toggle.default) params.set(toggle.key, value ? "1" : "0");
  }

  if (state.page > 1) params.set("page", String(state.page));

  return params;
}

export function countActiveFilters(state: Pick<ListState, "filters">): number {
  return Object.values(state.filters).filter(isFilterActive).length;
}

/** Whether anything narrows the rows — the difference between "empty" and "no matches". */
export function hasNarrowing(state: Pick<ListState, "filters" | "search">): boolean {
  return state.search.trim() !== "" || countActiveFilters(state) > 0;
}

/** Adds or removes one value of an enum/entity filter, honouring single-select. */
export function toggleFilterValue(
  current: FilterValue | undefined,
  kind: "enum" | "entity",
  value: string,
  multiple: boolean,
): FilterValue | null {
  const values = current && (current.kind === "enum" || current.kind === "entity") ? current.values : [];
  let next: string[];
  if (values.includes(value)) next = values.filter((item) => item !== value);
  else next = multiple ? [...values, value] : [value];
  return next.length ? { kind, values: next } : null;
}

// ───────────────────── reading filters for an API query ─────────────────────

type Filters = ListState["filters"];

/** The chosen values of an enum filter; empty when it is not set. */
export function enumValues(filters: Filters, key: string): string[] {
  const value = filters[key];
  return value?.kind === "enum" ? value.values : [];
}

/** The one value of a single-select enum filter, for an API that takes one. */
export function enumValue(filters: Filters, key: string): string | undefined {
  return enumValues(filters, key)[0];
}

export function entityValues(filters: Filters, key: string): string[] {
  const value = filters[key];
  return value?.kind === "entity" ? value.values : [];
}

export function dateRangeValue(filters: Filters, key: string): { from?: string; to?: string } | undefined {
  const value = filters[key];
  return value?.kind === "dateRange" ? { from: value.from, to: value.to } : undefined;
}

export function numberRangeValue(filters: Filters, key: string): { min?: number; max?: number } | undefined {
  const value = filters[key];
  return value?.kind === "numberRange" ? { min: value.min, max: value.max } : undefined;
}

export function booleanValue(filters: Filters, key: string): boolean | undefined {
  const value = filters[key];
  return value?.kind === "boolean" ? value.value : undefined;
}

/** A single-select enum filter for `value`, or no filter for "all"/empty — what status tabs write. */
export function singleEnumFilter(value: string | null | undefined, allValue = "all"): FilterValue | null {
  return value && value !== allValue ? { kind: "enum", values: [value] } : null;
}

// ───────────────────────────── dates ─────────────────────────────

export type DatePreset = "today" | "7d" | "30d" | "90d" | "thisMonth" | "lastMonth" | "thisYear";

export const DATE_PRESETS: readonly DatePreset[] = ["today", "7d", "30d", "90d", "thisMonth", "lastMonth", "thisYear"];

function ymd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** A preset as calendar days in the viewer's local time, `to` inclusive. */
export function datePresetRange(preset: DatePreset, now: Date = new Date()): { from: string; to: string } {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysAgo = (n: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - n);
  switch (preset) {
    case "today":
      return { from: ymd(today), to: ymd(today) };
    case "7d":
      return { from: ymd(daysAgo(6)), to: ymd(today) };
    case "30d":
      return { from: ymd(daysAgo(29)), to: ymd(today) };
    case "90d":
      return { from: ymd(daysAgo(89)), to: ymd(today) };
    case "thisMonth":
      return { from: ymd(new Date(today.getFullYear(), today.getMonth(), 1)), to: ymd(today) };
    case "lastMonth": {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const last = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from: ymd(first), to: ymd(last) };
    }
    case "thisYear":
      return { from: ymd(new Date(today.getFullYear(), 0, 1)), to: ymd(today) };
  }
}

/** The preset a range equals today, if any — so a chip can say "Last 30 days" instead of two dates. */
export function matchDatePreset(
  range: { from?: string; to?: string },
  now: Date = new Date(),
): DatePreset | null {
  for (const preset of DATE_PRESETS) {
    const candidate = datePresetRange(preset, now);
    if (candidate.from === range.from && candidate.to === range.to) return preset;
  }
  return null;
}

/**
 * A calendar-day range as instants for an API, in the viewer's local time.
 *
 * `toExclusive` is the start of the day AFTER `to` — the half-open bound most admin endpoints take.
 * `toInclusive` is the last millisecond of `to`, for the older endpoints (the credit ledger) that
 * compare with `<=`.
 */
export function dateRangeBounds(range: { from?: string; to?: string }): {
  from?: string;
  toExclusive?: string;
  toInclusive?: string;
} {
  const result: { from?: string; toExclusive?: string; toInclusive?: string } = {};
  if (range.from && isValidDate(range.from)) {
    const [y, m, d] = range.from.split("-").map(Number);
    result.from = new Date(y, m - 1, d).toISOString();
  }
  if (range.to && isValidDate(range.to)) {
    const [y, m, d] = range.to.split("-").map(Number);
    const next = new Date(y, m - 1, d + 1);
    result.toExclusive = next.toISOString();
    result.toInclusive = new Date(next.getTime() - 1).toISOString();
  }
  return result;
}

// ───────────────────────── client-side lists ─────────────────────────

export type RowValue = string | number | boolean | null | undefined | Date | readonly string[];

export interface ClientListAccessors<T> {
  /** Text fields the search box matches against. */
  search?: (row: T) => readonly (string | null | undefined)[];
  /** One accessor per filter key. Arrays match when any element matches. */
  filters?: Record<string, (row: T) => RowValue>;
  /** One accessor per sort field. */
  sort?: Record<string, (row: T) => string | number | Date | null | undefined>;
}

function toComparable(value: RowValue): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.getTime();
  if (Array.isArray(value)) return null;
  return value as string | number | boolean;
}

function dayOf(value: RowValue): string | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : typeof value === "string" ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  return ymd(date);
}

export function rowMatchesFilter(value: RowValue, filter: FilterValue): boolean {
  switch (filter.kind) {
    case "enum":
    case "entity": {
      if (Array.isArray(value)) return value.some((item) => filter.values.includes(item));
      const comparable = toComparable(value);
      return comparable !== null && filter.values.includes(String(comparable));
    }
    case "boolean":
      return Boolean(value) === filter.value;
    case "numberRange": {
      const number = typeof value === "number" ? value : Number(value);
      if (value === null || value === undefined || Number.isNaN(number)) return false;
      if (filter.min !== undefined && number < filter.min) return false;
      if (filter.max !== undefined && number > filter.max) return false;
      return true;
    }
    case "dateRange": {
      const day = dayOf(value);
      if (!day) return false;
      if (filter.from && day < filter.from) return false;
      if (filter.to && day > filter.to) return false;
      return true;
    }
  }
}

/**
 * Filters and orders a list that is small enough to hold in full (plans, plugins, rate cards).
 *
 * Never for a directory that grows with the platform — those filter in SQL, and a page of them is
 * not the list.
 */
export function applyClientListState<T>(
  rows: readonly T[],
  state: Pick<ListState, "search" | "filters" | "sort">,
  accessors: ClientListAccessors<T>,
  matches: (query: string, texts: readonly (string | null | undefined)[]) => boolean,
): T[] {
  let result = rows.slice();

  if (state.search.trim() && accessors.search) {
    result = result.filter((row) => matches(state.search, accessors.search!(row)));
  }

  for (const [key, filter] of Object.entries(state.filters)) {
    const accessor = accessors.filters?.[key];
    if (!accessor || !isFilterActive(filter)) continue;
    result = result.filter((row) => rowMatchesFilter(accessor(row), filter));
  }

  const sortAccessor = accessors.sort?.[state.sort.field];
  if (sortAccessor) {
    const factor = state.sort.direction === "asc" ? 1 : -1;
    // Stable, with empty values last in either direction: a plan with no price is not the cheapest.
    result = result
      .map((row, index) => ({ row, index, key: sortAccessor(row) }))
      .sort((a, b) => {
        const av = a.key instanceof Date ? a.key.getTime() : a.key;
        const bv = b.key instanceof Date ? b.key.getTime() : b.key;
        const aEmpty = av === null || av === undefined || av === "";
        const bEmpty = bv === null || bv === undefined || bv === "";
        if (aEmpty && bEmpty) return a.index - b.index;
        if (aEmpty) return 1;
        if (bEmpty) return -1;
        let cmp: number;
        if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
        else cmp = String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" });
        return cmp === 0 ? a.index - b.index : cmp * factor;
      })
      .map((entry) => entry.row);
  }

  return result;
}

export interface RowGroup<T> {
  key: string;
  rows: T[];
}

/**
 * Buckets rows by a key, keeping each bucket in the order the rows arrived (so the list's own
 * ordering still holds inside every group). `order` fixes the bucket sequence — a status pipeline
 * reads new → closed, never alphabetically; keys it does not name follow in first-seen order.
 */
export function groupRows<T>(
  rows: readonly T[],
  keyOf: (row: T) => string,
  order: readonly string[] = [],
  includeEmpty = false,
): RowGroup<T>[] {
  const buckets = new Map<string, T[]>();
  if (includeEmpty) for (const key of order) buckets.set(key, []);
  for (const row of rows) {
    const key = keyOf(row);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(row);
    else buckets.set(key, [row]);
  }
  const rank = (key: string) => {
    const index = order.indexOf(key);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };
  const firstSeen = Array.from(buckets.keys());
  return firstSeen
    .sort((a, b) => rank(a) - rank(b) || firstSeen.indexOf(a) - firstSeen.indexOf(b))
    .map((key) => ({ key, rows: buckets.get(key)! }));
}

/** Rows for one page of a client-side list, and the page clamped into range. */
export function paginateRows<T>(rows: readonly T[], page: number, pageSize: number) {
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const start = (safePage - 1) * pageSize;
  return { rows: rows.slice(start, start + pageSize), page: safePage, pageCount, total: rows.length };
}
