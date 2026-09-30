"use client";

/**
 * The platform audit log: every administrative action across the services, from one store.
 *
 * It used to render a single page of whatever the store held, and the store held almost nothing
 * but workspace suspensions — so it "looked hardcoded". The store now receives every admin write
 * (billing, accounts, catalogs, glossary, announcements) with who, from where and why, and this
 * page reads it with server-side filters, a cursor, a detail drawer and a CSV export.
 */

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowsClockwise,
  ClockCounterClockwise,
  DownloadSimple,
  Pause,
  Play,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { AdminPage, AdminPageHeader, AdminPanel } from "@/components/admin/admin-page-chrome";
import { AuditDetailDrawer } from "@/components/admin/audit/audit-detail-drawer";
import { AuditFilterBar } from "@/components/admin/audit/audit-filter-bar";
import { AuditTable } from "@/components/admin/audit/audit-table";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import {
  DEFAULT_AUDIT_FILTERS,
  auditFiltersToParams,
  auditFiltersToQuery,
  readAuditFilters,
  type AuditFilters,
} from "@/lib/admin/audit-log";
import { isDateRangeInverted } from "@/lib/workspace/audit-log";
import { useAdminAuditEntry, useAdminAuditFacets, useAdminAuditLog } from "@/hooks/use-admin-audit";
import { adminAuditService } from "@/services/admin-audit.service";
import { cn } from "@/lib/utils";
import type { AdminAuditLogEntryDto } from "@/types/admin-audit";

const PAGE_SIZE = 50;

