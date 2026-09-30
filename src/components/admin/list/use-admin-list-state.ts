"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef } from "react";

import {
  defaultListState,
  hasNarrowing,
  parseListState,
  serializeListState,
  type FilterValue,
  type ListState,
  type ListStateConfig,
  type ListView,
  type SortDirection,
} from "@/lib/admin/list-state";

export interface AdminListController {
  config: ListStateConfig;
  state: ListState;
  /** True while a search or any filter narrows the rows — "no matches", not "empty". */
  narrowed: boolean;
  setSearch: (search: string) => void;
  setFilter: (key: string, value: FilterValue | null) => void;
  clearFilters: () => void;
  setSort: (field: string, direction: SortDirection) => void;
  setGroup: (group: string) => void;
  setView: (view: ListView) => void;
  setColumnHidden: (id: string, hidden: boolean) => void;
  setToggle: (key: string, value: boolean) => void;
  setPage: (page: number) => void;
  /** Ordering, grouping, view, columns and toggles back to the list's defaults. Filters stay. */
  resetDisplay: () => void;
}

/**
 * One admin list's state, read from and written to the URL.
 *
 * `router.replace`, not `push`: flicking through filters should not bury the page that linked
 * here under twenty history entries. `scroll: false` so a filter change does not throw the admin
 * back to the top of the page they were reading.
 *
 * Every change except paging returns to page 1 — page 7 of a list that now has two pages is an
 * empty table that looks like a bug.
 *
 * `config` must be stable (a module-level constant or memoised), because the parsed state is
 * memoised on it.
 */
export function useAdminListState(config: ListStateConfig): AdminListController {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const paramsKey = searchParams.toString();

  const state = useMemo(
    () => parseListState(new URLSearchParams(paramsKey), config),
    [paramsKey, config],
  );

  const commit = useCallback(
    (next: ListState) => {
      const params = serializeListState(next, config, new URLSearchParams(paramsKey));
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [config, paramsKey, pathname, router],
  );

  const update = useCallback(
    (patch: (draft: ListState) => void, keepPage = false) => {
      const draft: ListState = {
        ...state,
        filters: { ...state.filters },
        sort: { ...state.sort },
        hidden: [...state.hidden],
        toggles: { ...state.toggles },
      };
      patch(draft);
      if (!keepPage) draft.page = 1;
      commit(draft);
    },
    [commit, state],
  );

  return useMemo<AdminListController>(
    () => ({
      config,
      state,
      narrowed: hasNarrowing(state),
      setSearch: (search) => {
        if (search.trim() === state.search) return;
        update((draft) => {
          draft.search = search.trim();
        });
      },
      setFilter: (key, value) =>
        update((draft) => {
          if (value) draft.filters[key] = value;
          else delete draft.filters[key];
        }),
      clearFilters: () =>
        update((draft) => {
          draft.filters = {};
          draft.search = "";
        }),
      setSort: (field, direction) =>
        update((draft) => {
          draft.sort = { field, direction };
        }),
      setGroup: (group) =>
        update((draft) => {
          draft.group = group;
        }, true),
      setView: (view) =>
        update((draft) => {
          draft.view = view;
        }, true),
      setColumnHidden: (id, hidden) =>
        update((draft) => {
          const set = new Set(draft.hidden);
          if (hidden) set.add(id);
          else set.delete(id);
          draft.hidden = Array.from(set);
        }, true),
      setToggle: (key, value) =>
        update((draft) => {
          draft.toggles[key] = value;
        }),
      setPage: (page) =>
        update((draft) => {
          draft.page = Math.max(1, page);
        }, true),
      resetDisplay: () =>
        update((draft) => {
          const defaults = defaultListState(config);
          draft.sort = defaults.sort;
          draft.group = defaults.group;
          draft.view = defaults.view;
          draft.hidden = defaults.hidden;
          draft.toggles = defaults.toggles;
        }),
    }),
    [config, state, update],
  );
}

/**
 * Runs a one-shot `action=` intent (from the admin command palette — "Create plan", "Adjust
 * credit…") and strips it from the URL, so a reload or a shared link does not reopen the dialog.
 *
 * An effect, deliberately: the URL is the external system here, and the intent has to be acted on
 * whether the page mounted with it or was already open when the palette pushed it.
 */
export function useAdminActionIntent(handlers: Record<string, () => void>): void {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const action = searchParams.get("action");
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    if (!action) return;
    const params = new URLSearchParams(window.location.search);
    params.delete("action");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    handlersRef.current[action]?.();
  }, [action, pathname, router]);
}
