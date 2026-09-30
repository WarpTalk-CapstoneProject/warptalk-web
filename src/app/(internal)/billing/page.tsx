"use client";

import { AdjustCreditModal } from "@/components/admin/AdjustCreditModal";
import { AdminAlertsTab } from "@/components/admin/AdminAlertsTab";
import { AdminInvoicesTab } from "@/components/admin/AdminInvoicesTab";
import { AdminSubscriptionsTab } from "@/components/admin/AdminSubscriptionsTab";
import { BillingGrowthOverview } from "@/components/admin/billing-growth-overview";
import { FeatureBreakdownChart } from "@/components/admin/FeatureBreakdownChart";
import { TopWorkspacesChart } from "@/components/admin/TopWorkspacesChart";
import { UsageChart } from "@/components/admin/UsageChart";
import { Badge } from "@/components/ui/badge";
import {
  AdminPage,
  AdminPageHeader,
  AdminPanel,
} from "@/components/admin/admin-page-chrome";
import {
  AdminDataTable,
  AdminListToolbar,
  resolveAdminWorkspaces,
  searchAdminWorkspaces,
  useAdminActionIntent,
  useAdminListState,
  type AdminColumn,
  type AdminFilterField,
} from "@/components/admin/list";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  dateRangeBounds,
  dateRangeValue,
  entityValues,
  enumValue,
  numberRangeValue,
  type ListStateConfig,
  type SortDirection,
} from "@/lib/admin/list-state";
import { createHubConnection } from "@/lib/realtime/signalr";
import { billingService } from "@/services/billing.service";
import type {
  CreditHistoryFilters,
  CreditTransactionDto,
  GlobalBillingMetricsDto,
  GroupedCreditTransaction,
  UsageGroupSummary,
} from "@/types/billing";
import {
  Buildings,
  CalendarBlank,
  ChartLineUp,
  Coins,
  Download,
  Eye,
  FileText,
  Tag,
} from "@phosphor-icons/react/dist/ssr";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import {
  Bot,
  Building2,
  Check,
  Copy,
  Settings,
  Shield,
  User,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";

/**
 * The tabs, in the URL as `?tab=` (omitted for the overview). A palette result can land on one
 * directly — `?tab=invoices&q=INV-1` — and a reload keeps the reader where they were.
 */
const BILLING_TABS = ["overview", "ledger", "invoices", "subscriptions", "alerts"] as const;
type BillingTab = (typeof BILLING_TABS)[number];

function isBillingTab(value: unknown): value is BillingTab {
  return typeof value === "string" && (BILLING_TABS as readonly string[]).includes(value);
}

const TAB_TRIGGER_CLASS =
  "h-7 flex-none rounded-md px-3 text-[11px] font-medium text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink data-active:bg-ink data-active:text-surface-1 data-active:shadow-none";

const LEDGER_PAGE_SIZE = 100;
/** The billing service clamps a page at 200 rows (RepositoryPaging). */
const LEDGER_EXPORT_PAGE_SIZE = 200;
/** An export is a report, not a backup: past this many rows the admin narrows the filters. */
const LEDGER_EXPORT_CAP = 5_000;
const NIL_GUID = "00000000-0000-0000-0000-000000000000";

const LEDGER_TYPES = ["top_up", "consume", "adjustment"] as const;

/**
 * The ledger's view, all of it in the URL next to `tab=ledger`. Every filter is server-side
 * (GET /credits/history/global): the ledger grows with every AI call, so a page of it is never
 * the list. `type` is single-select because the endpoint takes one type.
 */
const LEDGER_LIST_CONFIG: ListStateConfig = {
  filters: [
    { key: "type", kind: "enum", values: LEDGER_TYPES },
    { key: "date", kind: "dateRange" },
    { key: "workspace", kind: "entity" },
    { key: "amount", kind: "numberRange" },
  ],
  sortFields: ["created", "amount"],
  defaultSort: { field: "created", direction: "desc" },
  columns: [
    { id: "created" },
    { id: "workspace" },
    { id: "type" },
    { id: "reason" },
    { id: "amount" },
    { id: "balance" },
    { id: "action" },
  ],
};

function ledgerApiSort(field: string, direction: SortDirection): NonNullable<CreditHistoryFilters["sort"]> {
  if (field === "amount") return direction === "asc" ? "amount_asc" : "amount_desc";
  return direction === "asc" ? "created_asc" : "created_desc";
}

/** Amount bounds are whole credits on the magnitude (the endpoint binds `int?`). */
function creditBound(value: number | undefined, edge: "min" | "max"): number | undefined {
  if (value === undefined) return undefined;
  const whole = edge === "min" ? Math.ceil(value) : Math.floor(value);
  return Math.max(0, whole);
}

/**
 * Consecutive rows for the same workspace, reference and type fold into one line — a meeting
 * bills per segment, and a hundred "consume" rows for one session are one thing to a reader. Only
 * in date order: sorted by amount, neighbours are no longer one session.
 */
function groupConsecutiveTransactions(logs: readonly CreditTransactionDto[]): GroupedCreditTransaction[] {
  const groups: GroupedCreditTransaction[] = [];
  let current: GroupedCreditTransaction | null = null;

  for (const tx of logs) {
    if (!current) {
      current = { ...tx, originalTx: [tx], isGrouped: false };
      continue;
    }
    const sameWorkspace = current.workspaceId === tx.workspaceId;
    const sameReference = Boolean(current.referenceId && tx.referenceId && current.referenceId === tx.referenceId);
    const sameType = current.type === tx.type;
    if (sameWorkspace && sameReference && sameType && current.referenceId !== NIL_GUID) {
      current.amount += tx.amount;
      current.originalTx.push(tx);
      current.isGrouped = true;
    } else {
      groups.push(current);
      current = { ...tx, originalTx: [tx], isGrouped: false };
    }
  }
  if (current) groups.push(current);
  return groups;
}

/** Every transaction the ledger's filters match, page by page, up to the export cap. */
async function fetchLedgerForExport(filters: CreditHistoryFilters) {
  const rows: CreditTransactionDto[] = [];
  let total = 0;
  for (let page = 1; ; page += 1) {
    const result = await billingService.getGlobalCreditHistory(page, LEDGER_EXPORT_PAGE_SIZE, filters);
    total = result.totalCount;
    rows.push(...result.items);
    if (result.items.length === 0 || rows.length >= Math.min(total, LEDGER_EXPORT_CAP)) break;
  }
  return { rows: rows.slice(0, LEDGER_EXPORT_CAP), total };
}

export default function AdminBillingPage() {
  // useSearchParams (the tab and every list's view) needs a Suspense boundary. The fallback paints
  // the page's own ground so a load does not flash the chrome's grey across the content area.
  return (
    <Suspense fallback={<div className="min-h-full bg-panel" />}>
      <BillingLedgerPage />
    </Suspense>
  );
}

function BillingLedgerPage() {
  const t = useTranslations("adminBillingLedger");
  const router = useRouter();
  const pathname = usePathname();
  // This page is mounted at both /admin/billing (inside the system-admin portal's own layout,
  // src/app/(app)/admin/layout.tsx) and the legacy /billing (src/app/(internal)/layout.tsx,
  // its own separate sidebar). A hardcoded "/billing/..." link would always jump OUT of
  // whichever layout is currently showing, which is what silently swapped the sidebar out from
  // under an admin browsing from /admin/billing. Staying on the same base keeps the sidebar the
  // person is already looking at.
  const basePath = pathname.startsWith("/admin") ? "/admin/billing" : "/billing";
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  useEffect(() => {
    const connection = createHubConnection("/hubs/notification");

    connection.on("NewNotification", (notification) => {
      if (notification?.type?.startsWith("billing.")) {
        queryClient.invalidateQueries({ queryKey: ["global-billing-history"] });
        queryClient.invalidateQueries({ queryKey: ["global-billing-metrics"] });
        queryClient.invalidateQueries({ queryKey: ["global-subscriptions"] });
        queryClient.invalidateQueries({ queryKey: ["global-invoices"] });
      }
    });

    let isMounted = true;

    connection.start().catch((err) => {
      if (!isMounted) return;
      if (err?.message?.includes("stop() was called")) return;
    });

    return () => {
      isMounted = false;
      connection.stop();
    };
  }, [queryClient]);

  const rawTab = searchParams.get("tab");
  const tab: BillingTab = isBillingTab(rawTab) ? rawTab : "overview";

  const [isExportOpen, setIsExportOpen] = useState(false);
  // Bumped by the palette's "Adjust credit…": a new key remounts the modal with defaultOpen, so a
  // second intent re-opens it even after the first was closed.
  const [adjustCreditNonce, setAdjustCreditNonce] = useState(0);

  /**
   * A tab switch navigates to `?tab=x` and nothing else. Each tab owns its own search, filters,
   * ordering and page, and they share parameter names (`q`, `workspace`, `sort`): carried across,
   * the ledger's search would silently narrow the invoice list.
   */
  const selectTab = useCallback(
    (next: BillingTab) => {
      router.replace(next === "overview" ? pathname : `${pathname}?tab=${next}`, { scroll: false });
    },
    [pathname, router],
  );

  useAdminActionIntent({
    "adjust-credit": () => setAdjustCreditNonce((nonce) => nonce + 1),
    // The export is the ledger's, with the ledger's filters, so the intent lands on that tab.
    export: () => {
      selectTab("ledger");
      setIsExportOpen(true);
    },
  });

  const { data: metrics } = useQuery({
    queryKey: ["global-billing-metrics"],
    queryFn: () => billingService.getGlobalMetrics(),
  });

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow={t("header.eyebrow")}
        eyebrowIcon={<Coins size={14} weight="fill" />}
        title={t("header.title")}
        description={t("header.description")}
        actions={
          <>
            <Link href={`${basePath}/plans`}>
              <Button variant="outline" className="rounded-md h-9 px-4">
                <Settings className="mr-2 h-4 w-4 text-primary" />{" "}
                {t("actions.managePlans")}
              </Button>
            </Link>
            <AdjustCreditModal key={adjustCreditNonce} defaultOpen={adjustCreditNonce > 0} />
          </>
        }
      />

      <Tabs
        value={tab}
        onValueChange={(value) => {
          if (isBillingTab(value) && value !== tab) {
            setIsExportOpen(false);
            selectTab(value);
          }
        }}
        className="w-full mt-2"
      >
        {/* Same shape as AdminFilterTabs on the other admin pages: ink fills the selected
            tab. shadcn Tabs stays because these panels are genuinely tabbed content, not a
            filter over one list — but it should not look like a fourth control style. Only the
            active panel mounts, so only its list reads the URL and only its query runs. */}
        <TabsList
          aria-label={t("lists.tabsLabel")}
          className="h-auto gap-1 rounded-none border-b border-border bg-transparent p-0 py-3"
        >
          {BILLING_TABS.map((value) => (
            <TabsTrigger key={value} value={value} className={TAB_TRIGGER_CLASS}>
              {t(`tabs.${value}`)}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="mt-6 space-y-6 outline-none">
          {/* WT-692: growth first — revenue, active accounts and workspaces, user growth — from the
              same Insights endpoints /admin reads. Credit consumption follows as the secondary
              view it is. */}
          <BillingGrowthOverview />

          <div className="pt-2">
            <h2 className="text-[13px] font-semibold">{t("growth.usageHeading")}</h2>
            <p className="mt-0.5 text-[12px] text-ink-muted">{t("growth.usageNote")}</p>
          </div>
          <section className="grid gap-4 md:grid-cols-4">
            <AdminMetric
              icon={Coins}
              label={t("metrics.totalIssuedCredits.label")}
              value={metrics ? metrics.totalBalance.toLocaleString() : "..."}
              detail={t("metrics.totalIssuedCredits.detail")}
            />
            <AdminMetric
              icon={ChartLineUp}
              label={t("metrics.activeWorkspaces.label")}
              value={metrics ? `${metrics.activeWorkspaces}` : "..."}
              detail={t("metrics.activeWorkspaces.detail")}
              isStatus
            />
            <AdminMetric
              icon={FileText}
              label={t("metrics.monthlyConsumption.label")}
              value={metrics ? metrics.monthlyUsage.toLocaleString() : "..."}
              detail={t("metrics.monthlyConsumption.detail")}
            />
            <AdminMetric
              icon={Eye}
              label={t("metrics.transactions30d.label")}
              value={
              metrics ? metrics.auditEventsLast30Days.toLocaleString() : "..."
              }
              detail={t("metrics.transactions30d.detail")}
            />
          </section>

          <section className="grid gap-4 md:grid-cols-3">
            <div className="md:col-span-2">
              <UsageChart />
            </div>
            <div>
              <FeatureBreakdownChart />
            </div>
          </section>

          <section>
            <TopWorkspacesChart />
          </section>
        </TabsContent>

        <TabsContent value="ledger" className="mt-2 outline-none">
          <LedgerTab metrics={metrics} exportOpen={isExportOpen} onExportOpenChange={setIsExportOpen} basePath={basePath} />
        </TabsContent>

        <TabsContent value="invoices" className="mt-2 outline-none">
          <AdminInvoicesTab />
        </TabsContent>

        <TabsContent value="subscriptions" className="mt-6 outline-none">
          <AdminSubscriptionsTab />
        </TabsContent>

        <TabsContent value="alerts" className="mt-2 outline-none">
          <AdminAlertsTab />
        </TabsContent>
      </Tabs>
    </AdminPage>
  );
}

function LedgerTab({
  metrics,
  exportOpen,
  onExportOpenChange,
  basePath,
}: {
  metrics: GlobalBillingMetricsDto | undefined;
  exportOpen: boolean;
  onExportOpenChange: (open: boolean) => void;
  basePath: string;
}) {
  const t = useTranslations("adminBillingLedger");
  const list = useAdminListState(LEDGER_LIST_CONFIG);
  const { state } = list;

  const [exportNote, setExportNote] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [selectedTxGroup, setSelectedTxGroup] = useState<GroupedCreditTransaction | null>(null);

  const type = enumValue(state.filters, "type");
  const dateRange = dateRangeValue(state.filters, "date");
  const date = dateRangeBounds(dateRange ?? {});
  const workspaceId = entityValues(state.filters, "workspace")[0];
  const amount = numberRangeValue(state.filters, "amount");

  const filters = useMemo<CreditHistoryFilters>(
    () => ({
      type,
      fromDate: date.from,
      // This endpoint compares `created_at <= toDate`, so it takes the last instant of the day.
      toDate: date.toInclusive,
      workspaceId,
      minAmount: creditBound(amount?.min, "min"),
      maxAmount: creditBound(amount?.max, "max"),
      search: state.search || undefined,
      sort: ledgerApiSort(state.sort.field, state.sort.direction),
    }),
    [type, date.from, date.toInclusive, workspaceId, amount?.min, amount?.max, state.search, state.sort.field, state.sort.direction],
  );

  const historyQuery = useQuery({
    queryKey: ["global-billing-history", state.page, filters],
    queryFn: () => billingService.getGlobalCreditHistory(state.page, LEDGER_PAGE_SIZE, filters),
    placeholderData: (previous) => previous,
  });

  const logs = useMemo(() => historyQuery.data?.items ?? [], [historyQuery.data?.items]);
  const totalCount = historyQuery.data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / LEDGER_PAGE_SIZE));

  const groupSessions = state.sort.field === "created";
  const displayedLogs = useMemo(
    () =>
      groupSessions
        ? groupConsecutiveTransactions(logs)
        : logs.map((tx) => ({ ...tx, originalTx: [tx], isGrouped: false })),
    [groupSessions, logs],
  );

  // The export reads every row the filters match (not the page on screen), fetched when the
  // dialog opens so the totals it previews are the totals it writes.
  const exportQuery = useQuery({
    queryKey: ["global-billing-history", "export", filters],
    queryFn: () => fetchLedgerForExport(filters),
    enabled: exportOpen,
    staleTime: 30_000,
  });
  const exportRows = useMemo(() => exportQuery.data?.rows ?? [], [exportQuery.data?.rows]);
  const exportTotal = exportQuery.data?.total ?? totalCount;
  const exportTotals = useMemo(() => {
    const sum = (kind: CreditTransactionDto["type"]) =>
      exportRows.filter((tx) => tx.type === kind).reduce((total, tx) => total + tx.amount, 0);
    return { topUp: sum("top_up"), consumed: sum("consume"), adjusted: sum("adjustment") };
  }, [exportRows]);

  const typeLabels: Record<(typeof LEDGER_TYPES)[number], string> = {
    top_up: t("ledger.filters.topUp"),
    consume: t("ledger.filters.consumption"),
    adjustment: t("ledger.filters.adjustment"),
  };

  const filterFields: AdminFilterField[] = [
    {
      key: "type",
      label: t("ledger.filters.typeLabel"),
      icon: <Tag size={13} />,
      kind: "enum",
      options: LEDGER_TYPES.map((value) => ({ value, label: typeLabels[value] })),
    },
    { key: "date", label: t("lists.ledger.filters.date"), icon: <CalendarBlank size={13} />, kind: "dateRange" },
    {
      key: "workspace",
      label: t("ledger.table.workspace"),
      icon: <Buildings size={13} />,
      kind: "entity",
      placeholder: t("lists.workspacePlaceholder"),
      search: searchAdminWorkspaces,
      resolve: resolveAdminWorkspaces,
    },
    {
      key: "amount",
      label: t("ledger.table.amount"),
      icon: <Coins size={13} />,
      kind: "numberRange",
      unit: t("lists.creditsUnit"),
      step: 1,
      presets: [
        { label: t("lists.ledger.amountPresets.over1k"), min: 1_000 },
        { label: t("lists.ledger.amountPresets.over10k"), min: 10_000 },
        { label: t("lists.ledger.amountPresets.over100k"), min: 100_000 },
      ],
    },
  ];

  const columns: AdminColumn<GroupedCreditTransaction>[] = [
    {
      id: "created",
      header: t("ledger.table.timestamp"),
      primary: true,
      sortField: "created",
      defaultDirection: "desc",
      className: "w-[170px] whitespace-nowrap",
      cell: (log) => (
        <span className="font-mono text-xs text-muted-foreground">
          {format(new Date(log.createdAt), "MMM d, yyyy HH:mm")}
        </span>
      ),
    },
    {
      id: "workspace",
      header: t("ledger.table.workspace"),
      cell: (log) =>
        log.workspaceId ? (
          <Link href={`${basePath}/workspace/${log.workspaceId}`} className="block hover:opacity-80 transition-opacity">
            <IdBadge id={log.workspaceId} type="workspace" name={log.workspaceName} />
          </Link>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      id: "type",
      header: t("ledger.table.type"),
      cell: (log) => (
        <Badge
          variant="secondary"
          className={`rounded-sm text-[10px] tracking-wider font-medium ${
            log.type === "top_up"
              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
              : log.type === "consume"
                ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30"
                : "bg-primary/15 text-primary border border-primary/30"
          }`}
        >
          {log.type === "top_up"
            ? t("ledger.typeBadge.topUp")
            : log.type === "consume"
              ? t("ledger.typeBadge.consume")
              : t("ledger.typeBadge.adjustment")}
        </Badge>
      ),
    },
    {
      id: "reason",
      header: t("ledger.table.reason"),
      cell: (log) => (
        <span className="text-sm text-muted-foreground italic">
          {log.isGrouped || log.referenceType === "MeetingRoom"
            ? t("ledger.meetingSession")
            : log.description || t("ledger.systemAutomatic")}
        </span>
      ),
    },
    {
      id: "amount",
      header: t("ledger.table.amount"),
      align: "right",
      sortField: "amount",
      defaultDirection: "desc",
      className: "w-[120px]",
      cell: (log) => (
        <span className={`text-sm font-medium ${log.amount > 0 ? "text-semantic-success" : "text-ink"}`}>
          {log.amount > 0 ? "+" : ""}
          {log.amount.toLocaleString()}
        </span>
      ),
    },
    {
      id: "balance",
      header: t("ledger.table.balanceAfter"),
      align: "right",
      className: "w-[130px]",
      cell: (log) => (
        <span className="font-mono text-sm text-muted-foreground">{log.balanceAfter.toLocaleString()}</span>
      ),
    },
    {
      id: "action",
      header: t("ledger.table.action"),
      align: "right",
      className: "w-[90px]",
      cell: (log) =>
        log.isGrouped || log.type === "consume" ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedTxGroup(log)}
            className="text-primary hover:underline font-semibold h-7 px-2 cursor-pointer bg-transparent border-none"
          >
            {t("ledger.view")}
          </Button>
        ) : null,
    },
  ];

  const handleExport = async () => {
    if (!exportRows.length) return;
    setIsExporting(true);
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "WarpTalk Admin";

      // --- Sheet 1: Summary ---
      const summary = workbook.addWorksheet("Summary");
      summary.columns = [
        { key: "k", width: 30 },
        { key: "v", width: 25 },
      ];

      const addSummaryHeader = (text: string) => {
        const row = summary.addRow([text]);
        row.font = { bold: true, size: 13, color: { argb: "FFFFFFFF" } };
        row.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF0F172A" },
        };
        summary.mergeCells(`A${row.number}:B${row.number}`);
      };

      const addSummaryRow = (
        label: string,
        value: string | number,
        color?: string,
      ) => {
        const row = summary.addRow([label, value]);
        if (color)
          row.getCell("v").font = { bold: true, color: { argb: color } };
        row.getCell("k").font = { color: { argb: "FF64748B" } };
      };

      summary.addRow(["WarpTalk - Global Billing Summary Report"]);
      summary.getRow(1).font = { size: 16, bold: true };
      summary.mergeCells("A1:B1");
      summary.addRow([
        `Generated: ${format(new Date(), "MMM dd, yyyy HH:mm:ss")}`,
      ]);
      summary.mergeCells("A2:B2");
      summary.addRow([]);

      if (exportNote.trim()) {
        summary.addRow(["Note:", exportNote]);
        summary.getRow(summary.lastRow!.number).font = { italic: true };
        summary.addRow([]);
      }

      addSummaryHeader("📊 System Metrics");
      addSummaryRow(
        "Total Balance (All Workspaces)",
        metrics?.totalBalance?.toLocaleString() ?? "N/A",
      );
      addSummaryRow("Active Workspaces", metrics?.activeWorkspaces ?? "N/A");
      addSummaryRow(
        "Monthly Usage (Credits)",
        metrics?.monthlyUsage?.toLocaleString() ?? "N/A",
      );
      addSummaryRow(
        "Audit Events (Last 30 days)",
        metrics?.auditEventsLast30Days ?? "N/A",
      );
      summary.addRow([]);

      addSummaryHeader("💳 Filtered Transactions Summary");
      addSummaryRow(
        "Date Range",
        dateRange ? `${dateRange.from ?? "All time"} → ${dateRange.to ?? "Now"}` : "All time",
      );
      addSummaryRow("Type Filter", type ?? "ALL");
      addSummaryRow(
        "Workspace Filter",
        workspaceId
          ? exportRows.find((tx) => tx.workspaceId === workspaceId)?.workspaceName || workspaceId
          : "All workspaces",
      );
      if (amount) addSummaryRow("Amount Filter", `${amount.min ?? 0} → ${amount.max ?? "∞"} credits`);
      if (state.search) addSummaryRow("Search", state.search);
      addSummaryRow("Order", filters.sort ?? "created_desc");
      addSummaryRow("Matching Transactions", exportTotal);
      addSummaryRow("Exported Transactions", exportRows.length);
      summary.addRow([]);
      addSummaryRow(
        "Total Top-Up",
        `+${exportTotals.topUp.toLocaleString()} credits`,
        "FF16A34A",
      );
      addSummaryRow(
        "Total Consumption",
        `${exportTotals.consumed.toLocaleString()} credits`,
        "FFDC2626",
      );
      addSummaryRow(
        "Total Adjustments",
        `${exportTotals.adjusted > 0 ? "+" : ""}${exportTotals.adjusted.toLocaleString()} credits`,
        exportTotals.adjusted >= 0 ? "FF2563EB" : "FFDC2626",
      );

      // --- Sheet 2: Audit Trail ---
      const audit = workbook.addWorksheet("Audit Trail");
      audit.columns = [
        { key: "timestamp", width: 24 },
        { key: "workspace", width: 38 },
        { key: "type", width: 16 },
        { key: "description", width: 35 },
        { key: "amount", width: 16 },
        { key: "balance", width: 16 },
      ];

      const headerRow = audit.getRow(1);
      headerRow.values = [
        "Timestamp",
        "Workspace",
        "Type",
        "Reason / Description",
        "Amount (Credits)",
        "Balance After",
      ];
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
      headerRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF0F172A" },
      };
      headerRow.alignment = { vertical: "middle", horizontal: "center" };
      const border: Partial<ExcelJS.Borders> = {
        top: { style: "thin", color: { argb: "FFCBD5E1" } },
        bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
        left: { style: "thin", color: { argb: "FFCBD5E1" } },
        right: { style: "thin", color: { argb: "FFCBD5E1" } },
      };
      ["A", "B", "C", "D", "E", "F"].forEach(
        (c) => (headerRow.getCell(c).border = border),
      );

      exportRows.forEach((tx) => {
        const row = audit.addRow({
          timestamp: new Date(tx.createdAt),
          workspace: tx.workspaceName || tx.workspaceId,
          type: tx.type.replace("_", "-"),
          description: tx.description || "System automatic",
          amount: tx.amount,
          balance: tx.balanceAfter,
        });
        row.getCell("timestamp").numFmt = "yyyy-mm-dd hh:mm:ss";
        row.getCell("amount").numFmt = "#,##0";
        row.getCell("balance").numFmt = "#,##0";
        const amtCell = row.getCell("amount");
        amtCell.font = {
          bold: true,
          color: { argb: tx.amount > 0 ? "FF16A34A" : "FFDC2626" },
        };
        ["A", "B", "C", "D", "E", "F"].forEach(
          (c) => (row.getCell(c).border = border),
        );
      });

      const buf = await workbook.xlsx.writeBuffer();
      saveAs(
        new Blob([buf], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
        `WarpTalk_BillingReport_${format(new Date(), "yyyy-MM-dd")}.xlsx`,
      );
      onExportOpenChange(false);
      setExportNote("");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      <AdminListToolbar
        list={list}
        searchPlaceholder={t("lists.ledger.searchPlaceholder")}
        filters={filterFields}
        count={historyQuery.isPending ? null : totalCount}
        countLabel={t("lists.ledger.count", { count: totalCount })}
        isFetching={historyQuery.isFetching && !historyQuery.isPending}
        display={{
          sortOptions: [
            { field: "created", label: t("ledger.table.timestamp") },
            { field: "amount", label: t("ledger.table.amount") },
          ],
          columns: columns
            .filter((column) => !column.primary && column.id !== "action")
            .map((column) => ({ id: column.id, label: column.header })),
        }}
        trailing={
          <Button variant="outline" size="sm" onClick={() => onExportOpenChange(true)}>
            <Download size={14} weight="light" />
            {t("actions.exportReport")}
          </Button>
        }
      />

      <AdminPanel>
        <AdminDataTable
          list={list}
          columns={columns}
          rows={displayedLogs}
          rowKey={(log) => log.id}
          isPending={historyQuery.isPending}
          isError={historyQuery.isError}
          onRetry={() => void historyQuery.refetch()}
          empty={{
            title: t("ledger.empty"),
            description: t("lists.ledger.emptyDescription"),
            icon: <Coins size={20} weight="duotone" />,
          }}
          pagination={{ page: state.page, pageCount: totalPages, total: totalCount, pageSize: LEDGER_PAGE_SIZE }}
          caption={t("ledger.cardTitle")}
          minWidth={900}
        />
      </AdminPanel>

      {/* Export Dialog */}
      <Dialog open={exportOpen} onOpenChange={onExportOpenChange}>
        <DialogContent className="sm:max-w-[520px] bg-surface-1 border-hairline rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-medium">
              {t("export.dialogTitle")}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {t.rich("lists.export.description", {
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm" aria-busy={exportQuery.isFetching}>
              <div className="rounded-lg border border-hairline bg-surface-2 p-3">
                <p className="text-xs text-muted-foreground">{t("export.stats.transactions")}</p>
                <p className="text-lg font-semibold mt-1">
                  {exportTotal.toLocaleString()}
                </p>
              </div>
              <div className="rounded-lg border border-hairline bg-surface-2 p-3">
                <p className="text-xs text-muted-foreground">{t("export.stats.netTopUp")}</p>
                <p className="text-lg font-semibold mt-1 text-semantic-success">
                  {exportQuery.data ? `+${exportTotals.topUp.toLocaleString()}` : "…"}
                </p>
              </div>
              <div className="rounded-lg border border-hairline bg-surface-2 p-3">
                <p className="text-xs text-muted-foreground">{t("export.stats.totalConsumed")}</p>
                <p className="text-lg font-semibold mt-1 text-rose-500">
                  {exportQuery.data ? exportTotals.consumed.toLocaleString() : "…"}
                </p>
              </div>
              <div className="rounded-lg border border-hairline bg-surface-2 p-3">
                <p className="text-xs text-muted-foreground">{t("export.stats.netAdjustments")}</p>
                <p
                  className={`text-lg font-semibold mt-1 ${exportTotals.adjusted >= 0 ? "text-primary" : "text-rose-500"}`}
                >
                  {exportQuery.data
                    ? `${exportTotals.adjusted > 0 ? "+" : ""}${exportTotals.adjusted.toLocaleString()}`
                    : "…"}
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {exportQuery.isError
                ? t("lists.export.failed")
                : exportQuery.isPending
                  ? t("lists.export.loading")
                  : exportRows.length === 0
                    ? t("export.noDataAlert")
                    : exportTotal > exportRows.length
                      ? t("lists.export.truncated", { cap: LEDGER_EXPORT_CAP.toLocaleString() })
                      : t("lists.export.matching", { count: exportRows.length })}
            </p>
            <div className="space-y-2">
              <Label htmlFor="exportNoteAdmin" className="text-sm font-medium">
                {t("export.noteLabel")}
              </Label>
              <Textarea
                id="exportNoteAdmin"
                placeholder={t("export.notePlaceholder")}
                value={exportNote}
                onChange={(e) => setExportNote(e.target.value)}
                className="resize-none h-20 bg-surface-2 border-hairline"
              />
              <p className="text-xs text-muted-foreground">
                {t("export.noteHelper")}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onExportOpenChange(false)}>
              {t("export.cancel")}
            </Button>
            <Button onClick={handleExport} disabled={isExporting || !exportQuery.data || exportRows.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              {isExporting ? t("export.generating") : t("export.download")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!selectedTxGroup}
        onOpenChange={(open) => !open && setSelectedTxGroup(null)}
      >
        <DialogContent className="sm:max-w-[760px] w-[95vw] border border-hairline bg-surface-1 shadow-lg rounded-xl overflow-hidden p-0 text-ink">
          <div className="bg-gradient-to-br from-primary/10 via-canvas to-canvas px-6 pt-6 pb-4 border-b border-hairline relative">
            <h3 className="text-base font-extrabold text-ink tracking-tight flex items-center gap-2">
              <span>📊 {t("transactionDetails.title")}</span>
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              {t("transactionDetails.subtitle")}
            </p>
          </div>

          <div className="px-6 py-5 space-y-5">
            {selectedTxGroup && (
              <div className="space-y-5">
                {/* Session General Info */}
                <div className="grid grid-cols-2 gap-4 bg-surface-2 p-4 rounded-lg border border-hairline text-xs text-ink">
                  <div>
                    <span className="text-[10px] text-muted-foreground block uppercase font-mono tracking-wider">
                      {t("transactionDetails.date")}
                    </span>
                    <span className="font-bold mt-1 block text-sm">
                      {format(
                        new Date(selectedTxGroup.createdAt),
                        "MMMM dd, yyyy",
                      )}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block uppercase font-mono tracking-wider">
                      {t("transactionDetails.totalDeducted")}
                    </span>
                    <span className="text-rose-600 dark:text-rose-400 font-extrabold mt-1 block text-sm">
                      {Math.abs(selectedTxGroup.amount).toLocaleString()} cr
                    </span>
                  </div>
                </div>

                {/* Two-Column Responsive Layout */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Left Column: Service Breakdown Summary */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-ink uppercase tracking-wider">
                      {t("transactionDetails.serviceBreakdown")}
                    </h4>
                    <div className="divide-y divide-hairline border border-hairline rounded-lg bg-surface-2/40 overflow-hidden">
                      {Object.entries(
                        selectedTxGroup.originalTx.reduce(
                          (acc: Record<string, UsageGroupSummary>, item) => {
                            const type = getLabelForUsage(
                              item.referenceType || t("usageLabels.other"),
                              t,
                            );
                            const rawType = item.referenceType || "Other";
                            if (!acc[type]) {
                              acc[type] = { count: 0, cost: 0, rawType };
                            }
                            acc[type].count += 1;
                            acc[type].cost += item.amount;
                            return acc;
                          },
                          {},
                        ),
                      ).map(([service, data]) => {
                        const unitPriceVal = Math.round(
                          Math.abs(data.cost) / data.count,
                        );
                        const suffix = getUnitSuffixForUsage(data.rawType);
                        return (
                          <div
                            key={service}
                            className="flex justify-between items-center px-4 py-3.5 text-xs text-ink hover:bg-surface-2/30 transition-colors"
                          >
                            <div>
                              <span className="font-semibold block">
                                {service}
                              </span>
                              <span className="text-[10px] text-muted-foreground mt-1 block">
                                {t("transactionDetails.callsSummary", {
                                  count: data.count,
                                  unitPrice: unitPriceVal,
                                  suffix,
                                })}
                              </span>
                            </div>
                            <span className="font-extrabold text-rose-600 dark:text-rose-400">
                              {Math.abs(data.cost).toLocaleString()} cr
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Right Column: Itemized Events List */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-ink uppercase tracking-wider">
                      {t("transactionDetails.activityLogFeed")}
                    </h4>
                    <div className="h-[268px] overflow-y-auto border border-hairline rounded-lg divide-y divide-hairline text-xs bg-surface-1 text-ink font-sans p-3 space-y-0.5 select-text">
                      {selectedTxGroup.originalTx.map((item, idx) => (
                        <div
                          key={item.id || idx}
                          className="flex justify-between items-center py-2.5 px-3 rounded-md hover:bg-surface-2/60 transition-colors"
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary/70"></span>
                            <span className="text-ink font-medium flex items-center">
                              <span className="font-mono text-muted-foreground text-[10px] mr-2.5">
                                {format(new Date(item.createdAt), "HH:mm:ss")}
                              </span>
                              {getLabelForUsage(
                                item.referenceType || t("usageLabels.aiUsage"),
                                t,
                              )}
                            </span>
                          </div>
                          <span className="text-rose-600 dark:text-rose-400 font-bold ml-2 shrink-0">
                            {Math.abs(item.amount).toLocaleString()} cr
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="bg-surface-2 px-6 py-4 border-t border-hairline flex justify-end">
            <Button
              onClick={() => setSelectedTxGroup(null)}
              className="bg-primary hover:bg-primary-hover text-white cursor-pointer px-4 text-xs font-semibold rounded-md h-9"
            >
              {t("transactionDetails.close")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function getUnitSuffixForUsage(usageType: string): string {
  const t = usageType.toLowerCase();
  if (t === "translation" || t === "voice_translation") return "cr/min";
  if (t === "summary" || t === "meeting_summary") return "cr/req";
  if (t === "text_to_speech") return "cr/min";
  if (t === "voice_cloning") return "cr/min";
  return "cr";
}

function getLabelForUsage(
  usageType: string,
  t: ReturnType<typeof useTranslations>,
) {
  if (usageType === "translation" || usageType === "voice_translation")
    return t("usageLabels.translation");
  if (usageType === "summary" || usageType === "meeting_summary")
    return t("usageLabels.summary");
  if (usageType === "chat") return t("usageLabels.chat");
  return usageType;
}

function IdBadge({
  id,
  type,
  name,
}: {
  // Nullable because of what is fed in here: a credit transaction's workspaceId and userId are
  // both `Guid?` on the wire, so a user-scoped or system transaction supplies null.
  id: string | null;
  type: "workspace" | "user" | "system" | "admin";
  name?: string | null;
}) {
  const t = useTranslations("adminBillingLedger");
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!id) return;
    navigator.clipboard.writeText(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shortId = id ? id.substring(0, 8) : "";
  const displayName = name && name.trim() !== "" ? name : shortId;

  return (
    <div className="flex items-center gap-1.5 min-w-[120px]">
      <div className="p-1 rounded bg-surface-1/50 border border-border-dim border-b-border">
        {type === "workspace" && (
          <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
        )}
        {type === "user" && (
          <User className="w-3.5 h-3.5 text-muted-foreground" />
        )}
        {type === "admin" && <Shield className="w-3.5 h-3.5 text-primary" />}
        {type === "system" && <Bot className="w-3.5 h-3.5 text-blue-400" />}
      </div>
      <div
        className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-surface-1 border border-border-dim border-b-border cursor-pointer hover:bg-surface-2 hover:border-border transition-colors group relative"
        onClick={handleCopy}
        title={t("idBadge.copyTooltip", { id: id ?? "" })}
      >
        <span
          className={`text-xs font-mono font-medium ${type === "system" ? "text-blue-400" : type === "admin" ? "text-primary" : "text-foreground-muted"}`}
        >
          {displayName}
        </span>
        {copied ? (
          <Check className="w-3 h-3 text-semantic-success" />
        ) : (
          <Copy className="w-3 h-3 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </div>
    </div>
  );
}

function AdminMetric({
  icon: Icon,
  label,
  value,
  detail,
  isStatus,
}: {
  icon: typeof Coins;
  label: string;
  value: string;
  detail: string;
  isStatus?: boolean;
}) {
  return (
    <Card className="rounded-xl border border-hairline bg-surface-1 shadow-linear">
      <CardContent className="flex items-center gap-4 p-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-2 text-ink border border-hairline">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">{label}</p>
          {isStatus ? (
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-semantic-success opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-semantic-success"></span>
              </span>
              <p className="text-lg font-semibold tracking-tight">{value}</p>
            </div>
          ) : (
            <p className="text-xl font-semibold tracking-tight">{value}</p>
          )}
          <p className="text-xs text-muted-foreground mt-1">{detail}</p>
        </div>
      </CardContent>
    </Card>
  );
}
