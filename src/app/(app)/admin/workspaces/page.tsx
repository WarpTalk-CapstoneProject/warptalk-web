"use client";

import {
  ArrowsClockwise,
  Buildings,
  CaretLeft,
  CaretRight,
  MagnifyingGlass,
  Users,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";

import { WorkspaceStatusBadge } from "@/components/admin/WorkspaceStatusBadge";
import { Button } from "@/components/ui/button";
import { useAdminWorkspaceDirectory } from "@/hooks/use-admin-workspaces";
import { cn } from "@/lib/utils";
import {
  AdminFilterTabs,
  AdminPage,
  AdminPageHeader,
  AdminPanel,
} from "@/components/admin/admin-page-chrome";
import type {
  AdminWorkspaceSort,
  AdminWorkspaceStatusFilter,
  AdminWorkspaceSummaryDto,
} from "@/types/admin-workspace";

const PAGE_SIZE = 20;

const STATUS_TABS: Array<{ value: AdminWorkspaceStatusFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
  { value: "deleted", label: "Deleted" },
];

const SORT_OPTIONS: Array<{ value: AdminWorkspaceSort; label: string }> = [
  { value: "created_desc", label: "Newest" },
  { value: "created_asc", label: "Oldest" },
  { value: "name_asc", label: "Name A–Z" },
  { value: "name_desc", label: "Name Z–A" },
  { value: "members_desc", label: "Most members" },
  { value: "members_asc", label: "Fewest members" },
  { value: "updated_desc", label: "Recently updated" },
];

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
  return SORT_OPTIONS.some((option) => option.value === value);
}

