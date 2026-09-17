"use client";

import { Suspense, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowsClockwise, ClockCounterClockwise, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  AdminFilterTabs,
  AdminPage,
  AdminPageHeader,
  AdminPanel,
} from "@/components/admin/admin-page-chrome";
import { AuditStateSummary, formatAuditWhen } from "@/components/audit/audit-state-summary";
import { useAdminAuditLog } from "@/hooks/use-admin-audit";
import { cn } from "@/lib/utils";
import type { AdminAuditLogEntryDto } from "@/types/admin-audit";

const PAGE_SIZE = 25;

const RESULT_VALUES = ["all", "succeeded", "failed"] as const;

type ResultFilter = (typeof RESULT_VALUES)[number];

function isResultFilter(value: string | null): value is ResultFilter {
  return (RESULT_VALUES as readonly string[]).includes(value ?? "");
}

function AuditLog() {
  const t = useTranslations("adminMisc.audit");
  const router = useRouter();
  const searchParams = useSearchParams();

  const resultParam = searchParams.get("result");
  const result: ResultFilter = isResultFilter(resultParam) ? resultParam : "all";
  const entityType = searchParams.get("entityType") ?? "";
  const parsedPage = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  const updateParams = (next: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined || value === "") params.delete(key);
      else params.set(key, value);
    }
    const queryString = params.toString();
    router.replace(queryString ? `/admin/audit?${queryString}` : "/admin/audit");
  };

  const query = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      result: result === "all" ? undefined : result,
      entityType: entityType || undefined,
    }),
    [page, result, entityType],
  );

  const auditQuery = useAdminAuditLog(query);
  const items = auditQuery.data?.items ?? [];
  const total = auditQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const resultTabs = useMemo(
    () => [
      { value: "all" as const, label: t("resultTabs.all") },
      { value: "succeeded" as const, label: t("resultTabs.succeeded") },
      { value: "failed" as const, label: t("resultTabs.failed") },
    ],
    [t],
  );

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow={t("eyebrow")}
        eyebrowIcon={<ClockCounterClockwise size={14} weight="fill" />}
        title={t("title")}
        description={t("description")}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void auditQuery.refetch()}
            disabled={auditQuery.isFetching}
          >
            <ArrowsClockwise size={14} className={cn(auditQuery.isFetching && "animate-spin")} />
            {t("refresh")}
          </Button>
        }
      />

      <AdminFilterTabs
        tabs={resultTabs}
        value={result}
        onChange={(value) =>
          updateParams({ result: value === "all" ? undefined : value, page: undefined })
        }
        label={t("actionResultAria")}
        trailing={auditQuery.isPending ? t("loading") : t("entryCount", { count: total })}
      />

      <AdminPanel className="mt-4">
        {auditQuery.isError ? (
          <div className="flex items-start gap-3 px-4 py-10 text-sm">
            <WarningCircle size={18} weight="duotone" className="mt-0.5 shrink-0 text-destructive" />
            <div>
              <p className="font-medium">{t("error.title")}</p>
              <p className="mt-1 text-ink-muted">{t("error.description")}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => void auditQuery.refetch()}
              >
                {t("error.retry")}
              </Button>
            </div>
          </div>
        ) : auditQuery.isPending ? (
          <ul>
            {Array.from({ length: 8 }).map((_, index) => (
              <li key={index} className="border-b border-hairline/60 px-4 py-3 last:border-b-0">
                <div className="h-3 w-64 animate-pulse rounded bg-surface-2" />
              </li>
            ))}
          </ul>
        ) : items.length === 0 ? (
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
          <ul>
            {items.map((entry) => (
              <li key={entry.id}>
                <AuditRow entry={entry} />
              </li>
            ))}
          </ul>
        )}
      </AdminPanel>

      {totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-between text-[13px] text-ink-muted">
          <span>{t("pagination.pageOf", { page, totalPages })}</span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => updateParams({ page: String(page - 1) })}
            >
              {t("pagination.previous")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => updateParams({ page: String(page + 1) })}
            >
              {t("pagination.next")}
            </Button>
          </div>
        </div>
      ) : null}
    </AdminPage>
  );
}

function AuditRow({ entry }: { entry: AdminAuditLogEntryDto }) {
  const t = useTranslations("adminMisc.audit");
  const failed = entry.result !== "succeeded";

  return (
    <div className="border-b border-hairline/60 px-4 py-3 last:border-b-0">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:gap-0">
        <div className="w-[140px] shrink-0 text-[12px] text-ink-muted">
          {formatAuditWhen(entry.performedAt)}
        </div>

        <div className="w-[170px] shrink-0">
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
              failed
                ? "border-destructive/20 bg-destructive/10 text-destructive"
                : "border-border bg-surface-2 text-ink-muted",
            )}
          >
            {entry.action}
          </span>
          {/* A FAILED attempt is still a recorded action, and is often the more interesting one.
              The badge is what stops it reading as a successful change. */}
          {failed ? (
            <span className="ml-1.5 text-[10px] font-semibold uppercase text-destructive">
              {t("failedBadge")}
            </span>
          ) : null}
        </div>

        <div className="w-[150px] shrink-0 text-[12px] text-ink-muted">
          {entry.entityType}
          <span className="ml-1 text-ink-subtle">· {entry.sourceService}</span>
        </div>

        <div className="min-w-0 flex-1">
          {/* Reason is a first-class column, not a tooltip. Every mutating admin endpoint requires
              one at write time; an audit table that hides it is worth about as much as no audit
              table at all. */}
          <p className="text-[13px] text-ink">
            {entry.reason || <span className="text-ink-subtle">{t("noReasonRecorded")}</span>}
          </p>
          <AuditStateSummary before={entry.beforeSummary} after={entry.afterSummary} />
        </div>

        <div className="w-[110px] shrink-0 font-mono text-[11px] text-ink-subtle md:text-right">
          {entry.actorId.slice(0, 8)}…
        </div>
      </div>
    </div>
  );
}

export default function AdminAuditPage() {
  return (
    <Suspense fallback={<div className="min-h-full bg-panel" />}>
      <AuditLog />
    </Suspense>
  );
}
