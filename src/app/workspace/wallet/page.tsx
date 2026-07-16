"use client";

import { Download, Robot, Coins, CreditCard, Translate, Users, Wallet, ArrowRight, ArrowUpRight, ArrowDownRight, Spinner } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useEffect, useState, useMemo } from "react";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { billingService } from "@/services/billing.service";
import type { UsageSummaryDto } from "@/types/billing";
import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { createHubConnection } from "@/lib/signalr";
import { UsageChart } from "@/components/admin/UsageChart";
import { FeatureBreakdownChart } from "@/components/admin/FeatureBreakdownChart";

const CURRENT_MONTH = new Date().getMonth() + 1;
const CURRENT_YEAR = new Date().getFullYear();

function getIconForUsage(usageType: string) {
  if (usageType.toLowerCase().includes("translation")) return Translate;
  if (usageType.toLowerCase().includes("summary")) return Robot;
  return Coins;
}

function getLabelForUsage(usageType: string) {
  if (usageType === "translation") return "Realtime translation";
  if (usageType === "summary") return "AI summaries";
  if (usageType === "chat") return "AI workspace chat";
  return usageType;
}

function getUnitSuffixForUsage(usageType: string): string {
  const t = usageType.toLowerCase();
  if (t === "translation" || t === "voice_translation") return "cr/min";
  if (t === "summary" || t === "meeting_summary") return "cr/req";
  if (t === "text_to_speech") return "cr/min";
  if (t === "voice_cloning") return "cr/min";
  return "cr";
}

