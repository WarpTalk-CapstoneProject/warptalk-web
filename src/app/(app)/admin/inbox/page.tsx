"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowsClockwise,
  CalendarBlank,
  Clock,
  Flag,
  Stack,
  Tray,
  UserCircle,
  Warning,
} from "@phosphor-icons/react/dist/ssr";
import { useTranslations } from "next-intl";

import { AdminPage, AdminPageHeader, AdminPanel } from "@/components/admin/admin-page-chrome";
import { InboxItemSheet, InboxTypeIcon, useInboxLabels } from "@/components/admin/inbox/inbox-item-sheet";
import {
  AdminDataTable,
  AdminListToolbar,
  AdminStatusTabs,
  useAdminListState,
  type AdminColumn,
  type AdminFilterField,
} from "@/components/admin/list";
import { Button } from "@/components/ui/button";
import { useAdminInbox, useAdminInboxActions } from "@/hooks/use-admin-inbox";
import { useCan } from "@/hooks/use-staff-access";
import {
  AGE_BUCKETS,
  compactAge,
  inboxAccessors,
  PRIORITY_RANK,
  scopeItems,
  slaState,
  type InboxState,
} from "@/lib/admin/inbox";
import { applyClientListState, enumValue, singleEnumFilter, type ListStateConfig } from "@/lib/admin/list-state";
import { matchesSearch } from "@/lib/admin/search-text";
import { ADMIN_PERMISSIONS } from "@/lib/admin/staff-permissions";
import { formatMoney } from "@/lib/format/currency";
import { cn } from "@/lib/utils";
import {
  INBOX_PRIORITIES,
  INBOX_SOURCES,
  INBOX_TYPES,
  type InboxItemDto,
  type InboxSourceStatusDto,
} from "@/types/admin-inbox";

const STATES: readonly InboxState[] = ["open", "snoozed", "done"];

/**
 * The whole view lives in the URL: `state` (open is the default and writes nothing), `scope`
 * (the palette's "My inbox" is just `?scope=mine`), the toolkit's filters, sort and grouping.
 */
const LIST_CONFIG: ListStateConfig = {
  filters: [
    { key: "state", kind: "enum", values: STATES },
    { key: "scope", kind: "enum", values: ["all", "mine"] },
    { key: "type", kind: "enum", multiple: true, values: INBOX_TYPES },
    { key: "priority", kind: "enum", multiple: true, values: INBOX_PRIORITIES },
    { key: "source", kind: "enum", multiple: true, values: INBOX_SOURCES },
    { key: "assignee", kind: "enum" },
    { key: "age", kind: "enum", multiple: true, values: AGE_BUCKETS },
    { key: "sla", kind: "enum", multiple: true, values: ["overdue", "dueSoon", "onTrack", "none"] },
  ],
  sortFields: ["priority", "due", "age", "type"],
  defaultSort: { field: "priority", direction: "desc" },
  columns: [
    { id: "item" },
    { id: "customer" },
    { id: "age" },
    { id: "priority" },
    { id: "due" },
    { id: "assignee" },
  ],
  groupings: ["type", "priority", "assignee", "age", "source"],
};

