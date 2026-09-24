# Admin list toolkit and admin command palette

Owner request (2026-09-25): every platform-admin list gets Linear-style search, filters and display
options with the view in the URL; and the admin portal's header search stops offering room codes and
searches admin pages, records and actions instead.

## The list toolkit — `src/components/admin/list/`

| Piece | File | What it does |
| --- | --- | --- |
| `useAdminListState(config)` | `use-admin-list-state.ts` | Parses the URL into `ListState` and writes changes back with `router.replace` (no history spam, `scroll: false`). Every change except paging returns to page 1. Keeps URL params the list does not own (a page's `tab=`). |
| `useAdminActionIntent(handlers)` | same | Runs a one-shot `?action=` (from the palette) and strips it so a reload does not reopen the dialog. |
| `<AdminListToolbar>` | `admin-list-toolbar.tsx` | Search (debounced 300 ms, Enter commits, Esc clears), **Filter** menu, **Display** panel, result count, and a second row of active filter chips. |
| `<AdminFilterMenu>` / `<AdminFilterChips>` | `admin-filter-bar.tsx` | Filter by property → value (sub-menus). Enum (single/multi), boolean, date range (presets + custom), number range (presets + custom), entity (async search, e.g. a workspace picker). Chips read `Status · is any of · Active, Suspended · ×`; the value opens that property's editor. AND across properties, OR within one. |
| `<AdminDisplayOptions>` | `admin-display-options.tsx` | List/Board, grouping, ordering field + direction, toggles (e.g. show deleted), display properties (column chips), reset view. |
| `<AdminDataTable>` | `admin-data-table.tsx` | Semantic `<table>`, sortable headers with `aria-sort`, hidden columns, collapsible groups, board view, pagination or load-more, and the four states: loading, error (with retry), empty, and **nothing matches these filters** (with Clear filters). |

Pure logic lives in `src/lib/admin/list-state.ts` (URL round trip, date presets, client-side
filter/sort/group/paginate for small lists) and `src/lib/admin/search-text.ts` (diacritic-insensitive
matching: `hoá đơn` = `hóa đơn` = `hoa don`). Both are tested in node:
`src/lib/admin/__tests__/list-state.test.ts` (`npm run test:admin-list-state`).

### URL shape

`q` search · one param per filter (`status=active,suspended`, `created=2026-01-01..2026-01-31`,
`members=5..`, `autoRenew=true`, `workspace=<id>`) · `sort` + `dir` · `group` · `view=board` ·
`hide=col,col` · toggles (`deleted=1`) · `page`. Defaults are never written, so an untouched list has a
bare URL. Unknown enum values in a link are dropped on read instead of being sent to the server.

### Adopting it on a page

1. Declare a module-level `ListStateConfig` (filter keys/kinds, sort fields, default sort, columns,
   groupings, views, toggles). `filterDefsFromFields(fields)` derives the filter defs from the toolbar
   fields when the labels can be built at module level.
2. `const list = useAdminListState(CONFIG)`; map `list.state` onto the API query (server-side lists) or
   run `applyClientListState` over the rows (small lists only — never a directory that grows).
3. Render `<AdminListToolbar>` above `<AdminPanel><AdminDataTable/></AdminPanel>`.
4. Pages using `useSearchParams` must sit inside `<Suspense>`.

Announcements and Email templates (the CMS, `feat/admin-cms`) and the Audit log (web #576) are
deliberately not adopted here; the toolkit is exported from `@/components/admin/list` for them.

## The admin command palette — `src/components/admin/admin-command-palette.tsx`

- `(app)/layout.tsx` renders `AdminHeaderSearch` + `AdminCommandPalette` on `/admin/*` and the
  workspace `HeaderSearch` + `SearchMeetingDialog` everywhere else — never both, because each owns ⌘K.
  The workspace room-code search is unchanged.
- Pages: every admin page by name and synonyms in en/vi/ja (`src/lib/admin/command-palette.ts`,
  `ADMIN_PALETTE_PAGES`). Keywords are the union of all three languages on purpose.
- Records (≥ 2 characters, debounced 220 ms): workspaces (name/slug), accounts (name/email), plans and
  plugins (cached catalogue, filtered locally), invoices (number or id), ledger entries (by id only),
  sales leads, feedback comments, glossary terms. Each source post-filters its page, so a backend that
  ignores `search` cannot list unrelated rows.
- "Search <list> for …" rows hand the query to a list page as `?q=`.
- Quick actions: Adjust credit…, Create plan, Compose announcement, Add plugin, Add glossary term,
  Import glossary, Export ledger, and three saved views (suspended workspaces, locked accounts, new
  leads). They navigate with `?action=` intents the pages consume via `useAdminActionIntent`.
  "Compose announcement" targets `/admin/announcements/posts/new`, a route owned by the CMS PR.
- Recent items: `localStorage` (`warptalk.admin.palette.recent.v1`), per viewer, wrapped in
  try/catch; malformed or non-`/admin` entries are discarded.

Contract: `scripts/check-admin-command-palette-contract.mjs` (in `npm run test:admin-command-palette`)
pins the one-palette-per-shell rule, no room codes in the admin palette, every admin nav page present in
the palette, every label key translated in en/vi/ja, and the toolkit exports.

## Preview

`/dev/admin-lists-preview` renders the toolkit and palette against fixtures (both themes, loading /
error / empty scenarios). `/dev` is 404 in production.

## Testing checklist

- `npm run test:admin-list-state` and `npm run test:admin-command-palette`.
- On `/admin/*`: the header box reads "Search admin pages, workspaces, accounts…"; ⌘K opens the admin
  palette; `hoá đơn`, `hoa don` and `invoice` all put Billing ledger first.
- On a workspace page: the header still reads "Search, or paste a room code" and ⌘K opens the rooms
  palette.
- On a list: add two filters, reload — the chips and rows come back; copy the URL to another tab.
