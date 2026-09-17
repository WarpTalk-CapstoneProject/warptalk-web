"use client";

/**
 * Audit log — what WarpTalk staff have done to this workspace.
 *
 * WHAT IS (AND IS NOT) IN HERE
 *   The backing store is the platform audit log, and it only records actions taken by WarpTalk
 *   platform administrators: suspending, reactivating or deleting a workspace, and adjusting its
 *   credits. Nothing a member does is written there, so this page does not claim to be a record of
 *   member activity — the empty state says so rather than implying nothing has happened.
 *
 * WHY THE ACTOR IS ALWAYS "WarpTalk staff"
 *   The backend redacts it. The individual administrator, the internal note they wrote and the
 *   trace id were written for the platform's own trail; the DTO has no field for any of them, so
 *   this page could not render a staff identity even by mistake.
 *
 * Owner and Admin only, matching the endpoint. The sidebar hides the entry for everyone else; the
 * gate below is for someone who types the URL.
 */

import { Suspense, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowsClockwise,
  ClockCounterClockwise,
  Lock,
  WarningCircle,
} from "@phosphor-icons/react";

import { AuditStateSummary, formatAuditWhen } from "@/components/audit/audit-state-summary";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WorkspacePage, WorkspaceToolbar } from "@/components/workspace/page-chrome";
import { useWorkspace } from "@/hooks/use-workspace";
import { useWorkspaceAuditLog } from "@/hooks/use-workspace-audit";
import {
  auditActionLabel,
  auditEntityLabel,
  dateInputToRangeBound,
  getAuditActionOptions,
  getAuditEntityOptions,
  isDateRangeInverted,
} from "@/lib/workspace/audit-log";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { WorkspaceAuditLogEntryDto } from "@/types/workspace-audit";

const PAGE_SIZE = 25;

type ApiErrorLike = { response?: { status?: number } };

function CenteredNotice({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="grid place-items-center px-4 py-14 text-center">
      <div className="max-w-sm">
        <span className="mx-auto grid size-10 place-items-center rounded-xl bg-surface-2 text-ink-subtle">
          {icon}
        </span>
        <p className="mt-3 text-sm font-medium text-ink">{title}</p>
        {children}
      </div>
    </div>
  );
}