function InboxPage() {
  const t = useTranslations("adminInbox");
  const labels = useInboxLabels();
  const list = useAdminListState(LIST_CONFIG);
  const { state } = list;
  const inbox = useAdminInbox();
  const actions = useAdminInboxActions();
  const canManage = useCan(ADMIN_PERMISSIONS.inboxManage);
  const [openKey, setOpenKey] = useState<string | null>(null);

  // "Now" is when the server built the list: ages and SLA states stay consistent with the data shown.
  const generatedAt = inbox.data?.generatedAt;
  const now = useMemo(() => (generatedAt ? new Date(generatedAt) : new Date(0)), [generatedAt]);
  const viewerId = inbox.data?.viewerId ?? null;
  const itemState = (enumValue(state.filters, "state") as InboxState | undefined) ?? "open";
  const scope = (enumValue(state.filters, "scope") as "all" | "mine" | undefined) ?? "all";

  const items = useMemo(() => inbox.data?.items ?? [], [inbox.data]);
  const scoped = useMemo(() => scopeItems(items, scope, itemState, viewerId), [items, scope, itemState, viewerId]);
  const accessors = useMemo(() => inboxAccessors(viewerId, now), [viewerId, now]);
  const rows = useMemo(
    () =>
      applyClientListState(
        scoped,
        { ...state, filters: Object.fromEntries(Object.entries(state.filters).filter(([key]) => key !== "state" && key !== "scope")) },
        accessors,
        matchesSearch,
      ),
    [scoped, state, accessors],
  );

  const counts = inbox.data?.counts;
  const selected = items.find((item) => item.key === openKey) ?? null;

  const assigneeOptions = useMemo(() => {
    const people = new Map<string, string>();
    for (const item of items) {
      if (item.triage.assigneeId && item.triage.assigneeId !== viewerId) {
        people.set(item.triage.assigneeId, item.triage.assigneeName ?? item.triage.assigneeId.slice(0, 8));
      }
    }
    return [
      { value: "me", label: t("assignee.me") },
      { value: "unassigned", label: t("assignee.unassigned") },
      ...Array.from(people, ([value, label]) => ({ value, label })),
    ];
  }, [items, viewerId, t]);

  const filterFields: AdminFilterField[] = [
    {
      key: "type",
      label: t("filters.type"),
      icon: <Stack size={13} />,
      kind: "enum",
      multiple: true,
      options: INBOX_TYPES.map((value) => ({ value, label: labels.type(value) })),
    },
    {
      key: "priority",
      label: t("filters.priority"),
      icon: <Flag size={13} />,
      kind: "enum",
      multiple: true,
      options: INBOX_PRIORITIES.map((value) => ({ value, label: labels.priority(value) })),
    },
    {
      key: "assignee",
      label: t("filters.assignee"),
      icon: <UserCircle size={13} />,
      kind: "enum",
      options: assigneeOptions,
    },
    {
      key: "age",
      label: t("filters.age"),
      icon: <CalendarBlank size={13} />,
      kind: "enum",
      multiple: true,
      options: AGE_BUCKETS.map((value) => ({ value, label: t(`age.${value}`) })),
    },
    {
      key: "sla",
      label: t("filters.sla"),
      icon: <Clock size={13} />,
      kind: "enum",
      multiple: true,
      options: (["overdue", "dueSoon", "onTrack", "none"] as const).map((value) => ({ value, label: t(`sla.${value}`) })),
    },
    {
      key: "source",
      label: t("filters.source"),
      icon: <Tray size={13} />,
      kind: "enum",
      multiple: true,
      options: INBOX_SOURCES.map((value) => ({ value, label: labels.source(value) })),
    },
  ];

  const stateTabs = STATES.map((value) => {
    const count = value === "open" ? counts?.open : value === "snoozed" ? counts?.snoozed : counts?.done;
    return { value, label: count ? `${t(`states.${value}`)} ${count}` : t(`states.${value}`) };
  });

  const columns: AdminColumn<InboxItemDto>[] = [
    {
      id: "item",
      header: t("columns.item"),
      primary: true,
      sortField: "type",
      cell: (item) => (
        <button
          type="button"
          onClick={() => setOpenKey(item.key)}
          className="flex min-w-0 items-start gap-2.5 text-left"
        >
          <InboxTypeIcon type={item.type} />
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-medium text-ink">{labels.type(item.type)}</span>
            <span className="block truncate text-[12px] text-ink-muted">{item.title}</span>
            {item.detail ? <span className="block truncate text-[12px] text-ink-subtle">{item.detail}</span> : null}
          </span>
        </button>
      ),
    },
    {
      id: "customer",
      header: t("columns.customer"),
      className: "w-[170px]",
      cell: (item) =>
        item.workspaceId ? (
          <Link href={`/admin/workspaces/${item.workspaceId}`} className="truncate text-[12px] text-ink hover:underline">
            {item.customer ?? t("unnamedWorkspace")}
          </Link>
        ) : (
          <span className="truncate text-[12px] text-ink-muted">{item.customer ?? "—"}</span>
        ),
    },
    {
      id: "age",
      header: t("columns.age"),
      sortField: "age",
      defaultDirection: "asc",
      align: "right",
      className: "w-[80px]",
      cell: (item) => {
        const age = compactAge(item.occurredAt, now);
        return <span className="text-[12px] tabular-nums text-ink-muted">{t(`ageUnits.${age.unit}`, { count: age.value })}</span>;
      },
    },
    {
      id: "priority",
      header: t("columns.priority"),
      sortField: "priority",
      defaultDirection: "desc",
      className: "w-[100px]",
      cell: (item) => <PriorityPill priority={item.priority} label={labels.priority(item.priority)} />,
    },
    {
      id: "due",
      header: t("columns.due"),
      sortField: "due",
      defaultDirection: "asc",
      className: "w-[140px]",
      cell: (item) => <DueCell item={item} now={now} />,
    },
    {
      id: "assignee",
      header: t("columns.assignee"),
      className: "w-[150px]",
      cell: (item) => (
        <span className={cn("truncate text-[12px]", item.triage.assigneeId ? "text-ink" : "text-ink-subtle")}>
          {item.triage.assigneeId
            ? item.triage.assigneeId === viewerId
              ? t("assignee.me")
              : (item.triage.assigneeName ?? t("assignee.someone"))
            : t("assignee.unassigned")}
          {item.triage.noteCount > 0 ? <span className="ml-1.5 text-ink-subtle">· {t("notesCount", { count: item.triage.noteCount })}</span> : null}
        </span>
      ),
    },
  ];

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow={t("eyebrow")}
        eyebrowIcon={<Tray size={14} weight="fill" />}
        title={t("title")}
        description={t("description")}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void actions.refresh.mutateAsync()}
            disabled={actions.refresh.isPending || inbox.isFetching}
          >
            <ArrowsClockwise size={14} className={cn((actions.refresh.isPending || inbox.isFetching) && "animate-spin")} />
            {t("refresh")}
          </Button>
        }
      />

      {counts ? (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label={t("tiles.open")} value={counts.open} />
          <Tile label={t("tiles.mine")} value={counts.mine} />
          <Tile label={t("tiles.unassigned")} value={counts.unassigned} />
          <Tile label={t("tiles.overdue")} value={counts.overdue} tone={counts.overdue > 0 ? "danger" : undefined} />
        </div>
      ) : null}

      <SourceNotices sources={inbox.data?.sources ?? []} />

      <AdminStatusTabs
        list={list}
        filterKey="state"
        allValue="open"
        tabs={stateTabs}
        label={t("statesAria")}
        trailing={
          <div role="group" aria-label={t("scope.aria")} className="inline-flex rounded-lg border border-border p-0.5">
            {(["all", "mine"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={scope === value}
                onClick={() => list.setFilter("scope", singleEnumFilter(value, "all"))}
                className={cn(
                  "h-7 rounded-md px-2.5 text-[12px] font-medium transition-colors",
                  scope === value ? "bg-surface-2 text-ink" : "text-ink-muted hover:text-ink",
                )}
              >
                {t(`scope.${value}`)}
              </button>
            ))}
          </div>
        }
      />

      <AdminListToolbar
        list={list}
        searchPlaceholder={t("searchPlaceholder")}
        filters={filterFields}
        count={inbox.isPending ? null : rows.length}
        countLabel={t("itemCount", { count: rows.length })}
        isFetching={inbox.isFetching && !inbox.isPending}
        display={{
          sortOptions: [
            { field: "priority", label: t("columns.priority") },
            { field: "due", label: t("columns.due") },
            { field: "age", label: t("columns.age") },
            { field: "type", label: t("filters.type") },
          ],
          groupOptions: [
            { key: "type", label: t("filters.type") },
            { key: "priority", label: t("filters.priority") },
            { key: "assignee", label: t("filters.assignee") },
            { key: "age", label: t("filters.age") },
            { key: "source", label: t("filters.source") },
          ],
          columns: columns.filter((column) => !column.primary).map((column) => ({ id: column.id, label: column.header })),
        }}
      />

      <AdminPanel>
        <AdminDataTable
          list={list}
          columns={columns}
          rows={rows}
          rowKey={(item) => item.key}
          onRowClick={(item) => setOpenKey(item.key)}
          isPending={inbox.isPending}
          isError={inbox.isError}
          onRetry={() => void inbox.refetch()}
          empty={{
            title: t(`empty.${itemState}.title`),
            description: t(`empty.${itemState}.description`),
            icon: <Tray size={20} weight="duotone" />,
          }}
          groupings={{
            type: { keyOf: (item) => item.type, label: (key) => labels.type(key), order: INBOX_TYPES },
            priority: {
              keyOf: (item) => item.priority,
              label: (key) => labels.priority(key),
              order: [...INBOX_PRIORITIES].sort((a, b) => PRIORITY_RANK[b] - PRIORITY_RANK[a]),
            },
            assignee: {
              keyOf: (item) => accessors.filters.assignee(item),
              label: (key) =>
                key === "me"
                  ? t("assignee.me")
                  : key === "unassigned"
                    ? t("assignee.unassigned")
                    : (items.find((item) => item.triage.assigneeId === key)?.triage.assigneeName ?? t("assignee.someone")),
              order: ["me", "unassigned"],
            },
            age: { keyOf: (item) => accessors.filters.age(item), label: (key) => t(`age.${key}`), order: AGE_BUCKETS },
            source: { keyOf: (item) => item.source, label: (key) => labels.source(key), order: INBOX_SOURCES },
          }}
          caption={t("title")}
          minWidth={900}
        />
      </AdminPanel>

      <InboxItemSheet item={selected} canManage={canManage} viewerId={viewerId} onClose={() => setOpenKey(null)} />
    </AdminPage>
  );
}

