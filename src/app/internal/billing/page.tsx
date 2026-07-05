"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Coins, Eye, EyeSlash, FileText, ChartLineUp, Download } from "@phosphor-icons/react/dist/ssr";
import { Building2, User, Bot, Check, Copy, Loader2, Search, Shield, Settings } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { AdjustCreditModal } from "@/components/admin/AdjustCreditModal";
import { billingService } from "@/services/billing.service";
import { UsageChart } from "@/components/admin/UsageChart";
import { FeatureBreakdownChart } from "@/components/admin/FeatureBreakdownChart";
import { TopWorkspacesChart } from "@/components/admin/TopWorkspacesChart";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";

export default function AdminBillingPage() {
  const router = useRouter();
  const [searchWorkspaceId, setSearchWorkspaceId] = useState("");
  const [rawLogsEnabled, setRawLogsEnabled] = useState(false);
  const [page, setPage] = useState(1);
  const [historyTypeFilter, setHistoryTypeFilter] = useState("ALL");
  const [filterFromDate, setFilterFromDate] = useState("");
  const [filterToDate, setFilterToDate] = useState("");
  const [filterWorkspaceId, setFilterWorkspaceId] = useState("");
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [exportNote, setExportNote] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  const activeFiltersCount = [
    historyTypeFilter !== "ALL",
    filterFromDate !== "",
    filterToDate !== "",
    filterWorkspaceId !== "",
  ].filter(Boolean).length;

  const resetFilters = () => {
    setHistoryTypeFilter("ALL");
    setFilterFromDate("");
    setFilterToDate("");
    setFilterWorkspaceId("");
    setPage(1);
  };

  const { data, isLoading } = useQuery({
    queryKey: ["global-billing-history", page, historyTypeFilter, filterFromDate, filterToDate, filterWorkspaceId],
    queryFn: () => billingService.getGlobalCreditHistory(page, 20, {
      type: historyTypeFilter === "ALL" ? undefined : historyTypeFilter,
      fromDate: filterFromDate ? new Date(filterFromDate + "T00:00:00").toISOString() : undefined,
      toDate: filterToDate ? new Date(filterToDate + "T23:59:59.999").toISOString() : undefined,
      workspaceId: filterWorkspaceId || undefined,
    }),
  });

  const { data: metrics } = useQuery({
    queryKey: ["global-billing-metrics"],
    queryFn: () => billingService.getGlobalMetrics(),
  });

  const logs = data?.items || [];
  const totalCount = data?.totalCount || 0;
  const totalPages = Math.ceil(totalCount / 20);
  const displayedLogs = rawLogsEnabled ? logs : logs.filter(log => log.type !== "reserve" && log.type !== "refund");

  const totalTopUp = logs.filter(t => t.type === "top_up").reduce((s, t) => s + t.amount, 0);
  const totalConsumed = logs.filter(t => t.type === "consumption").reduce((s, t) => s + t.amount, 0);
  const totalAdjusted = logs.filter(t => t.type === "adjustment").reduce((s, t) => s + t.amount, 0);

  const handleExport = async () => {
    if (!logs.length) { alert("No data to export."); return; }
    setIsExporting(true);
    try {
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

      summary.addRow(["WarpTalk - Global Billing Summary Report"]);
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
      addSummaryRow("Total Balance (All Workspaces)", metrics?.totalBalance?.toLocaleString() ?? "N/A");
      addSummaryRow("Active Workspaces", metrics?.activeWorkspaces ?? "N/A");
      addSummaryRow("Monthly Usage (Credits)", metrics?.monthlyUsage?.toLocaleString() ?? "N/A");
      addSummaryRow("Audit Events (Last 30 days)", metrics?.auditEventsLast30Days ?? "N/A");
      summary.addRow([]);

      addSummaryHeader("💳 This Page Transactions Summary");
      const dateRange = (filterFromDate || filterToDate)
        ? `${filterFromDate || "All time"} → ${filterToDate || "Now"}`
        : "All time";
      addSummaryRow("Date Range", dateRange);
      addSummaryRow("Type Filter", historyTypeFilter);
      addSummaryRow("Workspace Filter", filterWorkspaceId || "All workspaces");
      addSummaryRow("Total Transactions", totalCount);
      summary.addRow([]);
      addSummaryRow("Total Top-Up", `+${totalTopUp.toLocaleString()} credits`, "FF16A34A");
      addSummaryRow("Total Consumption", `${totalConsumed.toLocaleString()} credits`, "FFDC2626");
      addSummaryRow("Total Adjustments", `${totalAdjusted > 0 ? "+" : ""}${totalAdjusted.toLocaleString()} credits`,
        totalAdjusted >= 0 ? "FF2563EB" : "FFDC2626");

      // --- Sheet 2: Audit Trail ---
      const audit = workbook.addWorksheet("Audit Trail");
      audit.columns = [
        { key: "timestamp", width: 24 },
        { key: "workspace", width: 38 },
        { key: "type", width: 16 },
        { key: "description", width: 35 },
        { key: "actor", width: 35 },
        { key: "amount", width: 16 },
        { key: "balance", width: 16 },
      ];

      const headerRow = audit.getRow(1);
      headerRow.values = ["Timestamp", "Workspace", "Type", "Reason / Description", "Actor", "Amount (Credits)", "Balance After"];
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
      headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
      headerRow.alignment = { vertical: "middle", horizontal: "center" };
      const border: Partial<ExcelJS.Borders> = {
        top: { style: "thin", color: { argb: "FFCBD5E1" } },
        bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
        left: { style: "thin", color: { argb: "FFCBD5E1" } },
        right: { style: "thin", color: { argb: "FFCBD5E1" } },
      };
      ["A", "B", "C", "D", "E", "F", "G"].forEach(c => headerRow.getCell(c).border = border);

      logs.forEach(tx => {
        const row = audit.addRow({
          timestamp: new Date(tx.createdAt),
          workspace: tx.workspaceName || tx.workspaceId,
          type: tx.type.replace("_", "-"),
          description: tx.description || "System automatic",
          actor: tx.userName || tx.userId,
          amount: tx.amount,
          balance: tx.balanceAfter,
        });
        row.getCell("timestamp").numFmt = "yyyy-mm-dd hh:mm:ss";
        row.getCell("amount").numFmt = "#,##0";
        row.getCell("balance").numFmt = "#,##0";
        const amtCell = row.getCell("amount");
        amtCell.font = { bold: true, color: { argb: tx.amount > 0 ? "FF16A34A" : "FFDC2626" } };
        ["A", "B", "C", "D", "E", "F", "G"].forEach(c => row.getCell(c).border = border);
      });

      const buf = await workbook.xlsx.writeBuffer();
      saveAs(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
        `WarpTalk_BillingReport_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
      setIsExportOpen(false);
      setExportNote("");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex min-h-full flex-col gap-6 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between bg-surface-1 p-6 rounded-xl border border-hairline shadow-linear">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Badge variant="outline" className="bg-surface-2 text-ink border-hairline">Global View</Badge>
            <h1 className="text-2xl font-semibold tracking-tight">System Billing Audit</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-2">Managing system-wide billing and payments</p>
        </div>
        <div className="flex items-center gap-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (searchWorkspaceId.trim()) {
                router.push(`/internal/billing/workspace/${searchWorkspaceId.trim()}`);
              }
            }}
            className="relative hidden sm:flex items-center"
          >
            <Search className="absolute left-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Jump to workspace ID..."
              value={searchWorkspaceId}
              onChange={(e) => setSearchWorkspaceId(e.target.value)}
              className="pl-9 w-[220px] h-9 bg-surface-2 border-hairline focus-visible:ring-primary-focus rounded-md text-sm"
            />
          </form>
          <Button variant="outline" className="rounded-md h-9 px-4" onClick={() => setIsExportOpen(true)}>
            <Download className="mr-2 h-4 w-4" weight="light" /> Export Report
          </Button>
          <Link href="/internal/billing/plans">
            <Button variant="outline" className="rounded-md h-9 px-4">
              <Settings className="mr-2 h-4 w-4 text-primary" /> Manage Plans
            </Button>
          </Link>
          <AdjustCreditModal />
        </div>
      </div>

      {/* Metrics */}
      <section className="grid gap-4 md:grid-cols-4">
        <AdminMetric icon={Coins} label="Current Balance" value={metrics ? metrics.totalBalance.toLocaleString() : "..."} detail="Total remaining credits" />
        <AdminMetric icon={ChartLineUp} label="Status" value={metrics ? `Active` : "..."} detail={`${metrics?.activeWorkspaces ?? "..."} active workspaces`} isStatus />
        <AdminMetric icon={FileText} label="Monthly Usage" value={metrics ? metrics.monthlyUsage.toLocaleString() : "..."} detail="Credits consumed this month" />
        <AdminMetric icon={Eye} label="Audit Events" value={metrics ? metrics.auditEventsLast30Days.toLocaleString() : "..."} detail="Events in last 30 days" />
      </section>

      {/* Charts */}
      <section className="grid gap-4 md:grid-cols-3">
        <div className="md:col-span-2">
          <UsageChart />
        </div>
        <FeatureBreakdownChart />
      </section>

      <TopWorkspacesChart />

      {/* Audit Trail */}
      <Card className="rounded-xl border-hairline bg-surface-1 shadow-linear flex-1 flex flex-col overflow-hidden">
        <CardHeader className="flex flex-col items-start gap-4 py-4 bg-surface-2/50 border-b border-hairline">
          <div className="flex w-full items-center justify-between">
            <div>
              <CardTitle className="text-lg font-medium">Audit Trail</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Micro-transactions and manual adjustments.</p>
            </div>
            <div className="flex items-center space-x-2 bg-surface-2 px-3 py-2 rounded-md border border-hairline">
              <Switch id="raw-logs" checked={rawLogsEnabled} onCheckedChange={setRawLogsEnabled} />
              <Label htmlFor="raw-logs" className="text-sm cursor-pointer flex items-center gap-2">
                <EyeSlash className="h-4 w-4" /> Raw Logs Mode
              </Label>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-end gap-3 w-full">
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Type</Label>
              <Select value={historyTypeFilter} onValueChange={(v) => { setHistoryTypeFilter(v || "ALL"); setPage(1); }}>
                <SelectTrigger className="h-8 text-sm w-[140px]">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All types</SelectItem>
                  <SelectItem value="top_up">Top-Up</SelectItem>
                  <SelectItem value="consumption">Consumption</SelectItem>
                  <SelectItem value="adjustment">Adjustment</SelectItem>
                  <SelectItem value="reserve">Reserve</SelectItem>
                  <SelectItem value="refund">Refund</SelectItem>
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
            <TableHeader className="bg-surface-2 sticky top-0">
              <TableRow className="border-hairline hover:bg-transparent">
                <TableHead className="w-[180px]">Timestamp</TableHead>
                <TableHead>Workspace</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Balance After</TableHead>
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
                const isRaw = rawLogsEnabled;
                const isPositive = log.amount > 0;
                const sign = isPositive ? "+" : "";

                return (
                  <TableRow key={log.id} className={`border-hairline hover:bg-surface-2 ${isSystemLog && !isRaw ? "bg-surface-2/50 text-muted-foreground" : ""}`}>
                    <TableCell className={`font-mono text-xs whitespace-nowrap ${!isRaw && "text-muted-foreground"}`}>
                      {isRaw ? format(new Date(log.createdAt), "yyyy-MM-dd HH:mm:ss.SSS") : format(new Date(log.createdAt), "MMM d, yyyy HH:mm")}
                    </TableCell>
                    <TableCell>
                      {isRaw ? (
                        <div className="font-mono text-xs">{log.workspaceId}</div>
                      ) : (
                        <Link href={`/internal/billing/workspace/${log.workspaceId}`} className="block hover:opacity-80 transition-opacity">
                          <IdBadge id={log.workspaceId} type="workspace" name={log.workspaceName || `Workspace ${log.workspaceId.substring(0, 4)}`} />
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
                      {log.description || (isRaw ? "N/A" : "System automatic")}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {isRaw ? (
                        <div className="font-mono text-xs">{log.userId}</div>
                      ) : (
                        <IdBadge id={log.userId} type={log.userId === "00000000-0000-0000-0000-000000000000" ? "system" : log.type === "adjustment" ? "admin" : "user"} name={log.userName || (log.userId === "00000000-0000-0000-0000-000000000000" ? "System" : log.type === "adjustment" ? `Admin ${log.userId.substring(0, 4)}` : `User ${log.userId.substring(0, 4)}`)} />
                      )}
                    </TableCell>
                    <TableCell className={`text-right text-sm font-medium ${isPositive ? "text-semantic-success" : isRaw ? "text-muted-foreground" : "text-ink"}`}>
                      {sign}{isRaw ? log.amount : log.amount.toLocaleString()}
                    </TableCell>
                    <TableCell className={`text-right font-mono text-sm ${!isRaw && "text-muted-foreground"}`}>
                      {isRaw ? log.balanceAfter : log.balanceAfter.toLocaleString()}
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
              <>Showing <strong>{(page - 1) * 20 + 1}–{Math.min(page * 20, totalCount)}</strong> of <strong>{totalCount}</strong> transactions</>
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

      {/* Export Dialog */}
      <Dialog open={isExportOpen} onOpenChange={setIsExportOpen}>
        <DialogContent className="sm:max-w-[520px] bg-surface-1 border-hairline rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-medium">Export Billing Report</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Exports a 2-sheet Excel file: <strong>Summary</strong> (system metrics + totals) and <strong>Audit Trail</strong> (all transactions on this page with active filters).
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border border-hairline bg-surface-2 p-3">
                <p className="text-xs text-muted-foreground">Transactions</p>
                <p className="text-lg font-semibold mt-1">{totalCount.toLocaleString()}</p>
              </div>
              <div className="rounded-lg border border-hairline bg-surface-2 p-3">
                <p className="text-xs text-muted-foreground">Net Top-Up</p>
                <p className="text-lg font-semibold mt-1 text-semantic-success">+{totalTopUp.toLocaleString()}</p>
              </div>
              <div className="rounded-lg border border-hairline bg-surface-2 p-3">
                <p className="text-xs text-muted-foreground">Total Consumed</p>
                <p className="text-lg font-semibold mt-1 text-rose-500">{totalConsumed.toLocaleString()}</p>
              </div>
              <div className="rounded-lg border border-hairline bg-surface-2 p-3">
                <p className="text-xs text-muted-foreground">Net Adjustments</p>
                <p className={`text-lg font-semibold mt-1 ${totalAdjusted >= 0 ? "text-primary" : "text-rose-500"}`}>
                  {totalAdjusted > 0 ? "+" : ""}{totalAdjusted.toLocaleString()}
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="exportNoteAdmin" className="text-sm font-medium">Add a note (optional)</Label>
              <Textarea
                id="exportNoteAdmin"
                placeholder="e.g. Q2 2026 billing review for board meeting..."
                value={exportNote}
                onChange={(e) => setExportNote(e.target.value)}
                className="resize-none h-20 bg-surface-2 border-hairline"
              />
              <p className="text-xs text-muted-foreground">This note will be printed at the top of the Summary sheet.</p>
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
    </div>
  );
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