function OwnerCell({ workspace }: { workspace: AdminWorkspaceSummaryDto }) {
  if (!workspace.owner.resolved) {
    return (
      <span className="text-xs italic text-ink-subtle" title={`Owner id ${workspace.owner.id}`}>
        Owner unavailable
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

  // The input is a draft until submitted, but a back/forward navigation changes ?q= behind
  // it — adjust during render rather than in an effect so the two never disagree.
  const [searchDraft, setSearchDraft] = useState(search);
  const [appliedSearch, setAppliedSearch] = useState(search);
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

  return (
    <AdminPage>
        <AdminPageHeader
          eyebrow="Platform directory"
          eyebrowIcon={<Buildings size={14} weight="fill" />}
          title="Workspaces"
          description="Every workspace on the platform, independent of your own memberships."
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={() => void directoryQuery.refetch()}
              disabled={directoryQuery.isFetching}
            >
              <ArrowsClockwise
                size={14}
                className={cn(directoryQuery.isFetching && "animate-spin")}
              />
              Refresh
            </Button>
          }
        />

        <AdminFilterTabs
          tabs={STATUS_TABS}
          value={status}
          onChange={(value) =>
            updateParams({
              status: value === "all" ? undefined : value,
              page: undefined,
            })
          }
          label="Workspace status"
          trailing={
            directoryQuery.isPending
              ? "Loading…"
              : `${numberFormatter.format(total)} workspace${total === 1 ? "" : "s"}`
          }
        />

        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-end">
          <div className="flex flex-1 items-center gap-2 lg:max-w-md">
            <form
              className="relative flex-1"
              onSubmit={(event) => {
                event.preventDefault();
                updateParams({ q: searchDraft.trim() || undefined, page: undefined });
              }}
            >
              <MagnifyingGlass
                size={15}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-subtle"
              />
              <input
                type="search"
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                placeholder="Search name or slug"
                aria-label="Search workspaces"
                className="h-8 w-full rounded-lg border border-hairline bg-surface-1 pl-8 pr-2.5 text-[13px] text-ink placeholder:text-ink-subtle focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </form>
            <label className="sr-only" htmlFor="workspace-sort">
              Sort workspaces
            </label>
            <select
              id="workspace-sort"
              value={sort}
              onChange={(event) => updateParams({ sort: event.target.value, page: undefined })}
              className="h-8 rounded-lg border border-hairline bg-surface-1 px-2 text-[13px] text-ink focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <AdminPanel className="mt-4">
          <div className="hidden items-center border-b border-border px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-subtle md:flex">
            <span className="flex-1">Workspace</span>
            <span className="w-[110px] shrink-0">Status</span>
            <span className="w-[220px] shrink-0">Owner</span>
            <span className="w-[90px] shrink-0 text-right">Members</span>
            <span className="w-[120px] shrink-0 text-right">Created</span>
            <span className="w-[130px] shrink-0 text-right">Last activity</span>
          </div>

          {directoryQuery.isError ? (
            <div className="flex items-start gap-2 px-4 py-8 text-sm text-destructive">
              <WarningCircle size={18} weight="duotone" className="mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">The workspace directory could not be loaded.</p>
                <p className="mt-1 text-ink-muted">
                  Check the workspace service and that your session still holds the platform
                  admin role.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => void directoryQuery.refetch()}
                >
                  Try again
                </Button>
              </div>
            </div>
          ) : directoryQuery.isPending ? (
            <ul>
              {Array.from({ length: 6 }).map((_, index) => (
                <li
                  key={index}
                  className="flex items-center gap-4 border-b border-hairline/60 px-4 py-3 last:border-b-0"
                >
                  <div className="h-8 w-8 animate-pulse rounded-lg bg-surface-2" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-40 animate-pulse rounded bg-surface-2" />
                    <div className="h-2.5 w-24 animate-pulse rounded bg-surface-2" />
                  </div>
                </li>
              ))}
            </ul>
          ) : items.length === 0 ? (
            <div className="grid place-items-center px-4 py-14 text-center">
              <div>
                <span className="mx-auto grid size-10 place-items-center rounded-xl bg-surface-2 text-ink-subtle">
                  <Buildings size={20} weight="duotone" />
                </span>
                <p className="mt-3 text-sm font-medium">No workspaces match these filters</p>
                <p className="mt-1 text-xs text-ink-muted">
                  Clear the search or pick a different status tab.
                </p>
              </div>
            </div>
          ) : (
            <ul>
              {items.map((workspace) => (
                <li key={workspace.id}>
                  <Link
                    href={`/admin/workspaces/${workspace.id}`}
                    className="flex flex-col gap-2 border-b border-hairline/60 px-4 py-3 transition-colors last:border-b-0 hover:bg-surface-2/60 focus-visible:bg-surface-2/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40 md:flex-row md:items-center md:gap-0"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-hairline bg-surface-2 text-[11px] font-semibold uppercase text-ink-muted">
                        {workspace.name.slice(0, 2)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium text-ink">
                          {workspace.name}
                        </p>
                        <p className="truncate font-mono text-[11px] text-ink-subtle">
                          {workspace.slug}
                        </p>
                      </div>
                    </div>

                    <div className="w-[110px] shrink-0">
                      <WorkspaceStatusBadge status={workspace.status} />
                    </div>

                    <div className="w-[220px] shrink-0">
                      <OwnerCell workspace={workspace} />
                    </div>

                    <div className="flex w-[90px] shrink-0 items-center justify-end gap-1 text-[13px] tabular-nums text-ink-muted">
                      <Users size={13} weight="duotone" className="md:hidden" />
                      {numberFormatter.format(workspace.memberCount)}
                    </div>

                    <div className="w-[120px] shrink-0 text-right text-xs text-ink-muted">
                      {formatDate(workspace.createdAt)}
                    </div>

                    <div className="w-[130px] shrink-0 text-right text-xs text-ink-muted">
                      {formatDate(workspace.lastActivityAt)}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {totalPages > 1 ? (
            <div className="flex items-center justify-between border-t border-hairline px-4 py-2.5">
              <p className="text-xs text-ink-muted">
                Page {page} of {totalPages}
              </p>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => updateParams({ page: String(page - 1) })}
                >
                  <CaretLeft size={13} />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => updateParams({ page: String(page + 1) })}
                >
                  Next
                  <CaretRight size={13} />
                </Button>
              </div>
            </div>
          ) : null}
        </AdminPanel>
    </AdminPage>
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