function AuditLog() {
  const t = useTranslations("adminMisc.audit");
  const router = useRouter();
  const searchParams = useSearchParams();

  const filters = useMemo(() => readAuditFilters(searchParams), [searchParams]);
  const openEntryId = searchParams.get("entry");
  const [live, setLive] = useState(true);
  const [exporting, setExporting] = useState(false);

  const replaceParams = (params: URLSearchParams) => {
    const query = params.toString();
    router.replace(query ? `/admin/audit?${query}` : "/admin/audit", { scroll: false });
  };

  const updateFilters = (next: Partial<AuditFilters>) => {
    const params = auditFiltersToParams({ ...filters, ...next });
    if (openEntryId) params.set("entry", openEntryId);
    replaceParams(params);
  };

  const setOpenEntry = (id: string | null) => {
    const params = auditFiltersToParams(filters);
    if (id) params.set("entry", id);
    replaceParams(params);
  };

  // A relative range is anchored to the minute the filters last changed, so the query key is
  // stable between renders; live mode re-reads it, and new entries have no upper bound to miss.
  const query = useMemo(() => ({ ...auditFiltersToQuery(filters), limit: PAGE_SIZE }), [filters]);
  const inverted = filters.preset === "custom" && isDateRangeInverted(filters.fromDate, filters.toDate);

  const log = useAdminAuditLog(query, { live: live && !inverted });
  const facets = useAdminAuditFacets();
  const entries = useMemo(() => log.data?.pages.flatMap((page) => page.items) ?? [], [log.data]);

  const loadedEntry = openEntryId ? entries.find((entry) => entry.id === openEntryId) ?? null : null;
  // A shared link can name an entry outside the loaded pages; that one is fetched on its own.
  const entryQuery = useAdminAuditEntry(openEntryId && !loadedEntry ? openEntryId : null);
  const openEntry = loadedEntry ?? entryQuery.data ?? null;

  const workspaceName =
    filters.workspaceId
      ? entries.find((entry) => entry.entity.workspaceId === filters.workspaceId)?.entity.workspaceName ?? null
      : null;

  const exportCsv = async () => {
    setExporting(true);
    try {
      // The same filters as the list, without the page size: the server walks every page.
      const result = await adminAuditService.exportCsv(auditFiltersToQuery(filters));
      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      if (result.truncated) toast.warning(t("export.truncated", { count: result.rows }));
      else if (result.rows > 0) toast.success(t("export.done", { count: result.rows }));
      else toast.success(t("export.doneUnknown"));
      // The export is itself an entry; show it.
      void log.refetch();
    } catch {
      toast.error(t("export.failed"));
    } finally {
      setExporting(false);
    }
  };

  const openFromEntry = (entry: AdminAuditLogEntryDto) => setOpenEntry(entry.id);

  const loadedCount = entries.length;
  const trailing = log.isPending
    ? t("loading")
    : log.hasNextPage
      ? t("filters.countMore", { count: loadedCount })
      : t("filters.count", { count: loadedCount });

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow={t("eyebrow")}
        eyebrowIcon={<ClockCounterClockwise size={14} weight="fill" />}
        title={t("title")}
        description={t("description")}
        actions={
          <>
            <Tooltip content={live ? t("live.on") : t("live.off")}>
              <Button
                variant="outline"
                size="sm"
                aria-pressed={live}
                onClick={() => setLive((value) => !value)}
              >
                <span
                  aria-hidden
                  className={cn(
                    "size-1.5 rounded-full",
                    live ? "animate-pulse bg-emerald-500" : "bg-ink-subtle",
                  )}
                />
                {live ? <Pause size={13} /> : <Play size={13} />}
                {t("live.label")}
              </Button>
            </Tooltip>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void log.refetch()}
              disabled={log.isFetching}
            >
              <ArrowsClockwise size={14} className={cn(log.isFetching && "animate-spin")} />
              {t("refresh")}
            </Button>
            <Tooltip content={t("export.tooltip")}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void exportCsv()}
                disabled={exporting || inverted}
              >
                <DownloadSimple size={14} />
                {exporting ? t("export.exporting") : t("export.button")}
              </Button>
            </Tooltip>
          </>
        }
      />

      <AuditFilterBar
        filters={filters}
        facets={facets.data}
        workspaceName={workspaceName}
        trailing={trailing}
        onChange={updateFilters}
        onClear={() =>
          updateFilters({
            ...DEFAULT_AUDIT_FILTERS,
            preset: filters.preset,
            fromDate: filters.fromDate,
            toDate: filters.toDate,
          })
        }
      />

      <AdminPanel className="mt-4">
        {log.isError ? (
          <div className="flex items-start gap-3 px-4 py-10 text-sm">
            <WarningCircle size={18} weight="duotone" className="mt-0.5 shrink-0 text-destructive" />
            <div>
              <p className="font-medium">{t("error.title")}</p>
              <p className="mt-1 text-ink-muted">{t("error.description")}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => void log.refetch()}>
                {t("error.retry")}
              </Button>
            </div>
          </div>
        ) : log.isPending ? (
          <ul aria-busy>
            {Array.from({ length: 8 }).map((_, index) => (
              <li key={index} className="flex gap-6 border-b border-hairline/60 px-4 py-3.5 last:border-b-0">
                <div className="h-3 w-20 animate-pulse rounded bg-surface-2" />
                <div className="h-3 w-40 animate-pulse rounded bg-surface-2" />
                <div className="h-3 w-32 animate-pulse rounded bg-surface-2" />
                <div className="h-3 flex-1 animate-pulse rounded bg-surface-2" />
              </li>
            ))}
          </ul>
        ) : entries.length === 0 ? (
          <div className="grid place-items-center px-4 py-14 text-center">
            <div>
              <span className="mx-auto grid size-10 place-items-center rounded-xl bg-surface-2 text-ink-subtle">
                <ClockCounterClockwise size={20} weight="duotone" />
              </span>
              <p className="mt-3 text-sm font-medium">{t("empty.title")}</p>
              <p className="mt-1 text-xs text-ink-muted">{t("empty.description")}</p>
            </div>
          </div>
        ) : (
          <AuditTable entries={entries} selectedId={openEntryId} onOpen={openFromEntry} />
        )}
      </AdminPanel>

      {entries.length > 0 ? (
        <div className="mt-4 flex items-center justify-center text-[13px] text-ink-muted">
          {log.hasNextPage ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void log.fetchNextPage()}
              disabled={log.isFetchingNextPage}
            >
              {log.isFetchingNextPage ? t("table.loadingMore") : t("table.loadMore")}
            </Button>
          ) : (
            <span className="text-[12px] text-ink-subtle">{t("table.end")}</span>
          )}
        </div>
      ) : null}

      {openEntryId ? (
        <AuditDetailDrawer
          entry={openEntry}
          isLoading={!loadedEntry && entryQuery.isPending}
          isError={!loadedEntry && entryQuery.isError}
          onClose={() => setOpenEntry(null)}
          onFilterActor={(entry) => {
            const params = auditFiltersToParams({ ...filters, actorId: entry.actor.id });
            replaceParams(params);
          }}
          onFilterSubject={(entry) => {
            const params = auditFiltersToParams({
              ...filters,
              entityType: entry.entity.type,
              entityId: entry.entity.id ?? entry.entity.key ?? "",
            });
            replaceParams(params);
          }}
        />
      ) : null}
    </AdminPage>
  );
}

export default function AdminAuditPage() {
  // Same ground as the page it stands in for — see check-admin-surface-contract.
  return (
    <Suspense fallback={<div className="min-h-full bg-panel" />}>
      <AuditLog />
    </Suspense>
  );
}
