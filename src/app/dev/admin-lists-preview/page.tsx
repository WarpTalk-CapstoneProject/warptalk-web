"use client";

/**
 * The admin list toolkit and the admin command palette, rendered against fixtures.
 *
 * Every admin list reads a platform-admin API a laptop cannot reach, so this is where the toolbar,
 * the filter chips, the Display panel, the table/board and the four list states can be looked at
 * in both themes. The rows are filtered client-side with `applyClientListState`, the same path the
 * small admin lists (plans, plugins) use; the URL carries the view exactly as it does on /admin.
 *
 * Fixtures only; /dev is 404 in production (`src/app/dev/layout.tsx` and the proxy).
 */

import { Suspense, useMemo, useState } from "react";

import { AdminCommandPalette, AdminHeaderSearch } from "@/components/admin/admin-command-palette";
import { AdminPage, AdminPageHeader, AdminPanel } from "@/components/admin/admin-page-chrome";
import {
  AdminDataTable,
  AdminListToolbar,
  filterDefsFromFields,
  useAdminListState,
  type AdminColumn,
  type AdminFilterField,
} from "@/components/admin/list";
import { applyClientListState, paginateRows, type ListStateConfig } from "@/lib/admin/list-state";
import { matchesSearch } from "@/lib/admin/search-text";

type Row = {
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended" | "deleted";
  plan: "free" | "pro" | "team" | "enterprise";
  owner: string;
  members: number;
  createdAt: string;
};

const PLANS = ["free", "pro", "team", "enterprise"] as const;
const STATUSES = ["active", "suspended", "deleted"] as const;
// i18n-allow: a Vietnamese company name, to show diacritic-insensitive search.
const NAMES = ["Acme", "Công ty Hoà Bình", "Globex", "Initech", "Umbrella", "Hooli", "Stark", "Wayne", "Tyrell", "Soylent", "Wonka", "Cyberdyne"];

function rng(seed: number) {
  let value = seed;
  return () => (value = (value * 16807) % 2147483647) / 2147483647;
}

const ROWS: Row[] = (() => {
  const next = rng(7);
  return Array.from({ length: 57 }, (_, index) => {
    const name = `${NAMES[index % NAMES.length]} ${index + 1}`;
    return {
      id: `ws-${index}`,
      name,
      slug: name.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-"),
      status: STATUSES[next() < 0.8 ? 0 : next() < 0.6 ? 1 : 2],
      plan: PLANS[Math.floor(next() * PLANS.length)],
      owner: `owner${index}@example.com`,
      members: Math.floor(next() * 120),
      createdAt: new Date(2026, Math.floor(next() * 9), 1 + Math.floor(next() * 27)).toISOString(),
    };
  });
})();

const FIELDS: AdminFilterField[] = [
  {
    key: "status",
    label: "Status",
    kind: "enum",
    multiple: true,
    options: STATUSES.map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) })),
  },
  { key: "plan", label: "Plan", kind: "enum", multiple: true, options: PLANS.map((value) => ({ value, label: value })) },
  { key: "created", label: "Created", kind: "dateRange" },
  {
    key: "members",
    label: "Members",
    kind: "numberRange",
    unit: "members",
    presets: [
      { label: "Solo (≤ 1)", max: 1 },
      { label: "2–10", min: 2, max: 10 },
      { label: "50+", min: 50 },
    ],
  },
  {
    key: "owner",
    label: "Owner",
    kind: "entity",
    placeholder: "Search owners…",
    search: async (query) =>
      ROWS.filter((row) => matchesSearch(query, [row.owner]))
        .slice(0, 8)
        .map((row) => ({ value: row.owner, label: row.owner, hint: row.name })),
  },
];

const CONFIG: ListStateConfig = {
  filters: filterDefsFromFields(FIELDS),
  sortFields: ["name", "members", "created"],
  defaultSort: { field: "created", direction: "desc" },
  columns: [{ id: "name" }, { id: "status" }, { id: "plan" }, { id: "owner" }, { id: "members" }, { id: "created" }],
  groupings: ["status", "plan"],
  views: ["list", "board"],
  toggles: [{ key: "deleted", default: false }],
};

const PAGE_SIZE = 20;

