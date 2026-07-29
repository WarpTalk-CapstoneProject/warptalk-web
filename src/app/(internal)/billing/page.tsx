"use client";

import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Coins, ChartLineUp, Download } from "@phosphor-icons/react/dist/ssr";
import { Building2, User, Bot, Check, Copy, Loader2, MoreHorizontal, Search, Shield, Settings, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { UsageChart } from "@/components/admin/UsageChart";
import { FeatureBreakdownChart } from "@/components/admin/FeatureBreakdownChart";
import { TopWorkspacesChart } from "@/components/admin/TopWorkspacesChart";
import { AdminInvoicesTab } from "@/components/admin/AdminInvoicesTab";
import { AdminSubscriptionsTab } from "@/components/admin/AdminSubscriptionsTab";
import { AdminAlertsTab } from "@/components/admin/AdminAlertsTab";
import { AdminSalesInquiriesTab } from "@/components/admin/AdminSalesInquiriesTab";
import { CreateWorkspaceContractModal } from "@/components/admin/CreateWorkspaceContractModal";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { billingService } from "@/services/billing.service";
import type { CreditTransactionDto } from "@/types/billing";

type CreditTransactionGroup = CreditTransactionDto & {
  originalTx: CreditTransactionDto[];
  isGrouped: boolean;
};

type ServiceBreakdown = {
  count: number;
  cost: number;
  rawType: string;
};

export default function AdminBillingPage() {
  const router = useRouter();

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
  const [selectedTxGroup, setSelectedTxGroup] = useState<CreditTransactionGroup | null>(null);
  const [isCreateWorkspaceOpen, setIsCreateWorkspaceOpen] = useState(false);

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
    queryKey: ["global-billing-history", page, historyTypeFilter, filterFromDate, filterToDate, filterWorkspaceId, filterMinAmount, filterMaxAmount],
    queryFn: () => billingService.getGlobalCreditHistory(page, 100, {
      type: historyTypeFilter === "ALL" ? undefined : historyTypeFilter,
      fromDate: filterFromDate ? new Date(filterFromDate + "T00:00:00").toISOString() : undefined,
      toDate: filterToDate ? new Date(filterToDate + "T23:59:59.999").toISOString() : undefined,
      workspaceId: filterWorkspaceId || undefined,
      minAmount: filterMinAmount !== "" ? filterMinAmount : undefined,
      maxAmount: filterMaxAmount !== "" ? filterMaxAmount : undefined,
    }),
  });

  const { data: metrics } = useQuery({
    queryKey: ["global-billing-metrics"],
    queryFn: () => billingService.getGlobalMetrics(),
  });

  const logs = data?.items || [];
  const totalCount = data?.totalCount || 0;
  const totalPages = Math.ceil(totalCount / 100);
  
  const displayedLogs = useMemo(() => {
    if (!logs) return [];
    const groups: CreditTransactionGroup[] = [];
    let currentGroup: CreditTransactionGroup | null = null;

    logs.forEach(tx => {
      if (!currentGroup) {
        currentGroup = { ...tx, originalTx: [tx], isGrouped: false };
        return;
      }

      const isSameWorkspace = currentGroup.workspaceId === tx.workspaceId;
      const isSameReference = currentGroup.referenceId && tx.referenceId && currentGroup.referenceId === tx.referenceId;
      const isSameType = currentGroup.type === tx.type;

      if (isSameWorkspace && isSameReference && isSameType && currentGroup.referenceId !== "00000000-0000-0000-0000-000000000000") {
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

  const totalTopUp = logs.filter(t => t.type === "top_up").reduce((s, t) => s + t.amount, 0);
  const totalConsumed = logs.filter(t => t.type === "consumption").reduce((s, t) => s + t.amount, 0);
  const totalAdjusted = logs.filter(t => t.type === "adjustment").reduce((s, t) => s + t.amount, 0);

  const buildHistoryFilters = () => ({
    type: historyTypeFilter === "ALL" ? undefined : historyTypeFilter,
    fromDate: filterFromDate ? new Date(filterFromDate + "T00:00:00").toISOString() : undefined,
    toDate: filterToDate ? new Date(filterToDate + "T23:59:59.999").toISOString() : undefined,
    workspaceId: filterWorkspaceId || undefined,
    minAmount: filterMinAmount !== "" ? filterMinAmount : undefined,
    maxAmount: filterMaxAmount !== "" ? filterMaxAmount : undefined,
  });

  const fetchAllFilteredHistory = async () => {
    const pageSize = 200;
    const filters = buildHistoryFilters();
    const firstPage = await billingService.getGlobalCreditHistory(1, pageSize, filters);
    const allItems = [...(firstPage.items ?? [])];
    const expectedTotal = firstPage.totalCount ?? allItems.length;
    const pageCount = Math.ceil(expectedTotal / pageSize);

    for (let pageNumber = 2; pageNumber <= pageCount; pageNumber++) {
      const nextPage = await billingService.getGlobalCreditHistory(pageNumber, pageSize, filters);
      allItems.push(...(nextPage.items ?? []));
    }

    return {
      totalCount: expectedTotal,
      items: allItems,
    };
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const exportHistory = await fetchAllFilteredHistory();
      const exportLogs = exportHistory.items ?? [];
      const exportTotalTopUp = exportLogs.filter(t => t.type === "top_up").reduce((s, t) => s + t.amount, 0);
      const exportTotalConsumed = exportLogs.filter(t => t.type === "consumption").reduce((s, t) => s + t.amount, 0);
      const exportTotalAdjusted = exportLogs.filter(t => t.type === "adjustment").reduce((s, t) => s + t.amount, 0);

      const workbook = new ExcelJS.Workbook();
      workbook.creator = "WarpTalk Admin";

      // --- Sheet 1: Summary ---
      const summary = workbook.addWorksheet("Summary");
      summary.columns = [{ key: "k", width: 30 }, { key: "v", width: 25 }];

      const addSummaryHeader = (text: string) => {
        const row = summary.addRow([text]);
        row.font = { bold: true, size: 13, color: { argb: "FFFFFFFF" } };
        row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
        summary.mergeCells(`A${row.number}:B${row.number}`);
      };

      const addSummaryRow = (label: string, value: string | number, color?: string) => {
        const row = summary.addRow([label, value]);
        if (color) row.getCell("v").font = { bold: true, color: { argb: color } };
        row.getCell("k").font = { color: { argb: "FF64748B" } };
      };

      summary.addRow(["WarpTalk - Contract Billing Report"]);
      summary.getRow(1).font = { size: 16, bold: true };
      summary.mergeCells("A1:B1");
      summary.addRow([`Generated: ${format(new Date(), "MMM dd, yyyy HH:mm:ss")}`]);
      summary.mergeCells("A2:B2");
      summary.addRow([]);

      if (exportNote.trim()) {
        summary.addRow(["Note:", exportNote]);
        summary.getRow(summary.lastRow!.number).font = { italic: true };
        summary.addRow([]);
      }

      addSummaryHeader("📊 System Metrics");
      addSummaryRow("Total Available Contract Balance", metrics?.totalBalance?.toLocaleString() ?? "N/A");
      addSummaryRow("Active Contract Workspaces", metrics?.activeWorkspaces ?? "N/A");
      addSummaryRow("Billable Usage This Month", metrics?.monthlyUsage?.toLocaleString() ?? "N/A");
      addSummaryRow("Audit Events (Last 30 days)", metrics?.auditEventsLast30Days ?? "N/A");
      summary.addRow([]);

      addSummaryHeader("Filtered Billing Events Summary");
      const dateRange = (filterFromDate || filterToDate)
        ? `${filterFromDate || "All time"} to ${filterToDate || "Now"}`
        : "All time";
      addSummaryRow("Date Range", dateRange);
      addSummaryRow("Billing Event Filter", historyTypeFilter);
      addSummaryRow("Workspace Filter", filterWorkspaceId || "All workspaces");
      addSummaryRow("Matching Billing Events", exportHistory.totalCount ?? exportLogs.length);
      summary.addRow([]);
      addSummaryRow("Manual Credits Added", `+${exportTotalTopUp.toLocaleString()} credits`, "FF16A34A");
      addSummaryRow("Billable Usage Consumed", `${exportTotalConsumed.toLocaleString()} credits`, "FFDC2626");
      addSummaryRow("Total Adjustments", `${exportTotalAdjusted > 0 ? "+" : ""}${exportTotalAdjusted.toLocaleString()} credits`,
        exportTotalAdjusted >= 0 ? "FF2563EB" : "FFDC2626");

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
      headerRow.values = ["Timestamp", "Workspace", "Type", "Reason / Description", "Amount (Credits)", "Balance After"];
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
      headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
      headerRow.alignment = { vertical: "middle", horizontal: "center" };
      const border: Partial<ExcelJS.Borders> = {
        top: { style: "thin", color: { argb: "FFCBD5E1" } },
        bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
        left: { style: "thin", color: { argb: "FFCBD5E1" } },
        right: { style: "thin", color: { argb: "FFCBD5E1" } },
      };
      ["A", "B", "C", "D", "E", "F"].forEach(c => headerRow.getCell(c).border = border);

      exportLogs.forEach(tx => {
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
        amtCell.font = { bold: true, color: { argb: tx.amount > 0 ? "FF16A34A" : "FFDC2626" } };
        ["A", "B", "C", "D", "E", "F"].forEach(c => row.getCell(c).border = border);
      });

      if (!exportLogs.length) {
        const emptyRow = audit.addRow({
          timestamp: "",
          workspace: "No billing events matched the active filters.",
          type: "",
          description: "Contract portfolio metrics are still included in the Summary sheet.",
          amount: "",
          balance: "",
        });
        ["A", "B", "C", "D", "E", "F"].forEach(c => emptyRow.getCell(c).border = border);
      }

      const buf = await workbook.xlsx.writeBuffer();
      saveAs(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
        `WarpTalk_ContractBillingReport_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
      setIsExportOpen(false);
      setExportNote("");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex min-h-full flex-col gap-4 pb-6">
      {/* Header */}
      <div className="grid gap-4 bg-surface-1 p-5 rounded-xl border border-hairline shadow-linear xl:grid-cols-[minmax(0,1fr)_520px] xl:items-center">
        <div className="min-w-0">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl font-bold tracking-tight text-ink">Company Contracts</h1>
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[10px] font-bold uppercase tracking-wider">Admin</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Manage Enterprise workspace contracts, trial status, invoices, extra usage, and billing alerts.
            </p>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const term = searchWorkspaceId.trim();
                if (!term) return;

                // Check if term is a valid UUID
                const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                if (uuidRegex.test(term)) {
                  router.push(`/billing/workspace/${term}`);
                } else {
                  try {
                    const { WorkspaceService } = await import("@/services/workspace.service");
                    const result = await WorkspaceService.list(1, 1, term);
                    if (result.items && result.items.length > 0) {
                      router.push(`/billing/workspace/${result.items[0].id}`);
                    } else {
                      alert(`No workspace found matching name "${term}"`);
                    }
                  } catch (err) {
                    console.error("Workspace name lookup failed:", err);
                    alert("Could not perform workspace name search. Please use a valid Workspace ID.");
                  }
                }
              }}
              className="relative flex items-center"
            >
              <Search className="absolute left-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Find company or workspace..."
                value={searchWorkspaceId}
                onChange={(e) => setSearchWorkspaceId(e.target.value)}
                className="pl-9 w-[280px] h-9 bg-surface-2 border-hairline focus-visible:ring-primary-focus rounded-md text-sm"
              />
            </form>
            <Button className="rounded-md h-9 px-4 gap-1.5" onClick={() => setIsCreateWorkspaceOpen(true)}>
              <Plus className="h-4 w-4" /> New Workspace Contract
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-hairline bg-surface-2 px-3 text-sm font-medium text-foreground transition hover:bg-surface-3 focus:outline-none focus:ring-2 focus:ring-primary/30">
                <MoreHorizontal className="h-4 w-4" />
                More
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56 p-1">
                <DropdownMenuItem className="cursor-pointer gap-2 px-2 py-2" onClick={() => setIsExportOpen(true)}>
                  <Download className="h-4 w-4" weight="light" />
                  Export report
                </DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer gap-2 px-2 py-2" onClick={() => router.push("/billing/plans")}>
                  <Settings className="h-4 w-4 text-primary" />
                  Enterprise baseline
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <section className="grid gap-3 sm:grid-cols-2">
          <AdminMetric icon={ChartLineUp} label="Active Workspaces" value={metrics ? `${metrics.activeWorkspaces}` : "..."} detail="Company workspaces in the platform" isStatus />
          <AdminMetric icon={Coins} label="Credits in Circulation" value={metrics ? metrics.totalBalance.toLocaleString() : "..."} detail="Remaining credits across active contracts" />
        </section>
      </div>

      <Tabs defaultValue="subscriptions" className="w-full">
        <TabsList className="bg-surface-2 p-1 rounded-lg">
          <TabsTrigger value="sales" className="rounded-md text-sm px-4 data-[state=active]:bg-surface-1 data-[state=active]:text-ink data-[state=active]:shadow-sm">Sales inquiries</TabsTrigger>
          <TabsTrigger value="subscriptions" className="rounded-md text-sm px-4 data-[state=active]:bg-surface-1 data-[state=active]:text-ink data-[state=active]:shadow-sm">Contracts</TabsTrigger>
          <TabsTrigger value="alerts" className="rounded-md text-sm px-4 data-[state=active]:bg-surface-1 data-[state=active]:text-ink data-[state=active]:shadow-sm">Review Queue</TabsTrigger>
          <TabsTrigger value="invoices" className="rounded-md text-sm px-4 data-[state=active]:bg-surface-1 data-[state=active]:text-ink data-[state=active]:shadow-sm">Invoices</TabsTrigger>
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
              <Select value={historyTypeFilter} onValueChange={(val) => { setHistoryTypeFilter(val || "ALL"); setPage(1); }}>
                <SelectTrigger className="w-[140px] h-8 text-sm">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Types</SelectItem>
                  <SelectItem value="top_up">Top Up</SelectItem>
                  <SelectItem value="consumption">Consumption</SelectItem>
                  <SelectItem value="adjustment">Adjustment</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">From date</Label>
              <Input type="date" className="h-8 text-sm w-[140px]" value={filterFromDate}
                onChange={(e) => { setFilterFromDate(e.target.value); setPage(1); }} />
            </div>

            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">To date</Label>
              <Input type="date" className="h-8 text-sm w-[140px]" value={filterToDate}
                onChange={(e) => { setFilterToDate(e.target.value); setPage(1); }} />
            </div>

            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Workspace ID</Label>
              <Input type="text" placeholder="Enter ID..." className="h-8 text-sm w-[140px]"
                value={filterWorkspaceId}
                onChange={(e) => { setFilterWorkspaceId(e.target.value); setPage(1); }} />
            </div>

            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Min amount (cr)</Label>
              <Input type="number" min={0} placeholder="e.g. 10" className="h-8 text-sm w-[110px]"
                value={filterMinAmount}
                onChange={(e) => { setFilterMinAmount(e.target.value ? Number(e.target.value) : ""); setPage(1); }} />
            </div>

            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Max amount (cr)</Label>
              <Input type="number" min={0} placeholder="e.g. 1000" className="h-8 text-sm w-[110px]"
                value={filterMaxAmount}
                onChange={(e) => { setFilterMaxAmount(e.target.value ? Number(e.target.value) : ""); setPage(1); }} />
            </div>

            {activeFiltersCount > 0 && (
              <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground gap-1.5 self-end" onClick={resetFilters}>
                <span>Clear</span>
                <Badge className="h-4 px-1 text-[10px] font-semibold rounded-full">{activeFiltersCount}</Badge>
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
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    No transactions found
                  </TableCell>
                </TableRow>
              ) : displayedLogs.map((log) => {
                const isSystemLog = log.type === "reserve" || log.type === "refund";
                const isRaw = false;
                const isPositive = log.amount > 0;
                const sign = isPositive ? "+" : "";
                const isGrouped = !isRaw && log.isGrouped;

                return (
                  <TableRow key={log.id} className={`border-hairline hover:bg-surface-2 ${isSystemLog && !isRaw ? "bg-surface-2/50 text-muted-foreground" : ""}`}>
                    <TableCell className={`font-mono text-xs whitespace-nowrap ${!isRaw && "text-muted-foreground"}`}>
                      {isRaw ? format(new Date(log.createdAt), "yyyy-MM-dd HH:mm:ss.SSS") : format(new Date(log.createdAt), "MMM d, yyyy HH:mm")}
                    </TableCell>
                    <TableCell>
                      {isRaw ? (
                        <div className="font-mono text-xs">{log.workspaceId}</div>
                      ) : (
                        <Link href={`/billing/workspace/${log.workspaceId}`} className="block hover:opacity-80 transition-opacity">
                          <IdBadge id={log.workspaceId} type="workspace" name={log.workspaceName} />
                        </Link>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={`rounded-sm text-[10px] tracking-wider font-medium ${
                        isRaw ? "bg-surface-3 text-ink uppercase" :
                        log.type === "top_up"      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30" :
                        log.type === "consumption" ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30" :
                        log.type === "adjustment"  ? "bg-primary/15 text-primary border border-primary/30" :
                        log.type === "reserve"     ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30" :
                        "bg-surface-2 text-ink border-hairline"
                      }`}>
                        {isRaw ? log.type.replace("_", "-") : log.type.split("_").map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join("-")}
                      </Badge>
                    </TableCell>
                    <TableCell className={`text-sm ${!isRaw && "text-muted-foreground italic"}`}>
                      {isGrouped || log.referenceType === "MeetingRoom" ? "Meeting Session" : (log.description || (isRaw ? "N/A" : "System automatic"))}
                    </TableCell>
                    <TableCell className={`text-right text-sm font-medium ${isPositive ? "text-semantic-success" : isRaw ? "text-muted-foreground" : "text-ink"}`}>
                      {sign}{isRaw ? log.amount : log.amount.toLocaleString()}
                    </TableCell>
                    <TableCell className={`text-right font-mono text-sm ${!isRaw && "text-muted-foreground"}`}>
                      {isRaw ? log.balanceAfter : log.balanceAfter.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right pr-4">
                      {(isGrouped || log.type === "consumption") && (
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => setSelectedTxGroup(isGrouped ? log : { ...log, originalTx: [log] })}
                          className="text-primary hover:underline font-semibold h-7 px-2 cursor-pointer bg-transparent border-none"
                        >
                          View
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>

        {/* Pagination */}
        <div className="p-4 border-t border-hairline flex items-center justify-between bg-surface-1">
          <p className="text-xs text-muted-foreground">
            {data ? (
              <>Showing <strong>1–{displayedLogs.length}</strong> of <strong>{displayedLogs.length}</strong> grouped sessions (from <strong>{logs.length}</strong> transactions)</>
            ) : "Loading..."}
          </p>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="h-7 w-7 p-0 rounded-md"
                disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>‹</Button>

              {(() => {
                const pages: (number | "...")[] = [];
                const delta = 2;
                for (let i = 1; i <= totalPages; i++) {
                  if (i === 1 || i === totalPages || (i >= page - delta && i <= page + delta)) {
                    pages.push(i);
                  } else if (pages[pages.length - 1] !== "...") {
                    pages.push("...");
                  }
                }
                return pages.map((p, i) =>
                  p === "..." ? (
                    <span key={`ellipsis-${i}`} className="h-7 w-7 flex items-center justify-center text-xs text-muted-foreground">…</span>
                  ) : (
                    <Button key={p} variant={p === page ? "default" : "outline"} size="sm"
                      className="h-7 w-7 p-0 rounded-md text-xs" onClick={() => setPage(p as number)}>{p}</Button>
                  )
                );
              })()}

              <Button variant="outline" size="sm" className="h-7 w-7 p-0 rounded-md"
                disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>›</Button>
            </div>
          )}
        </div>
      </Card>
        </TabsContent>

        <TabsContent value="invoices" className="mt-6 outline-none">
          <AdminInvoicesTab />
        </TabsContent>

        <TabsContent value="sales" className="mt-6 outline-none">
          <AdminSalesInquiriesTab />
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
            <DialogTitle className="text-lg font-medium">Export Contract Billing Report</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Exports a 2-sheet Excel file: <strong>Summary</strong> (live contract portfolio metrics and filtered billing-event totals) and <strong>Audit Trail</strong> (billing events in the active filters).
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border border-hairline bg-surface-2 p-3">
                <p className="text-xs text-muted-foreground">Active Contracts</p>
                <p className="text-lg font-semibold mt-1">{(metrics?.activeWorkspaces ?? 0).toLocaleString()}</p>
              </div>
              <div className="rounded-lg border border-hairline bg-surface-2 p-3">
                <p className="text-xs text-muted-foreground">Contract Balance</p>
                <p className="text-lg font-semibold mt-1">{(metrics?.totalBalance ?? 0).toLocaleString()}</p>
              </div>
              <div className="rounded-lg border border-hairline bg-surface-2 p-3">
                <p className="text-xs text-muted-foreground">Usage This Month</p>
                <p className="text-lg font-semibold mt-1 text-rose-500">{(metrics?.monthlyUsage ?? 0).toLocaleString()}</p>
              </div>
              <div className="rounded-lg border border-hairline bg-surface-2 p-3">
                <p className="text-xs text-muted-foreground">Audit Events 30d</p>
                <p className="text-lg font-semibold mt-1">{(metrics?.auditEventsLast30Days ?? 0).toLocaleString()}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border border-hairline bg-surface-2 p-3">
                <p className="text-xs text-muted-foreground">Filtered Events</p>
                <p className="text-lg font-semibold mt-1">{totalCount.toLocaleString()}</p>
              </div>
              <div className="rounded-lg border border-hairline bg-surface-2 p-3">
                <p className="text-xs text-muted-foreground">Manual Credits Added</p>
                <p className="text-lg font-semibold mt-1 text-semantic-success">+{totalTopUp.toLocaleString()}</p>
              </div>
              <div className="rounded-lg border border-hairline bg-surface-2 p-3">
                <p className="text-xs text-muted-foreground">Billable Usage</p>
                <p className="text-lg font-semibold mt-1 text-rose-500">{totalConsumed.toLocaleString()}</p>
              </div>
              <div className="rounded-lg border border-hairline bg-surface-2 p-3">
                <p className="text-xs text-muted-foreground">Invoice Adjustments</p>
                <p className={`text-lg font-semibold mt-1 ${totalAdjusted >= 0 ? "text-primary" : "text-rose-500"}`}>
                  {totalAdjusted > 0 ? "+" : ""}{totalAdjusted.toLocaleString()}
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="exportNoteAdmin" className="text-sm font-medium">Add a note (optional)</Label>
              <Textarea
                id="exportNoteAdmin"
                placeholder="e.g. Q2 2026 contract true-up and invoice review..."
                value={exportNote}
                onChange={(e) => setExportNote(e.target.value)}
                className="resize-none h-20 bg-surface-2 border-hairline"
              />
              <p className="text-xs text-muted-foreground">This note will appear at the top of the Summary sheet for finance or account review.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsExportOpen(false)}>Cancel</Button>
            <Button onClick={handleExport} disabled={isExporting}>
              <Download className="mr-2 h-4 w-4" />
              {isExporting ? "Generating..." : "Download Excel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedTxGroup} onOpenChange={(open) => !open && setSelectedTxGroup(null)}>
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
                    <span className="text-[10px] text-muted-foreground block uppercase font-mono tracking-wider">Date</span>
                    <span className="font-bold mt-1 block text-sm">{format(new Date(selectedTxGroup.createdAt), "MMMM dd, yyyy")}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block uppercase font-mono tracking-wider">Total Deducted</span>
                    <span className="text-rose-600 dark:text-rose-400 font-extrabold mt-1 block text-sm">{Math.abs(selectedTxGroup.amount).toLocaleString()} cr</span>
                  </div>
                </div>

                {/* Two-Column Responsive Layout */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Left Column: Service Breakdown Summary */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-ink uppercase tracking-wider">Service Breakdown</h4>
                    <div className="divide-y divide-hairline border border-hairline rounded-lg bg-surface-2/40 overflow-hidden">
                      {Object.entries(
                        selectedTxGroup.originalTx.reduce<Record<string, ServiceBreakdown>>((acc, item) => {
                          const type = getLabelForUsage(item.referenceType || "Other");
                          const rawType = item.referenceType || "Other";
                          if (!acc[type]) {
                            acc[type] = { count: 0, cost: 0, rawType };
                          }
                          acc[type].count += 1;
                          acc[type].cost += item.amount;
                          return acc;
                        }, {})
                      ).map(([service, data]) => {
                        const unitPriceVal = Math.round(Math.abs(data.cost) / data.count);
                        const suffix = getUnitSuffixForUsage(data.rawType);
                        return (
                          <div key={service} className="flex justify-between items-center px-4 py-3.5 text-xs text-ink hover:bg-surface-2/30 transition-colors">
                            <div>
                              <span className="font-semibold block">{service}</span>
                              <span className="text-[10px] text-muted-foreground mt-1 block">
                                {data.count} {data.count === 1 ? 'call' : 'calls'} × {unitPriceVal} {suffix}
                              </span>
                            </div>
                            <span className="font-extrabold text-rose-600 dark:text-rose-400">{Math.abs(data.cost).toLocaleString()} cr</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Right Column: Itemized Events List */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-ink uppercase tracking-wider">Activity Log Feed</h4>
                    <div className="h-[268px] overflow-y-auto border border-hairline rounded-lg divide-y divide-hairline text-xs bg-surface-1 text-ink font-sans p-3 space-y-0.5 select-text">
                      {selectedTxGroup.originalTx.map((item, idx) => (
                        <div key={item.id || idx} className="flex justify-between items-center py-2.5 px-3 rounded-md hover:bg-surface-2/60 transition-colors">
                          <div className="flex items-center gap-2.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary/70"></span>
                            <span className="text-ink font-medium flex items-center">
                              <span className="font-mono text-muted-foreground text-[10px] mr-2.5">{format(new Date(item.createdAt), "HH:mm:ss")}</span>
                              {getLabelForUsage(item.referenceType || "AI usage")}
                            </span>
                          </div>
                          <span className="text-rose-600 dark:text-rose-400 font-bold ml-2 shrink-0">{Math.abs(item.amount).toLocaleString()} cr</span>
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

      <CreateWorkspaceContractModal open={isCreateWorkspaceOpen} onOpenChange={setIsCreateWorkspaceOpen} />
    </div>
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
  if (usageType === "translation" || usageType === "voice_translation") return "Real-time Translation";
  if (usageType === "summary" || usageType === "meeting_summary") return "AI meeting insights";
  if (usageType === "chat") return "AI workspace chat";
  return usageType;
}

function IdBadge({ id, type, name }: { id: string, type: "workspace" | "user" | "system" | "admin", name?: string | null }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shortId = id.substring(0, 8);
  const displayName = name && name.trim() !== "" ? name : shortId;

  return (
    <div className="flex items-center gap-1.5 min-w-[120px]">
      <div className="p-1 rounded bg-surface-1/50 border border-border-dim border-b-border">
        {type === "workspace" && <Building2 className="w-3.5 h-3.5 text-muted-foreground" />}
        {type === "user" && <User className="w-3.5 h-3.5 text-muted-foreground" />}
        {type === "admin" && <Shield className="w-3.5 h-3.5 text-primary" />}
        {type === "system" && <Bot className="w-3.5 h-3.5 text-blue-400" />}
      </div>
      <div
        className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-surface-1 border border-border-dim border-b-border cursor-pointer hover:bg-surface-2 hover:border-border transition-colors group relative"
        onClick={handleCopy}
        title={`Click to copy ID: ${id}`}
      >
        <span className={`text-xs font-mono font-medium ${type === "system" ? "text-blue-400" : type === "admin" ? "text-primary" : "text-foreground-muted"}`}>
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

function AdminMetric({ icon: Icon, label, value, detail, isStatus }: { icon: typeof Coins; label: string; value: string; detail: string; isStatus?: boolean }) {
  return (
    <Card className="rounded-lg border border-hairline bg-surface-2/70 shadow-none">
      <CardContent className="flex items-center gap-3 p-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface-1 text-ink border border-hairline">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">{label}</p>
          {isStatus ? (
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-semantic-success opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-semantic-success"></span>
              </span>
              <p className="text-lg font-semibold tracking-tight">{value}</p>
            </div>
          ) : (
            <p className="truncate text-lg font-semibold tracking-tight">{value}</p>
          )}
          <p className="line-clamp-2 text-xs text-muted-foreground">{detail}</p>
        </div>
      </CardContent>
    </Card>
  );
}
