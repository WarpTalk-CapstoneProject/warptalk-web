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
import { useTranslations } from "next-intl";
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

const STATUS_TAB_VALUES: AdminWorkspaceStatusFilter[] = ["all", "active", "suspended", "deleted"];

const SORT_OPTION_VALUES: Array<{ value: AdminWorkspaceSort; labelKey: string }> = [
  { value: "created_desc", labelKey: "createdDesc" },
  { value: "created_asc", labelKey: "createdAsc" },
  { value: "name_asc", labelKey: "nameAsc" },
  { value: "name_desc", labelKey: "nameDesc" },
  { value: "members_desc", labelKey: "membersDesc" },
  { value: "members_asc", labelKey: "membersAsc" },
  { value: "updated_desc", labelKey: "updatedDesc" },
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
  return STATUS_TAB_VALUES.some((tab) => tab === value);
}

function isSort(value: string | null): value is AdminWorkspaceSort {
  return SORT_OPTION_VALUES.some((option) => option.value === value);
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

  const statusTabs = useMemo(
    () => STATUS_TAB_VALUES.map((value) => ({ value, label: t(`statusTabs.${value}`) })),
    [t],
  );
  const sortOptions = useMemo(
    () => SORT_OPTION_VALUES.map((option) => ({ value: option.value, label: t(`sortOptions.${option.labelKey}`) })),
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
              <ArrowsClockwise
                size={14}
                className={cn(directoryQuery.isFetching && "animate-spin")}
              />
              {t("refresh")}
            </Button>
          }
        />

        <AdminFilterTabs
          tabs={statusTabs}
          value={status}
          onChange={(value) =>
            updateParams({
              status: value === "all" ? undefined : value,
              page: undefined,
            })
          }
          label={t("filterLabel")}
          trailing={directoryQuery.isPending ? t("loading") : t("workspaceCount", { count: total })}
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
                placeholder={t("searchPlaceholder")}
                aria-label={t("searchAriaLabel")}
                className="h-8 w-full rounded-lg border border-hairline bg-surface-1 pl-8 pr-2.5 text-[13px] text-ink placeholder:text-ink-subtle focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </form>
            <label className="sr-only" htmlFor="workspace-sort">
              {t("sortLabel")}
            </label>
            <select
              id="workspace-sort"
              value={sort}
              onChange={(event) => updateParams({ sort: event.target.value, page: undefined })}
              className="h-8 rounded-lg border border-hairline bg-surface-1 px-2 text-[13px] text-ink focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <AdminPanel className="mt-4">
          <div className="hidden items-center border-b border-border px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-subtle md:flex">
            <span className="flex-1">{t("columns.workspace")}</span>
            <span className="w-[110px] shrink-0">{t("columns.status")}</span>
            <span className="w-[220px] shrink-0">{t("columns.owner")}</span>
            <span className="w-[90px] shrink-0 text-right">{t("columns.members")}</span>
            <span className="w-[120px] shrink-0 text-right">{t("columns.created")}</span>
            <span className="w-[130px] shrink-0 text-right">{t("columns.lastActivity")}</span>
          </div>

          {directoryQuery.isError ? (
            <div className="flex items-start gap-2 px-4 py-8 text-sm text-destructive">
              <WarningCircle size={18} weight="duotone" className="mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">{t("errorTitle")}</p>
                <p className="mt-1 text-ink-muted">{t("errorDescription")}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => void directoryQuery.refetch()}
                >
                  {t("tryAgain")}
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
                <p className="mt-3 text-sm font-medium">{t("emptyTitle")}</p>
                <p className="mt-1 text-xs text-ink-muted">{t("emptyDescription")}</p>
              </div>
            </div>
          ) : (
            <ul>
              {items.map((workspace) => (
                <li key={workspace.id}>
                  <Link
                    // WT-560: the directory has the slug, so it links straight to the named URL — no
                    // id ever reaches the address bar from here, not even for a redirect.
                    href={`/admin/workspaces/${workspace.slug}`}
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
              <p className="text-xs text-ink-muted">{t("pageOf", { page, totalPages })}</p>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => updateParams({ page: String(page - 1) })}
                >
                  <CaretLeft size={13} />
                  {t("previous")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => updateParams({ page: String(page + 1) })}
                >
                  {t("next")}
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
    <Suspense fallback={<div className="min-h-full bg-panel" />}>
      <WorkspacesDirectory />
    </Suspense>
  );
}
