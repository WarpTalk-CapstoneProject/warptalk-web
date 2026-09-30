"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowsClockwise,
  Buildings,
  CalendarBlank,
  Handshake,
  Megaphone,
  Tag,
} from "@phosphor-icons/react/dist/ssr";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { AdminPage, AdminPageHeader, AdminPanel } from "@/components/admin/admin-page-chrome";
import {
  AdminDataTable,
  AdminListToolbar,
  AdminStatusTabs,
  resolveAdminWorkspaces,
  searchAdminWorkspaces,
  useAdminListState,
  type AdminColumn,
  type AdminFilterField,
} from "@/components/admin/list";
import { useAdminSalesLeads, useUpdateSalesLeadStatus } from "@/hooks/use-admin-sales-leads";
import { getErrorMessage } from "@/lib/api/errors";
import {
  dateRangeBounds,
  dateRangeValue,
  entityValues,
  enumValue,
  type ListStateConfig,
} from "@/lib/admin/list-state";
import { cn } from "@/lib/utils";
import {
  SALES_LEAD_DEFAULT_SOURCE,
  SALES_LEAD_STATUSES,
  type SalesLeadDto,
  type SalesLeadQuery,
  type SalesLeadSort,
  type SalesLeadStatus,
} from "@/types/admin-sales-lead";

const PAGE_SIZE = 20;
/**
 * The board is a pipeline, and a pipeline of twenty cards is not one. Billing caps a page at 100
 * (`SalesInquiryConstants.Defaults.MaxPageSize`), so the board asks for that; it is still one page,
 * in the list's order, and the pager under it says so.
 */
const BOARD_PAGE_SIZE = 100;

/**
 * The inbox's view, all of it in the URL — `status=` is what the tabs write, so the palette's
 * "New leads" saved view (`/admin/sales-leads?status=new`) is just a link.
 *
 * Every filter is server-side (billing's GET /admin/billing/sales-leads). Request type and source are
 * open sets — the contact form decides them, not a CHECK constraint — so their defs carry no
 * `values` and any value in a link is sent as typed; billing matches it case-insensitively.
 */
const LIST_CONFIG: ListStateConfig = {
  filters: [
    { key: "status", kind: "enum", values: SALES_LEAD_STATUSES },
    { key: "requestType", kind: "enum" },
    { key: "source", kind: "enum" },
    { key: "created", kind: "dateRange" },
    { key: "workspace", kind: "entity" },
  ],
  sortFields: ["created", "company"],
  defaultSort: { field: "created", direction: "desc" },
  columns: [{ id: "lead" }, { id: "request" }, { id: "source", defaultHidden: true }, { id: "created" }, { id: "status" }],
  groupings: ["status"],
  views: ["list", "board"],
};

function apiSort(field: string, direction: "asc" | "desc"): SalesLeadSort {
  if (field === "company") return direction === "asc" ? "company_asc" : "company_desc";
  return direction === "asc" ? "created_asc" : "created_desc";
}

const numberFormatter = new Intl.NumberFormat("en-US");

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

/**
 * Every value of an open-set property this page has seen, so the filter menu can offer them.
 *
 * Accumulated rather than read off the current page: once "Request type is enterprise" is applied
 * every row on the page says enterprise, and a menu built from the page would offer nothing else.
 * Adjusted during render (React's documented pattern for state derived from props), not in an effect.
 */
function useSeenValues(values: readonly string[], seed: readonly string[]): string[] {
  const [seen, setSeen] = useState<string[]>(() => Array.from(new Set(seed)));
  const missing = Array.from(new Set(values.filter((value) => value && !seen.includes(value))));
  if (missing.length > 0) setSeen([...seen, ...missing]);
  return missing.length > 0 ? [...seen, ...missing] : seen;
}