function Preview() {
  const list = useAdminListState(CONFIG);
  const [scenario, setScenario] = useState<"data" | "loading" | "error" | "empty">("data");
  const showDeleted = list.state.toggles.deleted;

  const filtered = useMemo(
    () =>
      applyClientListState(
        ROWS.filter((row) => showDeleted || row.status !== "deleted"),
        list.state,
        {
          search: (row) => [row.name, row.slug],
          filters: {
            status: (row) => row.status,
            plan: (row) => row.plan,
            created: (row) => row.createdAt,
            members: (row) => row.members,
            owner: (row) => row.owner,
          },
          sort: { name: (row) => row.name, members: (row) => row.members, created: (row) => row.createdAt },
        },
        matchesSearch,
      ),
    [list.state, showDeleted],
  );
  const page = paginateRows(scenario === "empty" ? [] : filtered, list.state.page, PAGE_SIZE);

  const columns: AdminColumn<Row>[] = [
    {
      id: "name",
      header: "Workspace",
      primary: true,
      sortField: "name",
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.name}</p>
          <p className="truncate font-mono text-[11px] text-ink-subtle">{row.slug}</p>
        </div>
      ),
    },
    { id: "status", header: "Status", className: "w-[110px]", cell: (row) => row.status },
    { id: "plan", header: "Plan", className: "w-[110px]", cell: (row) => row.plan },
    { id: "owner", header: "Owner", className: "w-[220px]", cell: (row) => <span className="text-ink-muted">{row.owner}</span> },
    { id: "members", header: "Members", align: "right", className: "w-[100px]", sortField: "members", defaultDirection: "desc", cell: (row) => row.members },
    {
      id: "created",
      header: "Created",
      align: "right",
      className: "w-[130px]",
      sortField: "created",
      defaultDirection: "desc",
      cell: (row) => new Date(row.createdAt).toLocaleDateString(),
    },
  ];

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Developer preview"
        title="Admin list toolkit"
        description="Fixtures only. The URL carries the whole view — reload or copy it."
        actions={
          <>
            <div className="w-72">
              <AdminHeaderSearch />
            </div>
            <select
              aria-label="Scenario"
              value={scenario}
              onChange={(event) => setScenario(event.target.value as typeof scenario)}
              className="h-8 rounded-lg border border-hairline bg-surface-1 px-2 text-[13px]"
            >
              <option value="data">Data</option>
              <option value="loading">Loading</option>
              <option value="error">Error</option>
              <option value="empty">Empty</option>
            </select>
          </>
        }
      />
      <AdminListToolbar
        list={list}
        searchPlaceholder="Search workspaces by name or slug"
        filters={FIELDS}
        count={page.total}
        countLabel={`${page.total} workspaces`}
        display={{
          board: true,
          sortOptions: [
            { field: "created", label: "Created" },
            { field: "name", label: "Name" },
            { field: "members", label: "Members" },
          ],
          groupOptions: [
            { key: "status", label: "Status" },
            { key: "plan", label: "Plan" },
          ],
          toggles: [{ key: "deleted", label: "Show deleted workspaces" }],
          columns: columns.filter((c) => !c.primary).map((c) => ({ id: c.id, label: c.header })),
        }}
      />
      <AdminPanel>
        <AdminDataTable
          list={list}
          columns={columns}
          rows={page.rows}
          rowKey={(row) => row.id}
          rowHref={() => "#"}
          isPending={scenario === "loading"}
          isError={scenario === "error"}
          onRetry={() => setScenario("data")}
          empty={{ title: "No workspaces yet", description: "Workspaces appear here when someone creates one." }}
          groupings={{
            status: { keyOf: (row) => row.status, label: (key) => key, order: STATUSES },
            plan: { keyOf: (row) => row.plan, label: (key) => key, order: PLANS },
          }}
          boardGrouping="status"
          pagination={{ page: page.page, pageCount: page.pageCount, total: page.total, pageSize: PAGE_SIZE }}
          caption="Workspaces"
        />
      </AdminPanel>
      <AdminCommandPalette />
    </AdminPage>
  );
}

export default function AdminListsPreviewPage() {
  return (
    <Suspense fallback={<div className="min-h-full bg-panel" />}>
      <Preview />
    </Suspense>
  );
}
