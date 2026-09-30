/**
 * The admin list toolkit: one way to search, filter, order, group and page every list in the
 * platform-admin portal, with the whole view carried in the URL.
 *
 *   const list = useAdminListState(CONFIG);          // CONFIG: a module-level ListStateConfig
 *   <AdminListToolbar list={list} filters={fields} display={display} count={total} />
 *   <AdminDataTable list={list} columns={columns} rows={rows} ... />
 *
 * Server-paged lists map `list.state` onto their API query; small lists (plans, plugins) run
 * `applyClientListState` from `@/lib/admin/list-state` over the rows they already hold.
 */
export { AdminDataTable, type AdminColumn, type AdminGrouping } from "./admin-data-table";
export { AdminDisplayOptions } from "./admin-display-options";
export { AdminFilterChips, AdminFilterMenu } from "./admin-filter-bar";
export { AdminListSearch, ADMIN_LIST_SEARCH_DEBOUNCE_MS } from "./admin-list-search";
export { AdminListToolbar } from "./admin-list-toolbar";
export { AdminStatusTabs } from "./admin-status-tabs";
export {
  filterDefsFromFields,
  type AdminDisplayConfig,
  type AdminFilterField,
  type AdminFilterOption,
  type AdminSortOption,
} from "./types";
export { useAdminActionIntent, useAdminListState, type AdminListController } from "./use-admin-list-state";
export { resolveAdminWorkspaces, searchAdminWorkspaces } from "./entity-sources";