function SalesLeadsInbox() {
  const t = useTranslations("adminMisc.salesLeads");
  const list = useAdminListState(LIST_CONFIG);
  const { state } = list;

  const status = enumValue(state.filters, "status") as SalesLeadStatus | undefined;
  const requestType = enumValue(state.filters, "requestType");
  const source = enumValue(state.filters, "source");
  const workspaceId = entityValues(state.filters, "workspace")[0];
  const created = dateRangeBounds(dateRangeValue(state.filters, "created") ?? {});
  const isBoard = state.view === "board";
  const pageSize = isBoard ? BOARD_PAGE_SIZE : PAGE_SIZE;

  const query = useMemo<SalesLeadQuery>(
    () => ({
      page: state.page,
      pageSize,
      status,
      search: state.search || undefined,
      workspaceId,
      requestType,
      source,
      createdFrom: created.from,
      createdTo: created.toExclusive,
      sort: apiSort(state.sort.field, state.sort.direction),
    }),
    [
      state.page,
      pageSize,
      status,
      state.search,
      workspaceId,
      requestType,
      source,
      created.from,
      created.toExclusive,
      state.sort.field,
      state.sort.direction,
    ],
  );

  const leadsQuery = useAdminSalesLeads(query);
  const updateStatus = useUpdateSalesLeadStatus();

  const items = useMemo(() => leadsQuery.data?.items ?? [], [leadsQuery.data]);
  const total = leadsQuery.data?.totalCount ?? 0;
  const totalPages = Math.max(1, leadsQuery.data?.totalPages ?? 1);

  // Switching to the board keeps the page number but multiplies the page size, so page 4 of the
  // list can be past the board's last page. Land on the last real page instead of an empty board.
  const { setPage } = list;
  useEffect(() => {
    if (leadsQuery.data && leadsQuery.data.totalPages > 0 && state.page > leadsQuery.data.totalPages) {
      setPage(leadsQuery.data.totalPages);
    }
  }, [leadsQuery.data, state.page, setPage]);

  const requestTypes = useSeenValues(
    [...items.map((lead) => lead.requestType), ...(requestType ? [requestType] : [])],
    [],
  );
  const sources = useSeenValues(
    [...items.map((lead) => lead.source), ...(source ? [source] : [])],
    [SALES_LEAD_DEFAULT_SOURCE],
  );

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
      ...SALES_LEAD_STATUSES.map((value) => ({ value, label: statusLabels[value] })),
    ],
    [t, statusLabels],
  );

  const sourceLabel = (value: string) =>
    value === SALES_LEAD_DEFAULT_SOURCE ? t("list.sourceLabels.landing_pricing") : value;

  const filterFields: AdminFilterField[] = [
    {
      key: "requestType",
      label: t("list.filters.requestType"),
      icon: <Tag size={13} />,
      kind: "enum",
      options: requestTypes
        .slice()
        .sort((a, b) => a.localeCompare(b))
        .map((value) => ({ value, label: value })),
    },
    {
      key: "source",
      label: t("list.filters.source"),
      icon: <Megaphone size={13} />,
      kind: "enum",
      options: sources
        .slice()
        .sort((a, b) => a.localeCompare(b))
        .map((value) => ({ value, label: sourceLabel(value), hint: value === sourceLabel(value) ? undefined : value })),
    },
    { key: "created", label: t("list.filters.created"), icon: <CalendarBlank size={13} />, kind: "dateRange" },
    {
      key: "workspace",
      label: t("list.filters.workspace"),
      icon: <Buildings size={13} />,
      kind: "entity",
      placeholder: t("list.filters.workspacePlaceholder"),
      search: searchAdminWorkspaces,
      resolve: resolveAdminWorkspaces,
    },
  ];

  const changeStatus = async (lead: SalesLeadDto, next: SalesLeadStatus) => {
    if (next === lead.status) return;
    try {
      await updateStatus.mutateAsync({ id: lead.id, status: next });
      toast.success(t("statusUpdated", { company: lead.company, status: statusLabels[next].toLowerCase() }));
    } catch (error) {
      toast.error(getErrorMessage(error, t("statusUpdateFailed")));
    }
  };

  const columns: AdminColumn<SalesLeadDto>[] = [
    {
      id: "lead",
      header: t("list.columns.lead"),
      primary: true,
      sortField: "company",
      className: "w-[250px]",
      cell: (lead) => <LeadIdentity lead={lead} />,
    },
    {
      id: "request",
      header: t("list.columns.request"),
      cell: (lead) => <LeadRequest lead={lead} compact={isBoard} />,
    },
    {
      id: "source",
      header: t("list.columns.source"),
      className: "w-[140px]",
      cell: (lead) => <span className="text-[12px] text-ink-muted">{sourceLabel(lead.source)}</span>,
    },
    {
      id: "created",
      header: t("list.columns.created"),
      align: "right",
      className: "w-[150px]",
      sortField: "created",
      defaultDirection: "desc",
      cell: (lead) => <span className="text-[12px] text-ink-muted">{formatDateTime(lead.createdAt)}</span>,
    },
    {
      id: "status",
      header: t("list.columns.status"),
      className: "w-[150px]",
      // The status change stays a row control: a lead is triaged from the inbox, not from a page
      // of its own, and on the board the same control is how a card moves column.
      cell: (lead) => (
        <select
          value={lead.status}
          disabled={updateStatus.isPending && updateStatus.variables?.id === lead.id}
          onChange={(event) => void changeStatus(lead, event.target.value as SalesLeadStatus)}
          aria-label={t("statusAria", { company: lead.company })}
          className="h-8 rounded-lg border border-border bg-surface-1 px-2 text-[13px] text-ink outline-none focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/20 disabled:opacity-60"
        >
          {SALES_LEAD_STATUSES.map((value) => (
            <option key={value} value={value}>
              {statusLabels[value]}
            </option>
          ))}
        </select>
      ),
    },
  ];

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

      <AdminStatusTabs list={list} filterKey="status" tabs={statusTabs} label={t("leadStatusAria")} />

      <AdminListToolbar
        list={list}
        searchPlaceholder={t("searchPlaceholder")}
        filters={filterFields}
        count={leadsQuery.isPending ? null : total}
        countLabel={t("leadCount", { count: total })}
        isFetching={leadsQuery.isFetching && !leadsQuery.isPending}
        display={{
          board: true,
          sortOptions: [
            { field: "created", label: t("list.sortFields.created") },
            { field: "company", label: t("list.sortFields.company") },
          ],
          groupOptions: [{ key: "status", label: t("list.columns.status") }],
          columns: columns
            .filter((column) => !column.primary)
            .map((column) => ({ id: column.id, label: column.header })),
        }}
      />

      {isBoard && totalPages > 1 ? (
        <p className="mb-2 text-[12px] text-ink-muted">{t("list.boardPageNote", { size: BOARD_PAGE_SIZE })}</p>
      ) : null}

      <AdminPanel>
        <AdminDataTable
          list={list}
          columns={columns}
          rows={items}
          rowKey={(lead) => lead.id}
          isPending={leadsQuery.isPending}
          isError={leadsQuery.isError}
          onRetry={() => void leadsQuery.refetch()}
          empty={{
            title: t("list.emptyTitle"),
            description: t("list.emptyDescription"),
            icon: <Handshake size={20} weight="duotone" />,
          }}
          groupings={{
            status: {
              keyOf: (lead) => lead.status,
              label: (key) => statusLabels[key as SalesLeadStatus] ?? key,
              order: SALES_LEAD_STATUSES,
            },
          }}
          boardGrouping="status"
          pagination={{ page: state.page, pageCount: totalPages, total, pageSize }}
          caption={t("title")}
          minWidth={860}
        />
      </AdminPanel>
    </AdminPage>
  );
}

