"use client";

import { AdjustCreditModal } from "@/components/admin/AdjustCreditModal";
import { AdminAlertsTab } from "@/components/admin/AdminAlertsTab";
import { AdminInvoicesTab } from "@/components/admin/AdminInvoicesTab";
import { AdminSubscriptionsTab } from "@/components/admin/AdminSubscriptionsTab";
import { FeatureBreakdownChart } from "@/components/admin/FeatureBreakdownChart";
import { TopWorkspacesChart } from "@/components/admin/TopWorkspacesChart";
import { UsageChart } from "@/components/admin/UsageChart";
import { Badge } from "@/components/ui/badge";
import {
  AdminPage,
  AdminPageHeader,
} from "@/components/admin/admin-page-chrome";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { createHubConnection } from "@/lib/realtime/signalr";
import { billingService } from "@/services/billing.service";
import type {
  GroupedCreditTransaction,
  UsageGroupSummary,
} from "@/types/billing";
import {
  ChartLineUp,
  Coins,
  Download,
  Eye,
  FileText,
} from "@phosphor-icons/react/dist/ssr";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import type { Borders } from "exceljs";
import { saveAs } from "file-saver";
import {
  Bot,
  Building2,
  Check,
  Copy,
  Loader2,
  Search,
  Settings,
  Shield,
  User,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createExcelWorkbook } from "@/lib/export/create-excel-workbook";

