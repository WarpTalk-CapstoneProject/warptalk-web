"use client";

import {
  ArrowsClockwise,
  Buildings,
  CaretDown,
  CaretLeft,
  CaretRight,
  CaretUp,
  Funnel,
  SlidersHorizontal,
  Users,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";

import { WorkspaceStatusBadge } from "@/components/admin/WorkspaceStatusBadge";
import { ExpandingSearchDock } from "@/components/ui/expanding-search-dock";
import { ListDisplayPopover } from "@/components/ui/list-display-popover";
import { cn } from "@/lib/utils";
import type {
  AdminWorkspaceSort,
  AdminWorkspaceStatusFilter,
  AdminWorkspaceSummaryDto,
} from "@/types/admin-workspace";
import { useAdminWorkspaceDirectory } from "@/hooks/use-admin-workspaces";

const PAGE_SIZE = 20;

const STATUS_TABS: Array<{ value: AdminWorkspaceStatusFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
  { value: "deleted", label: "Deleted" },
];

const WORKSPACE_FILTER_WIDTH_CLASS: Record<AdminWorkspaceStatusFilter, string> = {
  all: "w-[58px]",
  active: "w-[78px]",
  suspended: "w-[106px]",
  deleted: "w-[88px]",
};

type SortDirection = "asc" | "desc";
type WorkspaceSortKey = "name" | "members" | "created" | "updated";
type WorkspaceDisplayProperty = "status" | "owner" | "members" | "created" | "updated";

const WORKSPACE_SORT_COLUMNS: Array<{
  key: WorkspaceSortKey;
  label: string;
  align?: "right";
}> = [
  { key: "name", label: "Name" },
  { key: "members", label: "Members", align: "right" },
  { key: "created", label: "Created", align: "right" },
  { key: "updated", label: "Last activity", align: "right" },
];

const WORKSPACE_DISPLAY_PROPERTIES: Array<{
  key: WorkspaceDisplayProperty;
  label: string;
}> = [
  { key: "status", label: "Status" },
  { key: "owner", label: "Owner" },
  { key: "members", label: "Members" },
  { key: "created", label: "Created" },
  { key: "updated", label: "Last activity" },
];

const DEFAULT_WORKSPACE_DISPLAY_PROPERTIES =
  WORKSPACE_DISPLAY_PROPERTIES.map((property) => property.key);

const numberFormatter = new Intl.NumberFormat("en-US");

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function isStatusFilter(value: string | null): value is AdminWorkspaceStatusFilter {
  return STATUS_TABS.some((tab) => tab.value === value);
}

function isSort(value: string | null): value is AdminWorkspaceSort {
  return [
    "created_desc",
    "created_asc",
    "name_asc",
    "name_desc",
    "members_desc",
    "members_asc",
    "updated_desc",
  ].includes(value ?? "");
}

function getSortParts(sort: AdminWorkspaceSort): {
  key: WorkspaceSortKey;
  direction: SortDirection;
} {
  if (sort === "name_asc") return { key: "name", direction: "asc" };
  if (sort === "name_desc") return { key: "name", direction: "desc" };
  if (sort === "members_asc") return { key: "members", direction: "asc" };
  if (sort === "members_desc") return { key: "members", direction: "desc" };
  if (sort === "created_asc") return { key: "created", direction: "asc" };
  if (sort === "updated_desc") return { key: "updated", direction: "desc" };
  return { key: "created", direction: "desc" };
}

function getSortValue(key: WorkspaceSortKey, direction: SortDirection): AdminWorkspaceSort {
  if (key === "name") return direction === "asc" ? "name_asc" : "name_desc";
  if (key === "members") return direction === "asc" ? "members_asc" : "members_desc";
  if (key === "updated") return "updated_desc";
  return direction === "asc" ? "created_asc" : "created_desc";
}

function getWorkspaceGridTemplate(visibleProperties: WorkspaceDisplayProperty[]) {
  return [
    "16px",
    "minmax(280px,1.7fr)",
    visibleProperties.includes("status") ? "110px" : null,
    visibleProperties.includes("owner") ? "230px" : null,
    visibleProperties.includes("members") ? "90px" : null,
    visibleProperties.includes("created") ? "120px" : null,
    visibleProperties.includes("updated") ? "130px" : null,
  ]
    .filter(Boolean)
    .join(" ");
}

function OwnerCell({ workspace }: { workspace: AdminWorkspaceSummaryDto }) {
  if (!workspace.owner.resolved) {
    return (
      <span className="text-[11px] italic text-ink-subtle" title={`Owner id ${workspace.owner.id}`}>
        Owner unavailable
      </span>
    );
  }

  return (
    <div className="min-w-0">
      <p className="truncate text-[11px] font-medium text-ink">
        {workspace.owner.fullName || "Unnamed owner"}
      </p>
      <p className="truncate text-[10px] text-ink-muted">{workspace.owner.email}</p>
    </div>
  );
}

function WorkspacesDirectory() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // The URL is the source of truth: a shared or refreshed link restores the same tab,
  // search, sort, and page.
  const statusParam = searchParams.get("status");
  const sortParam = searchParams.get("sort");
  const status: AdminWorkspaceStatusFilter = isStatusFilter(statusParam) ? statusParam : "all";
  const sort: AdminWorkspaceSort = isSort(sortParam) ? sortParam : "created_desc";
  const search = searchParams.get("q") ?? "";
  const parsedPage = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const { key: sortKey, direction: sortDirection } = getSortParts(sort);

  // The input is a draft until submitted, but a back/forward navigation changes ?q= behind
  // it. Adjust during render so the field and URL never disagree.
  const [searchDraft, setSearchDraft] = useState(search);
  const [appliedSearch, setAppliedSearch] = useState(search);
  const [visibleDisplayProperties, setVisibleDisplayProperties] = useState<
    WorkspaceDisplayProperty[]
  >(DEFAULT_WORKSPACE_DISPLAY_PROPERTIES);
  if (search !== appliedSearch) {
    setAppliedSearch(search);
    setSearchDraft(search);
  }

  const updateParams = (next: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined || value === "") params.delete(key);
      else params.set(key, value);
    }
    const queryString = params.toString();
    router.replace(queryString ? `/admin/workspaces?${queryString}` : "/admin/workspaces");
  };

  const query = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      status,
      sort,
      search: search || undefined,
    }),
    [page, status, sort, search],
  );

  const directoryQuery = useAdminWorkspaceDirectory(query);
  const items = directoryQuery.data?.items ?? [];
  const total = directoryQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const workspaceGridTemplate = useMemo(
    () => getWorkspaceGridTemplate(visibleDisplayProperties),
    [visibleDisplayProperties],
  );

  function toggleDisplayProperty(property: string) {
    setVisibleDisplayProperties((current) => {
      const typedProperty = property as WorkspaceDisplayProperty;
      if (current.includes(typedProperty)) {
        return current.filter((item) => item !== typedProperty);
      }

      return [...current, typedProperty];
    });
  }

  function handleSort(nextSortKey: WorkspaceSortKey) {
    const nextDirection =
      sortKey === nextSortKey && sortDirection === "asc" ? "desc" : "asc";
    updateParams({
      sort: getSortValue(nextSortKey, nextDirection),
      page: undefined,
    });
  }

  return (
    <div className="flex h-full flex-col bg-surface-1 text-ink">
      <div className="flex shrink-0 flex-col gap-2 px-2 pb-1.5 pt-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex min-w-[260px] flex-1 items-center gap-2 overflow-x-auto hide-scrollbar">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() =>
                updateParams({
                  status: tab.value === "all" ? undefined : tab.value,
                  page: undefined,
                })
              }
              className={`flex h-[26px] ${WORKSPACE_FILTER_WIDTH_CLASS[tab.value]} items-center justify-center rounded-full border px-3 text-[12px] font-medium transition-colors select-none ${
                status === tab.value
                  ? "border-[#d5d6dc] bg-[#ececf0] text-[#08090a] shadow-none dark:border-[#34363a] dark:bg-[#2b2b2e] dark:text-white"
                  : "border-[#e2e3e7] bg-transparent text-[#6b7280] hover:border-[#d6d7dc] hover:bg-[#f1f1f4] hover:text-[#0f1115] dark:border-[#25272b] dark:text-[#9fa0a5] dark:hover:border-[#303236] dark:hover:bg-[#232524] dark:hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              updateParams({ q: searchDraft.trim() || undefined, page: undefined });
            }}
          >
            <ExpandingSearchDock
              value={searchDraft}
              onValueChange={setSearchDraft}
              placeholder="Search workspaces..."
              ariaLabel="Search workspaces"
              collapsedWidth={28}
              expandedWidth={220}
              className="h-[28px] border-border/60 bg-surface-2 text-ink shadow-sm backdrop-blur-md focus-within:bg-surface-1"
              iconButtonClassName="ml-0 size-[26px] hover:bg-surface-3"
              clearButtonClassName="mr-0.5 size-5 hover:bg-surface-3"
              inputClassName="h-[26px] text-[12px]"
            />
          </form>
          <button
            type="button"
            className="relative flex h-[28px] w-[28px] items-center justify-center rounded-full border border-border/60 text-muted-foreground shadow-sm transition-colors hover:bg-surface-2 hover:text-foreground"
            title="Workspace filters"
          >
            <Funnel weight="bold" size={13} />
            {(status !== "all" || Boolean(search)) && (
              <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-primary" />
            )}
          </button>
          <ListDisplayPopover
            trigger={<SlidersHorizontal weight="bold" size={13} />}
            triggerClassName="flex h-[28px] w-[28px] items-center justify-center rounded-full border border-border/60 text-muted-foreground shadow-sm transition-colors hover:bg-surface-2 hover:text-foreground"
            triggerTitle={`${numberFormatter.format(total)} workspace${total === 1 ? "" : "s"}`}
            ordering={sortKey}
            orderingOptions={WORKSPACE_SORT_COLUMNS.map((column) => ({
              value: column.key,
              label: column.label,
              disabled:
                column.key !== "name" &&
                !visibleDisplayProperties.includes(column.key as WorkspaceDisplayProperty),
            }))}
            onOrderingChange={(value) => {
              updateParams({
                sort: getSortValue(value as WorkspaceSortKey, sortDirection),
                page: undefined,
              });
            }}
            direction={sortDirection}
            onDirectionChange={(direction) => {
              updateParams({ sort: getSortValue(sortKey, direction), page: undefined });
            }}
            properties={WORKSPACE_DISPLAY_PROPERTIES}
            visibleProperties={visibleDisplayProperties}
            onToggleProperty={toggleDisplayProperty}
            onReset={() => {
              setVisibleDisplayProperties(DEFAULT_WORKSPACE_DISPLAY_PROPERTIES);
              updateParams({ sort: undefined, page: undefined });
            }}
          />
          <div className="mx-1 h-4 w-[1px] bg-border" />
          <button
            type="button"
            onClick={() => void directoryQuery.refetch()}
            disabled={directoryQuery.isFetching}
            className="inline-flex h-[28px] items-center gap-1.5 rounded-full border border-border/60 bg-surface-1 px-3 text-[12px] font-medium text-ink shadow-sm transition hover:bg-surface-2 disabled:opacity-50"
          >
            <ArrowsClockwise
              size={13}
              weight="bold"
              className={cn(directoryQuery.isFetching && "animate-spin")}
            />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <div className="overflow-x-auto px-2 pb-6">
        {directoryQuery.isError ? (
          <div className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-3 text-sm text-destructive">
            <WarningCircle size={18} weight="duotone" className="mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">The workspace directory could not be loaded.</p>
              <p className="mt-1 text-xs text-ink-muted">
                Check the workspace service and that your session still holds the platform
                admin role.
              </p>
              <button
                type="button"
                className="mt-3 h-7 rounded-md border border-hairline bg-surface-1 px-2.5 text-xs font-semibold text-ink hover:bg-surface-2"
                onClick={() => void directoryQuery.refetch()}
              >
                Try again
              </button>
            </div>
          </div>
        ) : directoryQuery.isPending ? (
          <div className="min-w-[1000px] space-y-1">
            {Array.from({ length: 8 }).map((_, index) => (
              <div
                key={index}
                className="grid min-h-[36px] items-center gap-3 rounded-[7px] px-2 py-1"
                style={{ gridTemplateColumns: workspaceGridTemplate }}
              >
                <div />
                <div className="h-3 w-48 animate-pulse rounded bg-surface-2" />
                {visibleDisplayProperties.map((property) => (
                  <div key={property} className="h-3 w-20 animate-pulse rounded bg-surface-2" />
                ))}
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center gap-2 text-center">
            <Buildings className="h-8 w-8 text-ink-muted" />
            <p className="text-sm font-medium text-ink">No workspaces match these filters</p>
            <p className="text-xs text-ink-muted">Clear the search or pick a different status.</p>
          </div>
        ) : (
          <div className="min-w-[1000px]">
            <div
              className="grid items-center gap-3 px-2 py-0.5 text-[11px] font-medium text-ink-muted"
              style={{ gridTemplateColumns: workspaceGridTemplate }}
            >
              <div />
              <SortableColumnHeader
                label="Name"
                active={sortKey === "name"}
                direction={sortDirection}
                onClick={() => handleSort("name")}
              />
              {visibleDisplayProperties.includes("status") && <span>Status</span>}
              {visibleDisplayProperties.includes("owner") && <span>Owner</span>}
              {visibleDisplayProperties.includes("members") && (
                <SortableColumnHeader
                  label="Members"
                  active={sortKey === "members"}
                  direction={sortDirection}
                  align="right"
                  onClick={() => handleSort("members")}
                />
              )}
              {visibleDisplayProperties.includes("created") && (
                <SortableColumnHeader
                  label="Created"
                  active={sortKey === "created"}
                  direction={sortDirection}
                  align="right"
                  onClick={() => handleSort("created")}
                />
              )}
              {visibleDisplayProperties.includes("updated") && (
                <SortableColumnHeader
                  label="Last activity"
                  active={sortKey === "updated"}
                  direction={sortDirection}
                  align="right"
                  onClick={() => handleSort("updated")}
                />
              )}
            </div>

            {items.map((workspace) => (
              <Link
                key={workspace.id}
                href={`/admin/workspaces/${workspace.id}`}
                className="group grid min-h-[36px] items-center gap-3 rounded-[7px] px-2 py-1 text-[11px] transition-none hover:bg-surface-2 hover:shadow-[inset_3px_0_0_hsl(var(--primary)/0.45)] focus-visible:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                style={{ gridTemplateColumns: workspaceGridTemplate }}
              >
                <div aria-hidden="true" />
                <div className="flex min-w-0 items-center gap-2">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-hairline bg-surface-2 text-[8px] font-semibold uppercase text-ink-muted">
                    {workspace.name.slice(0, 2)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{workspace.name}</p>
                    <p className="truncate font-mono text-[10px] text-ink-muted">{workspace.slug}</p>
                  </div>
                </div>
                {visibleDisplayProperties.includes("status") && (
                  <div>
                    <WorkspaceStatusBadge status={workspace.status} />
                  </div>
                )}
                {visibleDisplayProperties.includes("owner") && <OwnerCell workspace={workspace} />}
                {visibleDisplayProperties.includes("members") && (
                  <div className="flex items-center justify-end gap-1 text-xs font-medium tabular-nums text-ink-muted">
                    <Users size={13} weight="duotone" />
                    {numberFormatter.format(workspace.memberCount)}
                  </div>
                )}
                {visibleDisplayProperties.includes("created") && (
                  <span className="text-right text-xs font-medium text-ink-muted">
                    {formatDate(workspace.createdAt)}
                  </span>
                )}
                {visibleDisplayProperties.includes("updated") && (
                  <span className="text-right text-xs font-medium text-ink-muted">
                    {formatDate(workspace.lastActivityAt)}
                  </span>
                )}
              </Link>
            ))}
          </div>
        )}

        {totalPages > 1 ? (
          <div className="mt-2 flex items-center justify-end gap-2 border-t border-hairline/60 px-2 py-3">
            <button
              onClick={() => updateParams({ page: String(page - 1) })}
              disabled={page <= 1}
              className="inline-flex h-7 items-center gap-1 rounded border border-hairline px-2.5 text-xs font-medium hover:bg-surface-2 disabled:opacity-45"
            >
              <CaretLeft size={12} />
              Previous
            </button>
            <span className="text-xs font-medium text-ink-muted">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => updateParams({ page: String(page + 1) })}
              disabled={page >= totalPages}
              className="inline-flex h-7 items-center gap-1 rounded border border-hairline px-2.5 text-xs font-medium hover:bg-surface-2 disabled:opacity-45"
            >
              Next
              <CaretRight size={12} />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SortableColumnHeader({
  label,
  active,
  direction,
  align,
  onClick,
}: {
  label: string;
  active: boolean;
  direction: SortDirection;
  align?: "right";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-fit rounded-full py-1 text-left transition-colors ${
        align === "right" ? "justify-self-end pr-2 text-right" : ""
      } ${
        active
          ? align === "right"
            ? "bg-surface-2 px-2 font-semibold text-foreground"
            : "-ml-2 bg-surface-2 px-2 font-semibold text-foreground"
          : "px-0 text-ink-muted hover:text-ink"
      }`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (
          direction === "asc" ? (
            <CaretUp size={10} weight="bold" />
          ) : (
            <CaretDown size={10} weight="bold" />
          )
        ) : null}
      </span>
    </button>
  );
}

export default function AdminWorkspacesPage() {
  // The fallback paints the same ground as the page it stands in for. On the chrome's grey it
  // flashed that grey across the whole content area on every load — the greyed-out look this
  // release removes. Wrong for a frame is still wrong.
  return (
    <Suspense fallback={<div className="min-h-full bg-surface-1" />}>
      <WorkspacesDirectory />
    </Suspense>
  );
}