function LeadIdentity({ lead }: { lead: SalesLeadDto }) {
  const t = useTranslations("adminMisc.salesLeads");
  return (
    <div className="min-w-0">
      <p className="truncate text-[13px] font-medium text-ink">{lead.company}</p>
      <p className="truncate text-[12px] font-normal text-ink-muted">
        {lead.firstName} {lead.lastName}
      </p>
      <a
        href={`mailto:${lead.workEmail}`}
        className="block truncate text-[12px] font-normal text-ink-subtle transition-colors hover:text-ink"
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
        <p className="mt-1 text-[11px] font-normal text-ink-subtle">{t("noWorkspaceYet")}</p>
      )}
    </div>
  );
}

/**
 * What the lead asked for. On the board only the headline fits a card; the list keeps the volumes,
 * the tags and the use-case notes with their Show more / Show less expansion.
 */
function LeadRequest({ lead, compact }: { lead: SalesLeadDto; compact: boolean }) {
  const t = useTranslations("adminMisc.salesLeads");
  const [expanded, setExpanded] = useState(false);
  const figures = requestedFigures(lead, t);
  const notes = lead.useCaseNotes?.trim() ?? "";
  const isLongNote = notes.length > 160;

  if (compact) {
    return (
      <span className="text-[12px] text-ink">
        {lead.requestType}
        {figures.length > 0 ? <span className="text-ink-muted"> · {figures.join(" · ")}</span> : null}
      </span>
    );
  }

  return (
    <div className="min-w-0 text-[13px]">
      <p className="text-ink">
        <span className="font-medium">{lead.requestType}</span>
        {figures.length > 0 ? <span className="text-ink-muted"> · {figures.join(" · ")}</span> : null}
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
          <p className={cn("whitespace-pre-line text-[12px] text-ink", !expanded && "line-clamp-2")}>{notes}</p>
          {isLongNote ? (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              aria-expanded={expanded}
              className="mt-0.5 text-[11px] font-medium text-ink-subtle hover:text-ink"
            >
              {expanded ? t("showLess") : t("showMore")}
            </button>
          ) : null}
        </div>
      ) : null}
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
