"use client";

import { ArrowsClockwise, Buildings, CalendarBlank, Users } from "@phosphor-icons/react/dist/ssr";
import { useTranslations } from "next-intl";
import { Suspense, useMemo } from "react";

import { WorkspaceStatusBadge } from "@/components/admin/WorkspaceStatusBadge";
import { AdminPage, AdminPageHeader, AdminPanel } from "@/components/admin/admin-page-chrome";
import {
  AdminDataTable,
  AdminListToolbar,
  AdminStatusTabs,
  useAdminListState,
  type AdminColumn,
  type AdminFilterField,
} from "@/components/admin/list";
import { Button } from "@/components/ui/button";
import { useAdminWorkspaceDirectory } from "@/hooks/use-admin-workspaces";
import {
  dateRangeBounds,
  dateRangeValue,
  enumValue,
  numberRangeValue,
  type ListStateConfig,
} from "@/lib/admin/list-state";
import { cn } from "@/lib/utils";
import type {
  AdminWorkspaceDirectoryQuery,
  AdminWorkspaceSort,
  AdminWorkspaceStatusFilter,
  AdminWorkspaceSummaryDto,
} from "@/types/admin-workspace";

const PAGE_SIZE = 20;

const STATUS_TAB_VALUES: AdminWorkspaceStatusFilter[] = ["all", "active", "suspended", "deleted"];

/**
 * The directory's view, all of it in the URL. Status is a filter the tabs write (`status=`), so a
 * link to "suspended workspaces with 50+ members, fewest first" is one paste.
 *
 * Every filter here is server-side: the workspace service filters and pages in SQL
 * (WorkspaceRepository.GetAdminDirectoryAsync), and this page only ever holds one page of rows.
 */
const LIST_CONFIG: ListStateConfig = {
  filters: [
    { key: "status", kind: "enum", values: ["active", "suspended", "deleted"] },
    { key: "members", kind: "numberRange" },
    { key: "created", kind: "dateRange" },
  ],
  sortFields: ["created", "name", "members", "updated"],
  defaultSort: { field: "created", direction: "desc" },
  columns: [
    { id: "workspace" },
    { id: "status" },
    { id: "owner" },
    { id: "members" },
    { id: "created" },
    { id: "lastActivity" },
  ],
  groupings: ["status"],
};

/** The toolkit's field + direction, as the one sort string the directory API accepts. */
function apiSort(field: string, direction: "asc" | "desc"): AdminWorkspaceSort {
  if (field === "name") return direction === "asc" ? "name_asc" : "name_desc";
  if (field === "members") return direction === "asc" ? "members_asc" : "members_desc";
  if (field === "updated") return direction === "asc" ? "updated_asc" : "updated_desc";
  return direction === "asc" ? "created_asc" : "created_desc";
}

const numberFormatter = new Intl.NumberFormat("en-US");

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function OwnerCell({ workspace }: { workspace: AdminWorkspaceSummaryDto }) {
  const t = useTranslations("adminWorkspaces.list");
  if (!workspace.owner.resolved) {
    return (
      <span className="text-xs italic text-ink-subtle" title={t("ownerIdTitle", { id: workspace.owner.id })}>
        {t("ownerUnavailable")}
      </span>
    );
  }

  return (
    <div className="min-w-0">
      <p className="truncate text-[13px] text-ink">{workspace.owner.fullName}</p>
      <p className="truncate text-xs text-ink-muted">{workspace.owner.email}</p>
    </div>
  );
}