export default function AdminBillingPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(() => {
    const connection = createHubConnection("/hubs/notification");

    connection.on("NewNotification", (notification) => {
      console.log("Realtime billing update:", notification);
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

  const [searchWorkspaceId, setSearchWorkspaceId] = useState("");
  const [page, setPage] = useState(1);
  const [historyTypeFilter, setHistoryTypeFilter] = useState("ALL");
  const [filterFromDate, setFilterFromDate] = useState("");
  const [filterToDate, setFilterToDate] = useState("");
  const [filterWorkspaceId, setFilterWorkspaceId] = useState("");
  const [filterMinAmount, setFilterMinAmount] = useState<number | "">("");
  const [filterMaxAmount, setFilterMaxAmount] = useState<number | "">("");
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [exportNote, setExportNote] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [selectedTxGroup, setSelectedTxGroup] =
    useState<GroupedCreditTransaction | null>(null);

  const activeFiltersCount = [
    historyTypeFilter !== "ALL",
    filterFromDate !== "",
    filterToDate !== "",
    filterWorkspaceId !== "",
    filterMinAmount !== "",
    filterMaxAmount !== "",
  ].filter(Boolean).length;

  const resetFilters = () => {
    setHistoryTypeFilter("ALL");
    setFilterFromDate("");
    setFilterToDate("");
    setFilterWorkspaceId("");
    setFilterMinAmount("");
    setFilterMaxAmount("");
    setPage(1);
  };

  const { data, isLoading } = useQuery({
    queryKey: [
      "global-billing-history",
      page,
      historyTypeFilter,
      filterFromDate,
      filterToDate,
      filterWorkspaceId,
      filterMinAmount,
      filterMaxAmount,
    ],
    queryFn: () =>
      billingService.getGlobalCreditHistory(page, 100, {
        type: historyTypeFilter === "ALL" ? undefined : historyTypeFilter,
        fromDate: filterFromDate
          ? new Date(filterFromDate + "T00:00:00").toISOString()
          : undefined,
        toDate: filterToDate
          ? new Date(filterToDate + "T23:59:59.999").toISOString()
          : undefined,
        workspaceId: filterWorkspaceId || undefined,
        minAmount: filterMinAmount !== "" ? filterMinAmount : undefined,
        maxAmount: filterMaxAmount !== "" ? filterMaxAmount : undefined,
      }),
  });

  const { data: metrics } = useQuery({
    queryKey: ["global-billing-metrics"],
    queryFn: () => billingService.getGlobalMetrics(),
  });

  const logs = useMemo(() => data?.items ?? [], [data?.items]);
  const totalCount = data?.totalCount || 0;
  const totalPages = Math.ceil(totalCount / 100);

  const displayedLogs = useMemo(() => {
    if (!logs) return [];
    const groups: GroupedCreditTransaction[] = [];
    let currentGroup: GroupedCreditTransaction | null = null;

    logs.forEach((tx) => {
      if (!currentGroup) {
        currentGroup = { ...tx, originalTx: [tx], isGrouped: false };
        return;
      }

      const isSameWorkspace = currentGroup.workspaceId === tx.workspaceId;
      const isSameReference =
        currentGroup.referenceId &&
        tx.referenceId &&
        currentGroup.referenceId === tx.referenceId;
      const isSameType = currentGroup.type === tx.type;

      if (
        isSameWorkspace &&
        isSameReference &&
        isSameType &&
        currentGroup.referenceId !== "00000000-0000-0000-0000-000000000000"
      ) {
        currentGroup.amount += tx.amount;
        currentGroup.originalTx.push(tx);
        currentGroup.isGrouped = true;
      } else {
        groups.push(currentGroup);
        currentGroup = { ...tx, originalTx: [tx], isGrouped: false };
      }
    });

    if (currentGroup) {
      groups.push(currentGroup);
    }
    return groups;
  }, [logs]);

  const totalTopUp = logs
    .filter((t) => t.type === "top_up")
    .reduce((s, t) => s + t.amount, 0);
  const totalConsumed = logs
    .filter((t) => t.type === "consume")
    .reduce((s, t) => s + t.amount, 0);
  const totalAdjusted = logs
    .filter((t) => t.type === "adjustment")
    .reduce((s, t) => s + t.amount, 0);

  const handleExport = async () => {
    if (!logs.length) {
      alert("No data to export.");
      return;
    }
    setIsExporting(true);
    try {
      const workbook = await createExcelWorkbook();
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

      addSummaryHeader("💳 This Page Transactions Summary");
      const dateRange =
        filterFromDate || filterToDate
          ? `${filterFromDate || "All time"} → ${filterToDate || "Now"}`
          : "All time";
      addSummaryRow("Date Range", dateRange);
      addSummaryRow("Type Filter", historyTypeFilter);
      addSummaryRow("Workspace Filter", filterWorkspaceId || "All workspaces");
      addSummaryRow("Total Transactions", totalCount);
      summary.addRow([]);
      addSummaryRow(
        "Total Top-Up",
        `+${totalTopUp.toLocaleString()} credits`,
        "FF16A34A",
      );
      addSummaryRow(
        "Total Consumption",
        `${totalConsumed.toLocaleString()} credits`,
        "FFDC2626",
      );
      addSummaryRow(
        "Total Adjustments",
        `${totalAdjusted > 0 ? "+" : ""}${totalAdjusted.toLocaleString()} credits`,
        totalAdjusted >= 0 ? "FF2563EB" : "FFDC2626",
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
      const border: Partial<Borders> = {
        top: { style: "thin", color: { argb: "FFCBD5E1" } },
        bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
        left: { style: "thin", color: { argb: "FFCBD5E1" } },
        right: { style: "thin", color: { argb: "FFCBD5E1" } },
      };
      ["A", "B", "C", "D", "E", "F"].forEach(
        (c) => (headerRow.getCell(c).border = border),
      );

      logs.forEach((tx) => {
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
      setIsExportOpen(false);
      setExportNote("");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <AdminPage>
        <AdminPageHeader
          eyebrow="Platform billing"
          eyebrowIcon={<Coins size={14} weight="fill" />}
          title="Billing"
          description="System-wide credits, consumption, and active workspaces."
          actions={
            <>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const term = searchWorkspaceId.trim();
              if (!term) return;

              // Check if term is a valid UUID
              const uuidRegex =
                /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
              if (uuidRegex.test(term)) {
                router.push(`/billing/workspace/${term}`);
              } else {
                try {
                  const { WorkspaceService } =
                    await import("@/services/workspace.service");
                  const result = await WorkspaceService.list(1, 1, term);
                  if (result.items && result.items.length > 0) {
                    router.push(`/billing/workspace/${result.items[0].id}`);
                  } else {
                    alert(`No workspace found matching name "${term}"`);
                  }
                } catch (err) {
                  console.error("Workspace name lookup failed:", err);
                  alert(
                    "Could not perform workspace name search. Please use a valid Workspace ID.",
                  );
                }
              }
            }}
            className="relative hidden sm:flex items-center"
          >
            <Search className="absolute left-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Jump to name or ID..."
              value={searchWorkspaceId}
              onChange={(e) => setSearchWorkspaceId(e.target.value)}
              className="pl-9 w-[220px] h-9 bg-surface-2 border-hairline focus-visible:ring-primary-focus rounded-md text-sm"
            />
          </form>
          <Button
            variant="outline"
            className="rounded-md h-9 px-4"
            onClick={() => setIsExportOpen(true)}
          >
            <Download className="mr-2 h-4 w-4" weight="light" /> Export Report
          </Button>
          <Link href="/billing/plans">
            <Button variant="outline" className="rounded-md h-9 px-4">
              <Settings className="mr-2 h-4 w-4 text-primary" /> Manage Plans
            </Button>
          </Link>
          <AdjustCreditModal />
            </>
          }
        />

      {/* Metrics */}
      <section className="mt-5 grid gap-4 md:grid-cols-4">
        <AdminMetric
          icon={Coins}
          label="Total Issued Credits"
          value={metrics ? metrics.totalBalance.toLocaleString() : "..."}
          detail="Circulating across workspaces"
        />
        <AdminMetric
          icon={ChartLineUp}
          label="Active Workspaces"
          value={metrics ? `${metrics.activeWorkspaces}` : "..."}
          detail="Workspaces using the platform"
          isStatus
        />
        <AdminMetric
          icon={FileText}
          label="Monthly Consumption"
          value={metrics ? metrics.monthlyUsage.toLocaleString() : "..."}
          detail="Total credits consumed this month"
        />
        <AdminMetric
          icon={Eye}
          label="Transactions (30d)"
          value={
            metrics ? metrics.auditEventsLast30Days.toLocaleString() : "..."
          }
          detail="Credit transactions in the last 30 days"
        />
      </section>

      <Tabs defaultValue="overview" className="w-full mt-2">
        {/* Same shape as AdminFilterTabs on the other admin pages: ink fills the selected
            tab. shadcn Tabs stays because these panels are genuinely tabbed content, not a
            filter over one list — but it should not look like a fourth control style. */}
        <TabsList className="h-auto gap-1 rounded-none border-b border-border bg-transparent p-0 py-3">
          <TabsTrigger
            value="overview"
            className="h-7 rounded-md px-3 text-[11px] font-medium text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink data-[state=active]:bg-ink data-[state=active]:text-surface-1 data-[state=active]:shadow-none"
          >
            Economics & Analytics
          </TabsTrigger>
          <TabsTrigger
            value="ledger"
            className="h-7 rounded-md px-3 text-[11px] font-medium text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink data-[state=active]:bg-ink data-[state=active]:text-surface-1 data-[state=active]:shadow-none"
          >
            Global Transactions
          </TabsTrigger>
          <TabsTrigger
            value="invoices"
            className="h-7 rounded-md px-3 text-[11px] font-medium text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink data-[state=active]:bg-ink data-[state=active]:text-surface-1 data-[state=active]:shadow-none"
          >
            Invoices
          </TabsTrigger>
          <TabsTrigger
            value="subscriptions"
            className="h-7 rounded-md px-3 text-[11px] font-medium text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink data-[state=active]:bg-ink data-[state=active]:text-surface-1 data-[state=active]:shadow-none"
          >
            Subscriptions
          </TabsTrigger>
          <TabsTrigger
            value="alerts"
            className="h-7 rounded-md px-3 text-[11px] font-medium text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink data-[state=active]:bg-ink data-[state=active]:text-surface-1 data-[state=active]:shadow-none"
          >
            Fraud Alerts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6 space-y-6 outline-none">
          {/* Charts */}
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

        <TabsContent value="ledger" className="mt-6 outline-none">
          <Card className="rounded-xl border border-hairline bg-surface-1 shadow-linear overflow-hidden flex flex-col h-[600px]">
            <CardHeader className="p-4 border-b border-hairline bg-surface-1/50 flex-none">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                  <CardTitle className="text-lg">Global Transactions</CardTitle>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 mt-4 pt-4 border-t border-hairline">
                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground">Type</Label>
                  <Select
                    value={historyTypeFilter}
                    onValueChange={(val) => {
                      setHistoryTypeFilter(val || "ALL");
                      setPage(1);
                    }}
                  >
                    <SelectTrigger className="w-[140px] h-8 text-sm">
                      <SelectValue placeholder="All types" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Types</SelectItem>
                      <SelectItem value="top_up">Top Up</SelectItem>
                      <SelectItem value="consume">Consumption</SelectItem>
                      <SelectItem value="adjustment">Adjustment</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground">
                    From date
                  </Label>
                  <Input
                    type="date"
                    className="h-8 text-sm w-[140px]"
                    value={filterFromDate}
                    onChange={(e) => {
                      setFilterFromDate(e.target.value);
                      setPage(1);
                    }}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground">
                    To date
                  </Label>
                  <Input
                    type="date"
                    className="h-8 text-sm w-[140px]"
                    value={filterToDate}
                    onChange={(e) => {
                      setFilterToDate(e.target.value);
                      setPage(1);
                    }}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground">
                    Workspace ID
                  </Label>
                  <Input
                    type="text"
                    placeholder="Enter ID..."
                    className="h-8 text-sm w-[140px]"
                    value={filterWorkspaceId}
                    onChange={(e) => {
                      setFilterWorkspaceId(e.target.value);
                      setPage(1);
                    }}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground">
                    Min amount (cr)
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    placeholder="e.g. 10"
                    className="h-8 text-sm w-[110px]"
                    value={filterMinAmount}
                    onChange={(e) => {
                      setFilterMinAmount(
                        e.target.value ? Number(e.target.value) : "",
                      );
                      setPage(1);
                    }}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground">
                    Max amount (cr)
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    placeholder="e.g. 1000"
                    className="h-8 text-sm w-[110px]"
                    value={filterMaxAmount}
                    onChange={(e) => {
                      setFilterMaxAmount(
                        e.target.value ? Number(e.target.value) : "",
                      );
                      setPage(1);
                    }}
                  />
                </div>

                {activeFiltersCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs text-muted-foreground gap-1.5 self-end"
                    onClick={resetFilters}
                  >
                    <span>Clear</span>
                    <Badge className="h-4 px-1 text-[10px] font-semibold rounded-full">
                      {activeFiltersCount}
                    </Badge>
                  </Button>
                )}
              </div>
            </CardHeader>

            <CardContent className="p-0 flex-1 overflow-auto">
              <Table>
                <TableHeader className="bg-surface-2 sticky top-0 z-10">
                  <TableRow className="border-hairline hover:bg-transparent">
                    <TableHead className="w-[180px]">Timestamp</TableHead>
                    <TableHead>Workspace</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Balance After</TableHead>
                    <TableHead className="text-right pr-4">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center">
                        <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ) : displayedLogs.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="h-24 text-center text-muted-foreground"
                      >
                        No transactions found
                      </TableCell>
                    </TableRow>
                  ) : (
                    displayedLogs.map((log) => {
                      // The billing service emits only consume/top_up/adjustment; there is no reserve or
                      // refund transaction type, so this was always false.
                      const isSystemLog = false;
                      const isRaw = false;
                      const isPositive = log.amount > 0;
                      const sign = isPositive ? "+" : "";
                      const isGrouped = !isRaw && log.isGrouped;

                      return (
                        <TableRow
                          key={log.id}
                          className={`border-hairline hover:bg-surface-2 ${isSystemLog && !isRaw ? "bg-surface-2/50 text-muted-foreground" : ""}`}
                        >
                          <TableCell
                            className={`font-mono text-xs whitespace-nowrap ${!isRaw && "text-muted-foreground"}`}
                          >
                            {isRaw
                              ? format(
                                  new Date(log.createdAt),
                                  "yyyy-MM-dd HH:mm:ss.SSS",
                                )
                              : format(
                                  new Date(log.createdAt),
                                  "MMM d, yyyy HH:mm",
                                )}
                          </TableCell>
                          <TableCell>
                            {isRaw ? (
                              <div className="font-mono text-xs">
                                {log.workspaceId}
                              </div>
                            ) : (
                              <Link
                                href={`/billing/workspace/${log.workspaceId}`}
                                className="block hover:opacity-80 transition-opacity"
                              >
                                <IdBadge
                                  id={log.workspaceId}
                                  type="workspace"
                                  name={log.workspaceName}
                                />
                              </Link>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="secondary"
                              className={`rounded-sm text-[10px] tracking-wider font-medium ${
                                isRaw
                                  ? "bg-surface-3 text-ink uppercase"
                                  : log.type === "top_up"
                                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                                    : log.type === "consume"
                                      ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30"
                                      : log.type === "adjustment"
                                        ? "bg-primary/15 text-primary border border-primary/30"
                                          : "bg-surface-2 text-ink border-hairline"
                              }`}
                            >
                              {isRaw
                                ? log.type.replace("_", "-")
                                : log.type
                                    .split("_")
                                    .map(
                                      (word: string) =>
                                        word.charAt(0).toUpperCase() +
                                        word.slice(1).toLowerCase(),
                                    )
                                    .join("-")}
                            </Badge>
                          </TableCell>
                          <TableCell
                            className={`text-sm ${!isRaw && "text-muted-foreground italic"}`}
                          >
                            {isGrouped || log.referenceType === "MeetingRoom"
                              ? "Meeting Session"
                              : log.description ||
                                (isRaw ? "N/A" : "System automatic")}
                          </TableCell>
                          <TableCell
                            className={`text-right text-sm font-medium ${isPositive ? "text-semantic-success" : isRaw ? "text-muted-foreground" : "text-ink"}`}
                          >
                            {sign}
                            {isRaw ? log.amount : log.amount.toLocaleString()}
                          </TableCell>
                          <TableCell
                            className={`text-right font-mono text-sm ${!isRaw && "text-muted-foreground"}`}
                          >
                            {isRaw
                              ? log.balanceAfter
                              : log.balanceAfter.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right pr-4">
                            {(isGrouped || log.type === "consume") && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  setSelectedTxGroup(
                                    isGrouped
                                      ? log
                                      : { ...log, originalTx: [log] },
                                  )
                                }
                                className="text-primary hover:underline font-semibold h-7 px-2 cursor-pointer bg-transparent border-none"
                              >
                                View
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>

            {/* Pagination */}
            <div className="p-4 border-t border-hairline flex items-center justify-between bg-surface-1">
              <p className="text-xs text-muted-foreground">
                {data ? (
                  <>
                    Showing <strong>1–{displayedLogs.length}</strong> of{" "}
                    <strong>{displayedLogs.length}</strong> grouped sessions
                    (from <strong>{logs.length}</strong> transactions)
                  </>
                ) : (
                  "Loading..."
                )}
              </p>
              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 w-7 p-0 rounded-md"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    ‹
                  </Button>

                  {(() => {
                    const pages: (number | "...")[] = [];
                    const delta = 2;
                    for (let i = 1; i <= totalPages; i++) {
                      if (
                        i === 1 ||
                        i === totalPages ||
                        (i >= page - delta && i <= page + delta)
                      ) {
                        pages.push(i);
                      } else if (pages[pages.length - 1] !== "...") {
                        pages.push("...");
                      }
                    }
                    return pages.map((p, i) =>
                      p === "..." ? (
                        <span
                          key={`ellipsis-${i}`}
                          className="h-7 w-7 flex items-center justify-center text-xs text-muted-foreground"
                        >
                          …
                        </span>
                      ) : (
                        <Button
                          key={p}
                          variant={p === page ? "default" : "outline"}
                          size="sm"
                          className="h-7 w-7 p-0 rounded-md text-xs"
                          onClick={() => setPage(p as number)}
                        >
                          {p}
                        </Button>
                      ),
                    );
                  })()}

                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 w-7 p-0 rounded-md"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    ›
                  </Button>
                </div>
              )}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="invoices" className="mt-6 outline-none">
          <AdminInvoicesTab />
        </TabsContent>

        <TabsContent value="subscriptions" className="mt-6 outline-none">
          <AdminSubscriptionsTab />
        </TabsContent>

        <TabsContent value="alerts" className="mt-6 outline-none">
          <AdminAlertsTab />
        </TabsContent>
      </Tabs>

      {/* Export Dialog */}
      <Dialog open={isExportOpen} onOpenChange={setIsExportOpen}>
        <DialogContent className="sm:max-w-[520px] bg-surface-1 border-hairline rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-medium">
              Export Billing Report
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Exports a 2-sheet Excel file: <strong>Summary</strong> (system
              metrics + totals) and <strong>Audit Trail</strong> (all
              transactions on this page with active filters).
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border border-hairline bg-surface-2 p-3">
                <p className="text-xs text-muted-foreground">Transactions</p>
                <p className="text-lg font-semibold mt-1">
                  {totalCount.toLocaleString()}
                </p>
              </div>
              <div className="rounded-lg border border-hairline bg-surface-2 p-3">
                <p className="text-xs text-muted-foreground">Net Top-Up</p>
                <p className="text-lg font-semibold mt-1 text-semantic-success">
                  +{totalTopUp.toLocaleString()}
                </p>
              </div>
              <div className="rounded-lg border border-hairline bg-surface-2 p-3">
                <p className="text-xs text-muted-foreground">Total Consumed</p>
                <p className="text-lg font-semibold mt-1 text-rose-500">
                  {totalConsumed.toLocaleString()}
                </p>
              </div>
              <div className="rounded-lg border border-hairline bg-surface-2 p-3">
                <p className="text-xs text-muted-foreground">Net Adjustments</p>
                <p
                  className={`text-lg font-semibold mt-1 ${totalAdjusted >= 0 ? "text-primary" : "text-rose-500"}`}
                >
                  {totalAdjusted > 0 ? "+" : ""}
                  {totalAdjusted.toLocaleString()}
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="exportNoteAdmin" className="text-sm font-medium">
                Add a note (optional)
              </Label>
              <Textarea
                id="exportNoteAdmin"
                placeholder="e.g. Q2 2026 billing review for board meeting..."
                value={exportNote}
                onChange={(e) => setExportNote(e.target.value)}
                className="resize-none h-20 bg-surface-2 border-hairline"
              />
              <p className="text-xs text-muted-foreground">
                This note will be printed at the top of the Summary sheet.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsExportOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleExport} disabled={isExporting}>
              <Download className="mr-2 h-4 w-4" />
              {isExporting ? "Generating..." : "Download Excel"}
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
              <span>📊 Transaction Details</span>
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Breakdown of variable AI service spend for this session
            </p>
          </div>

          <div className="px-6 py-5 space-y-5">
            {selectedTxGroup && (
              <div className="space-y-5">
                {/* Session General Info */}
                <div className="grid grid-cols-2 gap-4 bg-surface-2 p-4 rounded-lg border border-hairline text-xs text-ink">
                  <div>
                    <span className="text-[10px] text-muted-foreground block uppercase font-mono tracking-wider">
                      Date
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
                      Total Deducted
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
                      Service Breakdown
                    </h4>
                    <div className="divide-y divide-hairline border border-hairline rounded-lg bg-surface-2/40 overflow-hidden">
                      {Object.entries(
                        selectedTxGroup.originalTx.reduce(
                          (acc: Record<string, UsageGroupSummary>, item) => {
                            const type = getLabelForUsage(
                              item.referenceType || "Other",
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
                                {data.count}{" "}
                                {data.count === 1 ? "call" : "calls"} ×{" "}
                                {unitPriceVal} {suffix}
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
                      Activity Log Feed
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
                                item.referenceType || "AI usage",
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
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AdminPage>
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

function getLabelForUsage(usageType: string) {
  if (usageType === "translation" || usageType === "voice_translation")
    return "Real-time Translation";
  if (usageType === "summary" || usageType === "meeting_summary")
    return "AI meeting insights";
  if (usageType === "chat") return "AI workspace chat";
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
        title={`Click to copy ID: ${id}`}
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