function Tile({ label, value, tone }: { label: string; value: number; tone?: "danger" }) {
  return (
    <div className="rounded-xl border border-hairline bg-surface-1 px-4 py-3">
      <p className="text-[12px] text-ink-muted">{label}</p>
      <p className={cn("mt-1 text-xl font-semibold tabular-nums", tone === "danger" ? "text-destructive" : "text-ink")}>{value}</p>
    </div>
  );
}

function PriorityPill({ priority, label }: { priority: string; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        priority === "urgent" && "border-destructive/40 bg-destructive/10 text-destructive",
        priority === "high" && "border-warning/40 bg-warning/10 text-warning",
        priority === "normal" && "border-hairline bg-surface-2 text-ink",
        priority === "low" && "border-hairline text-ink-muted",
      )}
    >
      {label}
    </span>
  );
}

function DueCell({ item, now }: { item: InboxItemDto; now: Date }) {
  const t = useTranslations("adminInbox");
  if (!item.dueAt) return <span className="text-[12px] text-ink-subtle">—</span>;
  const sla = slaState(item, now);
  const due = new Date(item.dueAt);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[12px] tabular-nums",
        sla === "overdue" ? "font-medium text-destructive" : sla === "dueSoon" ? "text-warning" : "text-ink-muted",
      )}
      title={due.toLocaleString()}
    >
      {sla === "overdue" ? <Warning size={12} weight="fill" /> : null}
      {sla === "overdue" ? t("sla.overdue") : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(due)}
      {item.amount !== null && item.currency ? <span className="ml-1 text-ink-subtle">· {formatMoney(item.amount, item.currency)}</span> : null}
    </span>
  );
}

/** A source that failed or timed out is named, and the rest of the inbox still renders. */
function SourceNotices({ sources }: { sources: readonly InboxSourceStatusDto[] }) {
  const t = useTranslations("adminInbox");
  const labels = useInboxLabels();
  const down = sources.filter((source) => source.status === "unavailable");
  const truncated = sources.filter((source) => source.status === "ok" && source.truncated);
  if (down.length === 0 && truncated.length === 0) return null;
  return (
    <div className="mb-3 space-y-1.5">
      {down.map((source) => (
        <p key={source.source} role="status" className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-[12px] text-ink">
          <Warning size={14} className="text-warning" />
          {t("sourceUnavailable", { source: labels.source(source.source) })}
          {source.error ? <span className="text-ink-muted">({source.error})</span> : null}
        </p>
      ))}
      {truncated.map((source) => (
        <p key={source.source} className="rounded-lg border border-hairline px-3 py-2 text-[12px] text-ink-muted">
          {t("sourceTruncated", { source: labels.source(source.source) })}
        </p>
      ))}
    </div>
  );
}

export default function AdminInboxPage() {
  return (
    <Suspense fallback={<div className="min-h-full bg-panel" />}>
      <InboxPage />
    </Suspense>
  );
}
