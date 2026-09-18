"use client";

import { Suspense, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowsClockwise,
  Handshake,
  MagnifyingGlass,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AdminFilterTabs,
  AdminPage,
  AdminPageHeader,
  AdminPanel,
} from "@/components/admin/admin-page-chrome";
import { useAdminSalesLeads, useUpdateSalesLeadStatus } from "@/hooks/use-admin-sales-leads";
import { getErrorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import {
  SALES_LEAD_STATUSES,
  type SalesLeadDto,
  type SalesLeadStatus,
} from "@/types/admin-sales-lead";

const PAGE_SIZE = 20;

type StatusFilter = "all" | SalesLeadStatus;

const numberFormatter = new Intl.NumberFormat("en-US");

function isStatus(value: string | null): value is SalesLeadStatus {
  return (SALES_LEAD_STATUSES as readonly string[]).includes(value ?? "");
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

/**
 * The seat and credit figures the lead asked for, read out of the free-form pricing estimate.
 *
 * Only the two keys billing itself validates are read — anything else in that JSON is whatever the
 * form of the day sent, and guessing at it would put invented numbers beside a real request.
 */
function requestedFigures(lead: SalesLeadDto, t: ReturnType<typeof useTranslations>): string[] {
  const estimate = lead.pricingEstimate;
  if (!estimate || typeof estimate !== "object") return [];
  const figures: string[] = [];
  const seats = Number(estimate.requestedWorkspaceMembers);
  if (Number.isFinite(seats) && seats > 0) {
    figures.push(t("seats", { count: seats }));
  }
  const credits = Number(estimate.requestedMonthlyCredits);
  if (Number.isFinite(credits) && credits > 0) {
    figures.push(t("creditsPerMonth", { count: numberFormatter.format(credits) }));
  }
  return figures;
}

function SalesLeadsInbox() {
  const t = useTranslations("adminMisc.salesLeads");
  const router = useRouter();
  const searchParams = useSearchParams();

  const statusParam = searchParams.get("status");
  const status: StatusFilter = isStatus(statusParam) ? statusParam : "all";
  const search = searchParams.get("q")?.trim() ?? "";
  const parsedPage = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  const [searchDraft, setSearchDraft] = useState(search);

  const statusLabels: Record<SalesLeadStatus, string> = useMemo(
    () => ({
      new: t("statusLabels.new"),
      reviewing: t("statusLabels.reviewing"),
      quoted: t("statusLabels.quoted"),
      converted: t("statusLabels.converted"),
      closed: t("statusLabels.closed"),
    }),
    [t],
  );

  const statusTabs = useMemo(
    () => [
      { value: "all" as const, label: t("allTab") },
      ...SALES_LEAD_STATUSES.map((status) => ({ value: status, label: statusLabels[status] })),
    ],
    [t, statusLabels],
  );

  const updateParams = (next: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined || value === "") params.delete(key);
      else params.set(key, value);
    }
    const queryString = params.toString();
    router.replace(queryString ? `/admin/sales-leads?${queryString}` : "/admin/sales-leads");
  };

  const query = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      status: status === "all" ? undefined : status,
      search: search || undefined,
    }),
    [page, status, search],
  );

  const leadsQuery = useAdminSalesLeads(query);
  const updateStatus = useUpdateSalesLeadStatus();

  const items = leadsQuery.data?.items ?? [];
  const total = leadsQuery.data?.totalCount ?? 0;
  const totalPages = Math.max(1, leadsQuery.data?.totalPages ?? 1);

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    updateParams({ q: searchDraft.trim() || undefined, page: undefined });
  };

  const changeStatus = async (lead: SalesLeadDto, next: SalesLeadStatus) => {
    if (next === lead.status) return;
    try {
      await updateStatus.mutateAsync({ id: lead.id, status: next });
      toast.success(t("statusUpdated", { company: lead.company, status: statusLabels[next].toLowerCase() }));
    } catch (error) {
      toast.error(getErrorMessage(error, t("statusUpdateFailed")));
    }
  };

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow={t("eyebrow")}
        eyebrowIcon={<Handshake size={14} weight="fill" />}
        title={t("title")}
        description={t("description")}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void leadsQuery.refetch()}
            disabled={leadsQuery.isFetching}
          >
            <ArrowsClockwise size={14} className={cn(leadsQuery.isFetching && "animate-spin")} />
            {t("refresh")}
          </Button>
        }
      />

      <AdminFilterTabs
        tabs={statusTabs}
        value={status}
        onChange={(value) =>
          updateParams({ status: value === "all" ? undefined : value, page: undefined })
        }
        label={t("leadStatusAria")}
        trailing={leadsQuery.isPending ? t("loading") : t("leadCount", { count: total })}
      />

      <form onSubmit={submitSearch} className="mt-4 flex max-w-md items-center gap-2">
        <div className="relative flex-1">
          <MagnifyingGlass
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-subtle"
          />
          <Input
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchAria")}
            className="h-9 pl-8"
          />
        </div>
        <Button type="submit" variant="outline" size="sm">
          {t("search")}
        </Button>
      </form>

      <AdminPanel className="mt-3">
        {leadsQuery.isError ? (
          <div className="flex items-start gap-3 px-4 py-10 text-sm">
            <WarningCircle size={18} weight="duotone" className="mt-0.5 shrink-0 text-destructive" />
            <div>
              <p className="font-medium">{t("error.title")}</p>
              <p className="mt-1 text-ink-muted">{t("error.description")}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => void leadsQuery.refetch()}
              >
                {t("error.retry")}
              </Button>
            </div>
          </div>
        ) : leadsQuery.isPending ? (
          <ul>
            {Array.from({ length: 6 }).map((_, index) => (
              <li
                key={index}
                className="flex items-center gap-4 border-b border-hairline/60 px-4 py-3 last:border-b-0"
              >
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-52 animate-pulse rounded bg-surface-2" />
                  <div className="h-2.5 w-32 animate-pulse rounded bg-surface-2" />
                </div>
              </li>
            ))}
          </ul>
        ) : items.length === 0 ? (
          <div className="grid place-items-center px-4 py-14 text-center">
            <div>
              <span className="mx-auto grid size-10 place-items-center rounded-xl bg-surface-2 text-ink-subtle">
                <Handshake size={20} weight="duotone" />
              </span>
              <p className="mt-3 text-sm font-medium">{t("empty.title")}</p>
              <p className="mt-1 text-xs text-ink-muted">{t("empty.description")}</p>
            </div>
          </div>
        ) : (
          <ul>
            {items.map((lead) => (
              <li key={lead.id}>
                <SalesLeadRow
                  lead={lead}
                  isSaving={updateStatus.isPending && updateStatus.variables?.id === lead.id}
                  onStatusChange={(next) => void changeStatus(lead, next)}
                  statusLabels={statusLabels}
                />
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

function SalesLeadRow({
  lead,
  isSaving,
  onStatusChange,
  statusLabels,
}: {
  lead: SalesLeadDto;
  isSaving: boolean;
  onStatusChange: (status: SalesLeadStatus) => void;
  statusLabels: Record<SalesLeadStatus, string>;
}) {
  const t = useTranslations("adminMisc.salesLeads");
  const [expanded, setExpanded] = useState(false);
  const figures = requestedFigures(lead, t);
  const notes = lead.useCaseNotes?.trim() ?? "";
  const isLongNote = notes.length > 160;

  return (
    <div className="flex flex-col gap-3 border-b border-hairline/60 px-4 py-3.5 last:border-b-0 md:flex-row md:gap-4">
      <div className="min-w-0 md:w-[240px] md:shrink-0">
        <p className="truncate text-[13px] font-medium text-ink">{lead.company}</p>
        <p className="truncate text-[12px] text-ink-muted">
          {lead.firstName} {lead.lastName}
        </p>
        <a
          href={`mailto:${lead.workEmail}`}
          className="block truncate text-[12px] text-ink-subtle transition-colors hover:text-ink"
        >
          {lead.workEmail}
        </a>
        {lead.workspaceId ? (
          <Link
            href={`/admin/workspaces/${lead.workspaceId}`}
            className="mt-1 inline-block text-[11px] font-medium text-primary hover:underline"
          >
            {t("openWorkspace")}
          </Link>
        ) : (
          <p className="mt-1 text-[11px] text-ink-subtle">{t("noWorkspaceYet")}</p>
        )}
      </div>

      <div className="min-w-0 flex-1 text-[13px]">
        <p className="text-ink">
          <span className="font-medium">{lead.requestType}</span>
          {figures.length > 0 ? (
            <span className="text-ink-muted"> · {figures.join(" · ")}</span>
          ) : null}
        </p>
        <p className="mt-0.5 text-[12px] text-ink-muted">
          {t("meetingsPerMonthNow", { count: lead.currentMonthlyMeetingVolume })}
          {lead.expectedMonthlyMeetingVolumeInSixMonths
            ? ` · ${t("expectedInSixMonths", { count: lead.expectedMonthlyMeetingVolumeInSixMonths })}`
            : ""}
        </p>
        {lead.featureInterests.length > 0 || lead.targetLanguages.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {[...lead.featureInterests, ...lead.targetLanguages].map((tag, index) => (
              <span
                key={`${tag}-${index}`}
                className="rounded-full border border-hairline bg-surface-2 px-2 py-0.5 text-[11px] text-ink-muted"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}
        {notes ? (
          <div className="mt-2">
            <p
              className={cn(
                "whitespace-pre-line text-[12px] text-ink",
                !expanded && "line-clamp-2",
              )}
            >
              {notes}
            </p>
            {isLongNote ? (
              <button
                type="button"
                onClick={() => setExpanded((value) => !value)}
                className="mt-0.5 text-[11px] font-medium text-ink-subtle hover:text-ink"
              >
                {expanded ? t("showLess") : t("showMore")}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 items-start justify-between gap-3 md:w-[170px] md:flex-col md:items-end">
        <p className="text-[12px] text-ink-muted md:text-right">{formatDateTime(lead.createdAt)}</p>
        <select
          value={lead.status}
          disabled={isSaving}
          onChange={(event) => onStatusChange(event.target.value as SalesLeadStatus)}
          aria-label={t("statusAria", { company: lead.company })}
          className="h-8 rounded-lg border border-border bg-surface-1 px-2 text-[13px] text-ink outline-none focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/20 disabled:opacity-60"
        >
          {SALES_LEAD_STATUSES.map((value) => (
            <option key={value} value={value}>
              {statusLabels[value]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export default function AdminSalesLeadsPage() {
  return (
    <Suspense fallback={<div className="min-h-full bg-panel" />}>
      <SalesLeadsInbox />
    </Suspense>
  );
}