function WorkspacesDirectory() {
  const t = useTranslations("adminWorkspaces.list");
  const list = useAdminListState(LIST_CONFIG);
  const { state } = list;

  const status = (enumValue(state.filters, "status") ?? "all") as AdminWorkspaceStatusFilter;
  const members = numberRangeValue(state.filters, "members");
  const created = dateRangeBounds(dateRangeValue(state.filters, "created") ?? {});

  const query = useMemo<AdminWorkspaceDirectoryQuery>(
    () => ({
      page: state.page,
      pageSize: PAGE_SIZE,
      status,
      sort: apiSort(state.sort.field, state.sort.direction),
      search: state.search || undefined,
      minMembers: members?.min,
      maxMembers: members?.max,
      createdFrom: created.from,
      createdTo: created.toExclusive,
    }),
    [state.page, status, state.sort.field, state.sort.direction, state.search, members?.min, members?.max, created.from, created.toExclusive],
  );

  const directoryQuery = useAdminWorkspaceDirectory(query);
  const items = directoryQuery.data?.items ?? [];
  const total = directoryQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const statusTabs = useMemo(
    () => STATUS_TAB_VALUES.map((value) => ({ value, label: t(`statusTabs.${value}`) })),
    [t],
  );

  const filterFields = useMemo<AdminFilterField[]>(
    () => [
      {
        key: "members",
        label: t("filters.members"),
        icon: <Users size={13} />,
        kind: "numberRange",
        unit: t("filters.membersUnit"),
        step: 1,
        presets: [
          { label: t("filters.membersPresets.solo"), max: 1 },
          { label: t("filters.membersPresets.small"), min: 2, max: 10 },
          { label: t("filters.membersPresets.medium"), min: 11, max: 50 },
          { label: t("filters.membersPresets.large"), min: 51 },
        ],
      },
      { key: "created", label: t("filters.created"), icon: <CalendarBlank size={13} />, kind: "dateRange" },
    ],
    [t],
  );

  const columns = useMemo<AdminColumn<AdminWorkspaceSummaryDto>[]>(
    () => [
      {
        id: "workspace",
        header: t("columns.workspace"),
        primary: true,
        sortField: "name",
        cell: (workspace) => (
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-hairline bg-surface-2 text-[11px] font-semibold uppercase text-ink-muted">
              {workspace.name.slice(0, 2)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-ink">{workspace.name}</p>
              <p className="truncate font-mono text-[11px] text-ink-subtle">{workspace.slug}</p>
            </div>
          </div>
        ),
      },
      {
        id: "status",
        header: t("columns.status"),
        className: "w-[120px]",
        cell: (workspace) => <WorkspaceStatusBadge status={workspace.status} />,
      },
      {
        id: "owner",
        header: t("columns.owner"),
        className: "w-[230px]",
        cell: (workspace) => <OwnerCell workspace={workspace} />,
      },
      {
        id: "members",
        header: t("columns.members"),
        align: "right",
        className: "w-[100px]",
        sortField: "members",
        defaultDirection: "desc",
        cell: (workspace) => (
          <span className="text-ink-muted">{numberFormatter.format(workspace.memberCount)}</span>
        ),
      },
      {
        id: "created",
        header: t("columns.created"),
        align: "right",
        className: "w-[130px]",
        sortField: "created",
        defaultDirection: "desc",
        cell: (workspace) => <span className="text-xs text-ink-muted">{formatDate(workspace.createdAt)}</span>,
      },
      {
        id: "lastActivity",
        header: t("columns.lastActivity"),
        align: "right",
        className: "w-[140px]",
        // Not sortable: last activity is derived per page (member joins, uploads, edits); the
        // server can only order by updated_at, which Display → Ordering offers under its own name.
        cell: (workspace) => (
          <span className="text-xs text-ink-muted">{formatDate(workspace.lastActivityAt)}</span>
        ),
      },
    ],
    [t],
  );

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow={t("eyebrow")}
        eyebrowIcon={<Buildings size={14} weight="fill" />}
        title={t("title")}
        description={t("description")}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void directoryQuery.refetch()}
            disabled={directoryQuery.isFetching}
          >
            <ArrowsClockwise size={14} className={cn(directoryQuery.isFetching && "animate-spin")} />
            {t("refresh")}
          </Button>
        }
      />

      <AdminStatusTabs list={list} filterKey="status" tabs={statusTabs} label={t("filterLabel")} />

      <AdminListToolbar
        list={list}
        searchPlaceholder={t("searchPlaceholder")}
        filters={filterFields}
        count={directoryQuery.isPending ? null : total}
        countLabel={t("workspaceCount", { count: total })}
        isFetching={directoryQuery.isFetching && !directoryQuery.isPending}
        display={{
          sortOptions: [
            { field: "created", label: t("sortFields.created") },
            { field: "name", label: t("sortFields.name") },
            { field: "members", label: t("sortFields.members") },
            { field: "updated", label: t("sortFields.updated") },
          ],
          groupOptions: [{ key: "status", label: t("columns.status") }],
          columns: columns.filter((column) => !column.primary).map((column) => ({ id: column.id, label: column.header })),
        }}
      />

      <AdminPanel>
        <AdminDataTable
          list={list}
          columns={columns}
          rows={items}
          rowKey={(workspace) => workspace.id}
          // WT-560: the directory has the slug, so it links straight to the named URL — no id ever
          // reaches the address bar from here, not even for a redirect.
          rowHref={(workspace) => `/admin/workspaces/${workspace.slug}`}
          isPending={directoryQuery.isPending}
          isError={directoryQuery.isError}
          onRetry={() => void directoryQuery.refetch()}
          empty={{
            title: t("emptyTitle"),
            description: t("emptyDescription"),
            icon: <Buildings size={20} weight="duotone" />,
          }}
          groupings={{
            status: {
              keyOf: (workspace) => workspace.status,
              label: (key) => t(`statusTabs.${key}`),
              order: ["active", "suspended", "deleted"],
            },
          }}
          pagination={{ page: state.page, pageCount: totalPages, total, pageSize: PAGE_SIZE }}
          caption={t("title")}
        />
      </AdminPanel>
    </AdminPage>
  );
}

export default function AdminWorkspacesPage() {
  // The fallback paints the same ground as the page it stands in for. On the chrome's grey it
  // flashed that grey across the whole content area on every load — the greyed-out look this
  // release removes. Wrong for a frame is still wrong.
  return (
    <Suspense fallback={<div className="min-h-full bg-panel" />}>
      <WorkspacesDirectory />
    </Suspense>
  );
}