export default function WorkspaceWalletPage() {
  const queryClient = useQueryClient();
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [exportNote, setExportNote] = useState("");
  const [selectedTxGroup, setSelectedTxGroup] = useState<any | null>(null);

  const { isAuthenticated, accessToken, user } = useAuthStore();
  const workspaceId = useWorkspaceStore((state) => state.activeWorkspaceId) || user?.id || "";
  const workspaceSlug = useWorkspaceStore((state) => state.activeWorkspaceSlug) || "";
  const workspaceName = useWorkspaceStore((state) => state.activeWorkspaceName) || "";

  useEffect(() => {
    if (!isAuthenticated || !accessToken) return;

    const connection = createHubConnection("/hubs/notification");

    connection.on("NewNotification", (notification) => {
      console.log("Realtime billing update:", notification);
      if (notification?.type === "billing.credits_updated") {
        queryClient.invalidateQueries({ queryKey: ["billing"] });
      }
    });

    let isMounted = true;

    connection.start().catch((err) => {
      if (!isMounted) return;
      if (err?.message?.includes("stop() was called")) return;
      // Connection failed silently - will retry via withAutomaticReconnect
    });

    return () => {
      isMounted = false;
      connection.stop();
    };
  }, [queryClient, accessToken, isAuthenticated]);

  const { data: balance, isLoading: isBalanceLoading } = useQuery({
    queryKey: ["billing", "balance", workspaceId],
    queryFn: () => billingService.getWorkspaceCredits(workspaceId),
    enabled: !!workspaceId,
    retry: 1,
  });

  const { data: report, isLoading: isReportLoading } = useQuery({
    queryKey: ["billing", "report", workspaceId, CURRENT_YEAR, CURRENT_MONTH],
    queryFn: () => billingService.getBillingReport(workspaceId, CURRENT_MONTH, CURRENT_YEAR),
    enabled: !!workspaceId,
    retry: 1,
  });

  const [historyPageNumber, setHistoryPageNumber] = useState(1);
  const [historyTypeFilter, setHistoryTypeFilter] = useState("ALL");
  const [filterFromDate, setFilterFromDate] = useState("");
  const [filterToDate, setFilterToDate] = useState("");
  const [filterMinAmount, setFilterMinAmount] = useState<number | "">("");
  const [filterMaxAmount, setFilterMaxAmount] = useState<number | "">("");

  const activeFiltersCount = [
    historyTypeFilter !== "ALL",
    filterFromDate !== "",
    filterToDate !== "",
    filterMinAmount !== "",
    filterMaxAmount !== "",
  ].filter(Boolean).length;

  const resetFilters = () => {
    setHistoryTypeFilter("ALL");
    setFilterFromDate("");
    setFilterToDate("");
    setFilterMinAmount("");
    setFilterMaxAmount("");
    setHistoryPageNumber(1);
  };

  const { data: historyPage, isLoading: isHistoryLoading } = useQuery({
    queryKey: [
      "billing", "history", workspaceId, historyPageNumber, historyTypeFilter, 
      filterFromDate, filterToDate, filterMinAmount, filterMaxAmount
    ],
    queryFn: () => billingService.getCreditHistory(workspaceId, historyPageNumber, 20, {
      type: historyTypeFilter === "ALL" ? undefined : historyTypeFilter,
      fromDate: filterFromDate ? new Date(filterFromDate + "T00:00:00").toISOString() : undefined,
      toDate: filterToDate ? new Date(filterToDate + "T23:59:59.999").toISOString() : undefined,
      minAmount: filterMinAmount !== "" ? Number(filterMinAmount) : undefined,
      maxAmount: filterMaxAmount !== "" ? Number(filterMaxAmount) : undefined,
    }),
    enabled: !!workspaceId,
    retry: 1,
  });

  const totalPages = historyPage ? Math.ceil(historyPage.totalCount / 20) : 0;

  const groupedHistoryItems = useMemo(() => {
    if (!historyPage?.items) return [];
    const groups: any[] = [];
    let currentGroup: any = null;

    historyPage.items.forEach(tx => {
      if (!currentGroup) {
        currentGroup = { ...tx, originalTx: [tx] };
        return;
      }

      // Group ONLY if they have the exact same referenceId and it is NOT null or empty
      const isSameReference = currentGroup.referenceId && tx.referenceId && currentGroup.referenceId === tx.referenceId;
      const isSameType = currentGroup.type === tx.type;

      if (isSameReference && isSameType && currentGroup.referenceId !== "00000000-0000-0000-0000-000000000000") {
        currentGroup.amount += tx.amount;
        currentGroup.originalTx.push(tx);
      } else {
        groups.push(currentGroup);
        currentGroup = { ...tx, originalTx: [tx] };
      }
    });

    if (currentGroup) {
      groups.push(currentGroup);
    }
    return groups;
  }, [historyPage?.items]);

  const currentCredits = balance?.currentCredits ?? 0;
  const creditsUsed = balance?.creditsUsedThisCycle ?? 0;
  const totalCredits = currentCredits + creditsUsed;
  const usagePercent = totalCredits > 0 ? Math.round((creditsUsed / totalCredits) * 100) : 0;
  
  const renewsDate = balance?.currentPeriodEnd ? format(new Date(balance.currentPeriodEnd), "MMM dd, yyyy") : "N/A";
  
  const usageBreakdown = report?.usageBreakdown || [];

  const totalTopUp = historyPage?.items?.filter(t => t.type === 'top_up').reduce((s, t) => s + t.amount, 0) || 0;
  const totalConsumed = historyPage?.items?.filter(t => t.type !== 'top_up').reduce((s, t) => s + t.amount, 0) || 0;
  const netChange = totalTopUp + totalConsumed;

  const handleOpenExport = () => {
    if (!historyPage?.items || historyPage.items.length === 0) {
      alert("No data to export yet.");
      return;
    }
    setExportNote("");
    setIsExportOpen(true);
  };

  const confirmExportUsage = async () => {
    if (!historyPage?.items || historyPage.items.length === 0) return;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "WarpTalk";
    const worksheet = workbook.addWorksheet("Wallet Transactions");

    worksheet.columns = [
      { key: "id", width: 38 },
      { key: "type", width: 15 },
      { key: "date", width: 22 },
      { key: "amount", width: 18 },
      { key: "balance", width: 15 }
    ];

    worksheet.addRow(["WarpTalk - Wallet Transaction Report"]);
    worksheet.getRow(1).font = { size: 16, bold: true };
    worksheet.mergeCells("A1:E1");
    
    worksheet.addRow([`Generated on: ${format(new Date(), "MMM dd, yyyy HH:mm:ss")}`]);
    worksheet.mergeCells("A2:E2");
    
    let currentRowOffset = 2;

    if (exportNote.trim()) {
      worksheet.addRow([]);
      worksheet.addRow(["Owner Note:"]);
      worksheet.getRow(4).font = { bold: true };
      worksheet.addRow([exportNote]);
      worksheet.getRow(5).font = { italic: true, color: { argb: "FF4B5563" } };
      worksheet.mergeCells("A5:E5");
      currentRowOffset = 5;
    }
    
    worksheet.addRow([]);
    currentRowOffset += 1;
    
    const headerRowIndex = currentRowOffset + 1;
    const headerRow = worksheet.getRow(headerRowIndex);
    headerRow.values = ["Transaction ID", "Type", "Date", "Amount (Credits)", "Balance After"];
    
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F172A" }
    };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };

    const borderStyle: Partial<ExcelJS.Borders> = {
      top: { style: "thin", color: { argb: "FFCBD5E1" } },
      left: { style: "thin", color: { argb: "FFCBD5E1" } },
      bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
      right: { style: "thin", color: { argb: "FFCBD5E1" } }
    };

    ["A", "B", "C", "D", "E"].forEach(col => {
      headerRow.getCell(col).border = borderStyle;
    });

    historyPage.items.forEach((tx) => {
      const row = worksheet.addRow({
        id: tx.id,
        type: tx.type === "top_up" ? "Top-Up" : "Consumption",
        date: new Date(tx.createdAt),
        amount: tx.amount,
        balance: tx.balanceAfter
      });
      
      row.getCell("date").numFmt = "yyyy-mm-dd hh:mm:ss";
      row.getCell("amount").numFmt = "#,##0";
      row.getCell("balance").numFmt = "#,##0";
      
      const amountCell = row.getCell("amount");
      if (tx.amount > 0) {
        amountCell.font = { color: { argb: "FF16A34A" }, bold: true }; 
      } else if (tx.amount < 0) {
        amountCell.font = { color: { argb: "FFDC2626" }, bold: true }; 
      }

      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        if (colNumber <= 5) cell.border = borderStyle;
      });
    });

    // Add Sum Rows
    worksheet.addRow([]);
    const summaryStartRow = worksheet.lastRow!.number + 1;
    
    const sumRow1 = worksheet.addRow(["", "", "Total Top-Up:", totalTopUp]);
    sumRow1.getCell(3).font = { bold: true };
    sumRow1.getCell(4).numFmt = "#,##0";
    sumRow1.getCell(4).font = { color: { argb: "FF16A34A" }, bold: true };
    sumRow1.getCell(3).border = borderStyle;
    sumRow1.getCell(4).border = borderStyle;

    const sumRow2 = worksheet.addRow(["", "", "Total Consumed:", totalConsumed]);
    sumRow2.getCell(3).font = { bold: true };
    sumRow2.getCell(4).numFmt = "#,##0";
    sumRow2.getCell(4).font = { color: { argb: "FFDC2626" }, bold: true };
    sumRow2.getCell(3).border = borderStyle;
    sumRow2.getCell(4).border = borderStyle;

    const sumRow3 = worksheet.addRow(["", "", "Net Change:", netChange]);
    sumRow3.getCell(3).font = { bold: true };
    sumRow3.getCell(4).numFmt = "#,##0";
    sumRow3.getCell(4).font = { bold: true, color: { argb: netChange > 0 ? "FF16A34A" : "FFDC2626" } };
    sumRow3.getCell(3).border = borderStyle;
    sumRow3.getCell(4).border = borderStyle;

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    saveAs(blob, `WarpTalk_Wallet_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
    setIsExportOpen(false);
  };

  return (
    <div className="flex min-h-full flex-col gap-6 pb-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Workspace Wallet</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your credit balance, view history, and monitor AI usage.</p>
        </div>
        <div className="flex items-center gap-3">

          <Button variant="outline" className="rounded-md h-9 px-4" onClick={handleOpenExport}>
            <Download className="mr-2 h-4 w-4" weight="light" /> Export usage
          </Button>
          <Link href="/workspace/payment/plans">
            <Button className="rounded-md h-9 px-4 bg-primary hover:bg-primary-hover text-primary-foreground shadow-sm">
              <Wallet className="mr-2 h-4 w-4" /> Top up credits
            </Button>
          </Link>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-1 max-w-sm">
        <BillingMetric 
          icon={Coins} 
          label="AI credits remaining" 
          value={isBalanceLoading ? "..." : currentCredits.toLocaleString()} 
          detail={isBalanceLoading ? "Loading..." : `${creditsUsed.toLocaleString()} of ${totalCredits.toLocaleString()} used. Renews ${renewsDate}`} 
          dark 
        />
      </section>

      <Tabs defaultValue="overview" className="w-full mt-2">
        <TabsList className="bg-surface-2 p-1 rounded-lg">
          <TabsTrigger value="overview" className="rounded-md text-sm px-4 data-[state=active]:bg-surface-1 data-[state=active]:text-ink data-[state=active]:shadow-sm">Overview & Usage</TabsTrigger>
          <TabsTrigger value="history" className="rounded-md text-sm px-4 data-[state=active]:bg-surface-1 data-[state=active]:text-ink data-[state=active]:shadow-sm">Transaction History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6 space-y-6 outline-none">
          <section className="flex flex-col gap-4">
            <UsageChart workspaceId={workspaceId} />
            <div className="grid gap-4 md:grid-cols-2">
              <FeatureBreakdownChart workspaceId={workspaceId} />
            </div>
          </section>
          
          <section className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <Card className="rounded-xl border-hairline bg-surface-1 shadow-linear">
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-base font-medium">Cost by AI service</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">Usage before the fixed Enterprise platform fee.</p>
                </div>
                <Badge variant="outline" className="rounded-md">{format(new Date(), "MMMM yyyy")}</Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                {isReportLoading ? (
                  <p className="text-sm text-muted-foreground py-4">Loading usage data...</p>
                ) : usageBreakdown.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">No usage data for this month.</p>
                ) : (
                  usageBreakdown.map((usage: UsageSummaryDto) => {
                    const Icon = getIconForUsage(usage.usageType);
                    const name = getLabelForUsage(usage.usageType);
                    const percent = report?.totalConsumedCredits ? Math.round((usage.totalCreditsConsumed / report.totalConsumedCredits) * 100) : 0;
                    
                    return (
                      <div key={usage.usageType} className="rounded-lg border border-hairline-tertiary bg-surface-2 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-canvas text-ink border border-hairline"><Icon className="h-4 w-4" /></span>
                            <div><p className="text-sm font-medium">{name}</p><p className="text-xs text-muted-foreground">{percent}% of variable AI spend</p></div>
                          </div>
                          <p className="text-lg font-medium">{usage.totalCreditsConsumed.toLocaleString()} cr</p>
                        </div>
                        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-3">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
                        </div>
                      </div>
                    );
                  })
                )}
                
                <div className="grid gap-3 sm:grid-cols-2 mt-2">
                  <div className="rounded-lg border border-hairline bg-surface-2 p-4">
                    <p className="text-xs text-muted-foreground">Average translation cost</p>
                    <p className="text-lg font-medium mt-1">
                      {report?.averageTranslationCostPerMinute !== undefined && report?.averageTranslationCostPerMinute !== null ? `${report.averageTranslationCostPerMinute} cr / minute` : '--'}
                    </p>
                  </div>
                  <div className="rounded-lg border border-hairline bg-surface-2 p-4">
                    <p className="text-xs text-muted-foreground">Average cost per meeting</p>
                    <p className="text-lg font-medium mt-1">
                      {report?.averageCostPerMeeting !== undefined && report?.averageCostPerMeeting !== null ? `${report.averageCostPerMeeting} cr` : '--'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-xl border-hairline bg-surface-1 shadow-linear">
              <CardHeader><CardTitle className="text-base font-medium">Credit allocation</CardTitle></CardHeader>
              <CardContent className="space-y-6">
                <div className="relative mx-auto flex h-40 w-40 items-center justify-center rounded-full" style={{ background: `conic-gradient(#5e6ad2 0 ${usagePercent}%, var(--color-surface-3) ${usagePercent}% 100%)` }}>
                  <div className="flex h-32 w-32 flex-col items-center justify-center rounded-full bg-surface-1">
                    <p className="text-2xl font-semibold">{usagePercent}%</p><p className="text-xs text-muted-foreground">used</p>
                  </div>
                </div>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between items-center"><span className="text-muted-foreground">Monthly allowance</span><strong className="font-medium">{totalCredits.toLocaleString()}</strong></div>
                  <div className="flex justify-between items-center"><span className="text-muted-foreground">Consumed</span><strong className="font-medium">{creditsUsed.toLocaleString()}</strong></div>
                  <div className="flex justify-between items-center"><span className="text-muted-foreground">Remaining</span><strong className="font-medium text-primary">{currentCredits.toLocaleString()}</strong></div>
                </div>
              </CardContent>
            </Card>
          </section>
        </TabsContent>

        <TabsContent value="history" className="mt-6 outline-none">
          <Card className="rounded-xl border-hairline bg-surface-1 shadow-linear">
              <CardHeader className="flex flex-col items-start gap-4 pb-4">
                <div className="flex w-full items-center justify-between">
                  <CardTitle className="text-base font-medium">Transaction History</CardTitle>
                </div>
                
                {/* Advanced Filters */}
                <div className="space-y-3 w-full">
                  <div className="flex flex-wrap items-end gap-3">
                    {/* Type */}
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs text-muted-foreground">Type</Label>
                      <Select value={historyTypeFilter} onValueChange={(v) => { setHistoryTypeFilter(v || "ALL"); setHistoryPageNumber(1); }}>
                        <SelectTrigger className="h-8 text-sm w-[140px]">
                          <SelectValue placeholder="All types">
                            {historyTypeFilter === "ALL" && "All types"}
                            {historyTypeFilter === "top_up" && "Top-Up"}
                            {historyTypeFilter === "consumption" && "Consumption"}
                            {historyTypeFilter === "reserve" && "Reserve"}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ALL">All types</SelectItem>
                          <SelectItem value="top_up">Top-Up</SelectItem>
                          <SelectItem value="consumption">Consumption</SelectItem>
                          <SelectItem value="reserve">Reserve</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Date range */}
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs text-muted-foreground">From date</Label>
                      <Input type="date" className="h-8 text-sm w-[140px]" value={filterFromDate}
                        onChange={(e) => { setFilterFromDate(e.target.value); setHistoryPageNumber(1); }} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs text-muted-foreground">To date</Label>
                      <Input type="date" className="h-8 text-sm w-[140px]" value={filterToDate}
                        onChange={(e) => { setFilterToDate(e.target.value); setHistoryPageNumber(1); }} />
                    </div>

                    {/* Amount range */}
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs text-muted-foreground">Min amount (cr)</Label>
                      <Input type="number" min={0} placeholder="e.g. 10" className="h-8 text-sm w-[110px]"
                        value={filterMinAmount}
                        onChange={(e) => { setFilterMinAmount(e.target.value ? Number(e.target.value) : ""); setHistoryPageNumber(1); }} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs text-muted-foreground">Max amount (cr)</Label>
                      <Input type="number" min={0} placeholder="e.g. 1000" className="h-8 text-sm w-[110px]"
                        value={filterMaxAmount}
                        onChange={(e) => { setFilterMaxAmount(e.target.value ? Number(e.target.value) : ""); setHistoryPageNumber(1); }} />
                    </div>

                    {/* Reset button */}
                    {activeFiltersCount > 0 && (
                      <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground gap-1.5 self-end" onClick={resetFilters}>
                        <span>Clear</span>
                        <Badge className="h-4 px-1 text-[10px] font-semibold rounded-full">{activeFiltersCount}</Badge>
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
            <CardContent>
              <div className="rounded-md border border-hairline overflow-hidden">
                <Table>
                  <TableHeader className="bg-surface-2">
                    <TableRow className="border-hairline hover:bg-transparent">
                      <TableHead className="w-[80px]">No.</TableHead>
                      <TableHead>Workspace</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Balance After</TableHead>
                      <TableHead className="text-right pr-5">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isHistoryLoading ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">Loading history...</TableCell>
                      </TableRow>
                    ) : !groupedHistoryItems.length ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">No transactions found.</TableCell>
                      </TableRow>
                    ) : (
                      groupedHistoryItems.map((tx, index) => {
                        const isPositive = tx.amount > 0;
                        const sign = isPositive ? "+" : "";
                        const isGrouped = tx.originalTx && tx.originalTx.length > 1;
                        const rowIndex = (historyPageNumber - 1) * 20 + index + 1;
                        
                        return (
                          <TableRow key={tx.id} className="border-hairline hover:bg-surface-2">
                            <TableCell className="font-mono text-sm text-muted-foreground">
                              {rowIndex}
                            </TableCell>
                            <TableCell className="text-sm font-semibold capitalize">
                              {tx.workspaceName || workspaceName || workspaceSlug}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {tx.type === "reserve"
                                  ? <Spinner className="h-4 w-4 text-amber-500 animate-spin" />
                                  : tx.amount > 0
                                  ? <ArrowUpRight className="h-4 w-4 text-emerald-500" />
                                  : <ArrowDownRight className="h-4 w-4 text-rose-500" />}
                                <span className="capitalize">{tx.type.replace('_', '-')}</span>
                                {isGrouped && (
                                  <Badge variant="outline" className="text-[10px] font-normal font-mono ml-2">
                                    {tx.originalTx.length} items
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">{format(new Date(tx.createdAt), "MMM dd, yyyy HH:mm")}</TableCell>
                            <TableCell className={`text-right text-sm font-medium ${isPositive ? 'text-semantic-success' : 'text-ink'}`}>
                              {sign}{tx.amount} cr
                            </TableCell>
                            <TableCell className="text-right text-sm">{tx.balanceAfter} cr</TableCell>
                            <TableCell className="text-right pr-5">
                              {(isGrouped || tx.type === "consumption") && (
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => setSelectedTxGroup(isGrouped ? tx : { ...tx, originalTx: [tx] })}
                                  className="text-primary hover:underline font-semibold h-7 px-2 cursor-pointer bg-transparent border-none"
                                >
                                  View Details
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
              {/* Pagination */}
              <div className="flex items-center justify-between mt-4">
                <p className="text-xs text-muted-foreground">
                  {historyPage ? (
                    <>Showing <strong>{(historyPageNumber - 1) * 20 + 1}–{Math.min(historyPageNumber * 20, historyPage.totalCount)}</strong> of <strong>{historyPage.totalCount}</strong> transactions</>
                  ) : "Loading..."}
                </p>
                {totalPages > 1 && (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline" size="sm" className="h-7 w-7 p-0 rounded-md"
                      disabled={historyPageNumber <= 1}
                      onClick={() => setHistoryPageNumber(p => Math.max(1, p - 1))}
                    >‹</Button>

                    {/* Page number buttons */}
                    {(() => {
                      const pages: (number | "...")[] = [];
                      const delta = 2;
                      for (let i = 1; i <= totalPages; i++) {
                        if (i === 1 || i === totalPages || (i >= historyPageNumber - delta && i <= historyPageNumber + delta)) {
                          pages.push(i);
                        } else if (pages[pages.length - 1] !== "...") {
                          pages.push("...");
                        }
                      }
                      return pages.map((p, i) =>
                        p === "..." ? (
                          <span key={`ellipsis-${i}`} className="h-7 w-7 flex items-center justify-center text-xs text-muted-foreground">…</span>
                        ) : (
                          <Button
                            key={p}
                            variant={p === historyPageNumber ? "default" : "outline"}
                            size="sm"
                            className={`h-7 w-7 p-0 rounded-md text-xs ${p === historyPageNumber ? "" : ""}`}
                            onClick={() => setHistoryPageNumber(p as number)}
                          >{p}</Button>
                        )
                      );
                    })()}

                    <Button
                      variant="outline" size="sm" className="h-7 w-7 p-0 rounded-md"
                      disabled={historyPageNumber >= totalPages}
                      onClick={() => setHistoryPageNumber(p => Math.min(totalPages, p + 1))}
                    >›</Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      {/* Export Preview Dialog */}
      <Dialog open={isExportOpen} onOpenChange={setIsExportOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Export Usage Preview</DialogTitle>
            <DialogDescription>
              Review your transaction summary before generating the Excel file.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="rounded-md border p-4 bg-muted/20">
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium text-muted-foreground">Transactions Found:</span>
                <span className="text-sm font-semibold">{historyPage?.items?.length || 0}</span>
              </div>
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium text-muted-foreground">Total Top-Ups:</span>
                <span className="text-sm font-semibold text-green-600">+{totalTopUp.toLocaleString()}</span>
              </div>
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium text-muted-foreground">Total Consumed:</span>
                <span className="text-sm font-semibold text-red-600">{totalConsumed.toLocaleString()}</span>
              </div>
              <div className="pt-2 mt-2 border-t flex justify-between">
                <span className="text-sm font-bold">Net Balance Change:</span>
                <span className={`text-sm font-bold ${netChange > 0 ? 'text-green-600' : (netChange < 0 ? 'text-red-600' : '')}`}>
                  {netChange > 0 ? '+' : ''}{netChange.toLocaleString()}
                </span>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="exportNote">Add an explanatory note (optional)</Label>
              <Textarea 
                id="exportNote" 
                placeholder="e.g., Final report for Q2 2026..." 
                value={exportNote}
                onChange={(e) => setExportNote(e.target.value)}
                className="resize-none h-24"
              />
              <p className="text-[13px] text-muted-foreground">This note will be printed at the top of the exported Excel sheet to provide context for stakeholders.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsExportOpen(false)}>Cancel</Button>
            <Button onClick={confirmExportUsage}>Confirm & Export</Button>
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
                        selectedTxGroup.originalTx.reduce((acc: any, item: any) => {
                          const type = getLabelForUsage(item.referenceType || "Other");
                          const rawType = item.referenceType || "Other";
                          if (!acc[type]) {
                            acc[type] = { count: 0, cost: 0, rawType };
                          }
                          acc[type].count += 1;
                          acc[type].cost += item.amount;
                          return acc;
                        }, {})
                      ).map(([service, data]: [string, any]) => {
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
                      {selectedTxGroup.originalTx.map((item: any, idx: number) => (
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
    </div>
  );
}

function BillingMetric({ icon: Icon, label, value, detail, dark }: { icon: typeof Coins; label: string; value: string; detail: string; dark?: boolean }) {
  return (
    <Card className={`rounded-xl border ${dark ? "border-hairline bg-surface-2 text-ink" : "border-hairline bg-surface-1"} shadow-linear`}>
      <CardContent className="flex items-center gap-4 p-5">
        <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${dark ? "bg-surface-3 text-primary" : "bg-surface-2 text-ink"} border border-hairline`}>
          <Icon className="h-6 w-6" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">{label}</p>
          <p className="text-2xl font-semibold tracking-tight">{value}</p>
          <p className="text-xs text-muted-foreground mt-1">{detail}</p>
        </div>
      </CardContent>
    </Card>
  );
}