function AuditLog() {
  const t = useTranslations("settingsAuditLog");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId) || "";
  const storeRole = useWorkspaceStore((s) => s.role);
  const workspaceQuery = useWorkspace(activeWorkspaceId);
  const currentRole = (workspaceQuery.data?.role || storeRole || "").toLowerCase();
  const isOwnerOrAdmin = currentRole === "owner" || currentRole === "admin";

  const action = searchParams.get("action") ?? "all";
  const entityType = searchParams.get("entityType") ?? "all";
  const fromInput = searchParams.get("from") ?? "";
  const toInput = searchParams.get("to") ?? "";
  const parsedPage = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const rangeInverted = isDateRangeInverted(fromInput, toInput);

  const updateParams = (next: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined || value === "" || value === "all") params.delete(key);
      else params.set(key, value);
    }
    const queryString = params.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname);
  };

  const query = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      action: action === "all" ? undefined : action,
      entityType: entityType === "all" ? undefined : entityType,
      from: dateInputToRangeBound(fromInput, "from"),
      to: dateInputToRangeBound(toInput, "to"),
    }),
    [page, action, entityType, fromInput, toInput],
  );

  // Wrapped: the audit log renders action/entity values the server may add before this catalog
  // does, and next-intl throws on a missing key rather than returning undefined — the fallback
  // to auditActionLabel/auditEntityLabel's own humanize() depends on getting undefined back.
  const auditLogT = useMemo(
    () => (key: string) => {
      try {
        return t(key);
      } catch {
        return undefined;
      }
    },
    [t],
  );
  const actionOptions = useMemo(() => getAuditActionOptions(auditLogT), [auditLogT]);
  const entityOptions = useMemo(() => getAuditEntityOptions(auditLogT), [auditLogT]);
  const numberFormatter = useMemo(() => new Intl.NumberFormat(locale), [locale]);

  const auditQuery = useWorkspaceAuditLog(
    activeWorkspaceId,
    query,
    isOwnerOrAdmin && !rangeInverted,
  );
  const items = auditQuery.data?.items ?? [];
  const total = auditQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = action !== "all" || entityType !== "all" || Boolean(fromInput || toInput);

  if (!activeWorkspaceId) return null;

  const forbidden =
    (!workspaceQuery.isPending && !isOwnerOrAdmin) ||
    (auditQuery.error as ApiErrorLike | null)?.response?.status === 403;

  if (forbidden) {
    return (
      <WorkspacePage>
        <div className="flex flex-1 items-center justify-center px-4">
          <div className="max-w-md rounded-xl border border-hairline bg-surface-1 p-6 text-center shadow-linear">
            <span className="mx-auto grid size-12 place-items-center rounded-full bg-destructive/10 text-destructive">
              <Lock size={22} />
            </span>
            <p className="mt-3 text-lg font-bold text-ink">{t("accessDenied.title")}</p>
            <p className="mt-1 text-xs text-ink-muted">
              {t("accessDenied.description")}
            </p>
          </div>
        </div>
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage>
      <WorkspaceToolbar
        filters={
          <>
            <Select
              value={action}
              onValueChange={(value) => updateParams({ action: value ?? undefined, page: undefined })}
            >
              <SelectTrigger size="sm" className="w-[190px] shrink-0" aria-label={t("filters.actionLabel")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {actionOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={entityType}
              onValueChange={(value) => updateParams({ entityType: value ?? undefined, page: undefined })}
            >
              <SelectTrigger size="sm" className="w-[150px] shrink-0" aria-label={t("filters.targetLabel")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {entityOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="date"
              aria-label={t("filters.fromDate")}
              value={fromInput}
              max={toInput || undefined}
              onChange={(event) => updateParams({ from: event.target.value, page: undefined })}
              className="h-8 w-[150px] shrink-0 text-[13px]"
            />
            <span className="shrink-0 text-[12px] text-ink-subtle">{t("filters.to")}</span>
            <Input
              type="date"
              aria-label={t("filters.toDate")}
              value={toInput}
              min={fromInput || undefined}
              onChange={(event) => updateParams({ to: event.target.value, page: undefined })}
              className="h-8 w-[150px] shrink-0 text-[13px]"
            />
            {hasFilters ? (
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0"
                onClick={() =>
                  updateParams({
                    action: undefined,
                    entityType: undefined,
                    from: undefined,
                    to: undefined,
                    page: undefined,
                  })
                }
              >
                {t("filters.clear")}
              </Button>
            ) : null}
          </>
        }
        actions={
          <>
            <span className="text-[12px] text-ink-muted">
              {auditQuery.isPending && auditQuery.fetchStatus !== "idle"
                ? t("loading")
                : t("entryCount", { count: total, formatted: numberFormatter.format(total) })}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void auditQuery.refetch()}
              disabled={auditQuery.isFetching || rangeInverted}
            >
              <ArrowsClockwise size={14} className={cn(auditQuery.isFetching && "animate-spin")} />
              {t("refresh")}
            </Button>
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        <div className="overflow-x-auto rounded-xl border border-hairline bg-surface-1 shadow-linear">
          <div className="min-w-[720px]">
            <div
             
              className="grid grid-cols-[140px_130px_190px_120px_minmax(0,1fr)] gap-3 border-b border-hairline px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-ink-subtle"
            >
              <span>{t("table.time")}</span>
              <span>{t("table.actor")}</span>
              <span>{t("table.action")}</span>
              <span>{t("table.target")}</span>
              <span>{t("table.details")}</span>
            </div>

            {rangeInverted ? (
              <CenteredNotice
                icon={<WarningCircle size={20} weight="duotone" />}
                title={t("invalidRange.title")}
              >
                <p className="mt-1 text-xs text-ink-muted">{t("invalidRange.description")}</p>
              </CenteredNotice>
            ) : auditQuery.isError ? (
              <CenteredNotice
                icon={<WarningCircle size={20} weight="duotone" className="text-destructive" />}
                title={t("loadError")}
              >
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => void auditQuery.refetch()}
                >
                  {t("tryAgain")}
                </Button>
              </CenteredNotice>
            ) : auditQuery.isPending ? (
              <ul>
                {Array.from({ length: 6 }).map((_, index) => (
                  <li key={index} className="border-b border-hairline/60 px-4 py-3 last:border-b-0">
                    <div className="h-3 w-72 animate-pulse rounded bg-surface-2" />
                  </li>
                ))}
              </ul>
            ) : items.length === 0 ? (
              <CenteredNotice
                icon={<ClockCounterClockwise size={20} weight="duotone" />}
                title={hasFilters ? t("empty.noMatchTitle") : t("empty.noEntriesTitle")}
              >
                <p className="mt-1 text-xs text-ink-muted">
                  {hasFilters
                    ? t("empty.noMatchDescription")
                    : t("empty.noEntriesDescription")}
                </p>
              </CenteredNotice>
            ) : (
              <ul>
                {items.map((entry) => (
                  <li key={entry.id}>
                    <AuditRow entry={entry} locale={locale} t={auditLogT} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {totalPages > 1 && !rangeInverted ? (
          <div className="mt-4 flex items-center justify-between text-[13px] text-ink-muted">
            <span>
              {t("pageOf", { page, totalPages })}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => updateParams({ page: String(page - 1) })}
              >
                {t("previous")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => updateParams({ page: String(page + 1) })}
              >
                {t("next")}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </WorkspacePage>
  );
}

function AuditRow({
  entry,
  locale,
  t,
}: {
  entry: WorkspaceAuditLogEntryDto;
  locale: string;
  t: (key: string) => string | undefined;
}) {
  const hasSummary = Boolean(entry.beforeSummary || entry.afterSummary);

  return (
    <div

      className="grid grid-cols-[140px_130px_190px_120px_minmax(0,1fr)] items-start gap-3 border-b border-hairline/60 px-4 py-3 text-[13px] last:border-b-0"
    >
      <span className="text-[12px] text-ink-muted" title={new Date(entry.performedAt).toISOString()}>
        {formatAuditWhen(entry.performedAt, locale)}
      </span>
      <span className="truncate text-ink">{entry.actorDisplayName}</span>
      <span>
        <span className="inline-flex items-center rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-muted">
          {auditActionLabel(entry.action, t)}
        </span>
      </span>
      <span className="text-[12px] text-ink-muted">{auditEntityLabel(entry.entityType, t)}</span>
      <div className="min-w-0">
        {hasSummary ? (
          <AuditStateSummary before={entry.beforeSummary} after={entry.afterSummary} />
        ) : (
          <span className="text-ink-subtle">—</span>
        )}
      </div>
    </div>
  );
}

export default function WorkspaceAuditLogPage() {
  return (
    <Suspense fallback={<div className="min-h-full bg-panel" />}>
      <AuditLog />
    </Suspense>
  );
}
