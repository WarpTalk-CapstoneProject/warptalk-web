"use client";

import {
  Download,
  Robot,
  Coins,
  CreditCard,
  Translate,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Spinner,
  Lock,
  Funnel,
  SlidersHorizontal,
  WarningCircle,
  ArrowClockwise,
} from "@phosphor-icons/react";
import { isAxiosError } from "axios";
import Link from "next/link";
import { WorkspaceEmptyState } from "@/components/workspace/page-chrome";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useEffect, useState, useMemo } from "react";
import type { Borders, CellValue } from "exceljs";
import { saveAs } from "file-saver";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { billingService } from "@/services/billing.service";
import type {
  GroupedCreditTransaction,
  UsageGroupSummary,
  UsageBreakdownDto,
  InvoiceDto,
} from "@/types/billing";
import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useWorkspaceRole } from "@/hooks/use-workspace-role";
import { createHubConnection } from "@/lib/realtime/signalr";
import { UsageChart } from "@/components/admin/UsageChart";
import { FeatureBreakdownChart } from "@/components/admin/FeatureBreakdownChart";
import { useParams } from "next/navigation";
import AdminBillingPage from "@/app/(internal)/billing/page";
import { formatMoney } from "@/lib/format/currency";
import { createExcelWorkbook } from "@/lib/export/create-excel-workbook";

const CURRENT_MONTH = new Date().getMonth() + 1;
const CURRENT_YEAR = new Date().getFullYear();

const BILLING_FILTER_WIDTH_CLASS: Record<string, string> = {
  overview: "w-[154px]",
  history: "w-[168px]",
  invoices: "w-[134px]",
};

/**
 * The billing API answers "this workspace has no plan" with an explicit error code rather than an
 * empty payload, on every endpoint that needs a subscription to compute anything (balance,
 * subscription, monthly report). That is a legitimate account state, not a broken request, and the
 * two must not collapse into the same UI.
 */
const NO_SUBSCRIPTION_CODE = "BILLING_SUBSCRIPTION_NOT_FOUND";

interface BillingErrorBody {
  error?: string;
  message?: string;
  Message?: string;
  code?: string;
}

function isNoSubscriptionError(error: unknown): boolean {
  return (
    isAxiosError<BillingErrorBody>(error) &&
    error.response?.data?.code === NO_SUBSCRIPTION_CODE
  );
}

function getBillingErrorMessage(error: unknown): string {
  if (isAxiosError<BillingErrorBody>(error)) {
    const body = error.response?.data;
    const detail = body?.message ?? body?.Message ?? body?.error;
    if (detail) return detail;
    if (error.response?.status) {
      return `The billing service responded with HTTP ${error.response.status}.`;
    }
    return error.message;
  }
  return error instanceof Error
    ? error.message
    : "An unexpected error occurred.";
}

function getIconForUsage(usageType: string) {
  if (usageType.toLowerCase().includes("translation")) return Translate;
  if (usageType.toLowerCase().includes("summary")) return Robot;
  return Coins;
}

function getLabelForUsage(usageType: string) {
  if (usageType === "translation" || usageType === "voice_translation")
    return "Real-time Translation (Speech-to-Text / STT)";
  if (usageType === "summary" || usageType === "meeting_summary")
    return "AI Meeting Insights (Summarization)";
  if (usageType === "chat") return "AI Workspace Co-pilot Chat";
  if (usageType === "text_to_speech")
    return "AI Voice Synthesis (Text-to-Speech / TTS)";
  if (usageType === "voice_cloning")
    return "Custom AI Voice Cloning (Voice Cloning)";
  return usageType.replace(/_/g, " ");
}

function getUnitSuffixForUsage(usageType: string): string {
  const t = usageType.toLowerCase();
  if (t === "translation" || t === "voice_translation") return "cr/min";
  if (t === "summary" || t === "meeting_summary") return "cr/req";
  if (t === "text_to_speech") return "cr/min";
  if (t === "voice_cloning") return "cr/min";
  return "cr";
}

export default function WorkspaceBillingPage() {
  const params = useParams();
  const slug = params?.workspaceSlug as string;

  if (slug === "warptalk-global") {
    return <AdminBillingPage />;
  }

  return <WorkspaceBillingContent slug={slug} />;
}

function WorkspaceBillingContent({ slug }: { slug: string }) {
  const queryClient = useQueryClient();
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [exportNote, setExportNote] = useState("");

  const { isAuthenticated, accessToken } = useAuthStore();
  const activeWorkspaceId = useWorkspaceStore(
    (state) => state.activeWorkspaceId,
  );
  const workspaceSlug =
    useWorkspaceStore((state) => state.activeWorkspaceSlug) || slug || "";
  const workspaceId = activeWorkspaceId || "";
  const role = useWorkspaceRole();

  useEffect(() => {
    if (!isAuthenticated || !accessToken) return;

    const connection = createHubConnection("/hubs/notification");

    connection.on("NewNotification", (notification) => {
      console.log("Realtime billing update:", notification);
      if (
        notification?.type === "billing.credits_updated" ||
        notification?.type === "billing.subscription_changed"
      ) {
        queryClient.invalidateQueries({ queryKey: ["billing"] });
        queryClient.invalidateQueries({ queryKey: ["workspace-usage-chart"] });
        queryClient.invalidateQueries({
          queryKey: ["workspace-feature-breakdown"],
        });
      }
    });

    let isMounted = true;

    connection
      .start()
      .then(() => {
        if (isMounted && workspaceId) {
          connection
            .invoke("SubscribeWorkspace", workspaceId)
            .catch(console.error);
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        if (err?.message?.includes("stop() was called")) return;
      });

    return () => {
      isMounted = false;
      connection.stop();
    };
  }, [queryClient, accessToken, isAuthenticated, workspaceId]);

  const {
    data: balance,
    isLoading: isBalanceLoading,
    error: balanceError,
  } = useQuery({
    queryKey: ["billing", "balance", workspaceId],
    queryFn: () => billingService.getWorkspaceCredits(workspaceId),
    enabled: !!workspaceId,
    retry: 1,
  });

  const {
    data: subscription,
    isLoading: isSubscriptionLoading,
    error: subscriptionError,
  } = useQuery({
    queryKey: ["billing", "subscription", workspaceId],
    queryFn: () => billingService.getActiveSubscription(workspaceId),
    enabled: !!workspaceId,
    retry: 1,
  });

  const {
    data: report,
    isLoading: isReportLoading,
    error: reportError,
  } = useQuery({
    queryKey: ["billing", "report", workspaceId, CURRENT_YEAR, CURRENT_MONTH],
    queryFn: () =>
      billingService.getBillingReport(workspaceId, CURRENT_MONTH, CURRENT_YEAR),
    enabled: !!workspaceId,
    retry: 1,
  });

  const [historyPageNumber, setHistoryPageNumber] = useState(1);
  const [billingTab, setBillingTab] = useState("overview");
  const [historyTypeFilter, setHistoryTypeFilter] = useState("ALL");
  const [filterFromDate, setFilterFromDate] = useState("");
  const [filterToDate, setFilterToDate] = useState("");
  const [filterMinAmount, setFilterMinAmount] = useState<number | "">("");
  const [filterMaxAmount, setFilterMaxAmount] = useState<number | "">("");

  const [invoicesPageNumber] = useState(1);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceDto | null>(
    null,
  );
  const [selectedTxGroup, setSelectedTxGroup] =
    useState<GroupedCreditTransaction | null>(null);

  const { data: invoicesPage, isLoading: isInvoicesLoading } = useQuery({
    queryKey: ["billing", "invoices", workspaceId, invoicesPageNumber],
    queryFn: () =>
      billingService.getWorkspaceInvoices(workspaceId, invoicesPageNumber, 20),
    enabled: !!workspaceId,
    retry: 1,
  });

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
      "billing",
      "history",
      workspaceId,
      historyPageNumber,
      historyTypeFilter,
      filterFromDate,
      filterToDate,
      filterMinAmount,
      filterMaxAmount,
    ],
    queryFn: () =>
      billingService.getCreditHistory(workspaceId, 1, 1000, {
        type: historyTypeFilter === "ALL" ? undefined : historyTypeFilter,
        fromDate: filterFromDate
          ? new Date(filterFromDate + "T00:00:00").toISOString()
          : undefined,
        toDate: filterToDate
          ? new Date(filterToDate + "T23:59:59.999").toISOString()
          : undefined,
        minAmount: filterMinAmount !== "" ? Number(filterMinAmount) : undefined,
        maxAmount: filterMaxAmount !== "" ? Number(filterMaxAmount) : undefined,
      }),
    enabled: !!workspaceId,
    retry: 1,
  });

  const groupedHistoryItems = useMemo(() => {
    if (!historyPage?.items) return [];
    const groups: GroupedCreditTransaction[] = [];
    let currentGroup: GroupedCreditTransaction | null = null;

    historyPage.items.forEach((tx) => {
      if (!currentGroup) {
        currentGroup = { ...tx, originalTx: [tx] };
        return;
      }

      const isSameType = currentGroup.type === tx.type;

      // Group if they both have the same valid referenceId
      const exactReferenceMatch =
        currentGroup &&
        tx.referenceId &&
        currentGroup.referenceId === tx.referenceId &&
        currentGroup.referenceId !== "00000000-0000-0000-0000-000000000000";

      const shouldGroup =
        isSameType && tx.type === "consume" && exactReferenceMatch;

      if (shouldGroup) {
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
  }, [historyPage]);

  // Local pagination over the grouped items
  const PAGE_SIZE = 20;
  const totalPages = Math.ceil(groupedHistoryItems.length / PAGE_SIZE);
  const paginatedGroups = groupedHistoryItems.slice(
    (historyPageNumber - 1) * PAGE_SIZE,
    historyPageNumber * PAGE_SIZE,
  );

  const currentCredits = balance?.currentCredits ?? 0;
  const totalCredits = balance?.totalCredits ?? 0;
  const creditsUsed = balance
    ? balance.totalCredits - balance.currentCredits
    : 0;
  const usagePercent =
    totalCredits > 0 ? Math.round((creditsUsed / totalCredits) * 100) : 0;
  const renewsDate = balance?.currentPeriodEnd
    ? format(new Date(balance.currentPeriodEnd), "MMM dd, yyyy")
    : "--";

  const totalTopUp = useMemo(() => {
    if (!historyPage?.items) return 0;
    return historyPage.items
      .filter((tx) => tx.type === "top_up" && tx.amount > 0)
      .reduce((sum, tx) => sum + tx.amount, 0);
  }, [historyPage]);

  const totalConsumed = useMemo(() => {
    if (!historyPage?.items) return 0;
    return historyPage.items
      .filter((tx) => tx.type === "consume")
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
  }, [historyPage]);

  const netChange = totalTopUp - totalConsumed;

  const usageBreakdown = report?.usageBreakdown ?? [];

  const handleOpenExport = () => {
    setIsExportOpen(true);
  };

  const confirmExportUsage = async () => {
    if (!historyPage?.items) return;
    try {
      const workbook = await createExcelWorkbook();
      const worksheet = workbook.addWorksheet("Wallet Statement");

      worksheet.columns = [
        { key: "id", width: 40 },
        { key: "type", width: 15 },
        { key: "date", width: 25 },
        { key: "amount", width: 20 },
        { key: "balance", width: 20 },
      ];

      worksheet.addRow(["WarpTalk - Wallet Transaction Report"]);
      worksheet.getRow(1).font = { size: 16, bold: true };
      worksheet.mergeCells("A1:E1");

      worksheet.addRow([
        `Generated on: ${format(new Date(), "MMM dd, yyyy HH:mm:ss")}`,
      ]);
      worksheet.mergeCells("A2:E2");

      let currentRowOffset = 2;

      if (exportNote.trim()) {
        worksheet.addRow([]);
        worksheet.addRow(["Owner Note:"]);
        worksheet.getRow(4).font = { bold: true };
        worksheet.addRow([exportNote]);
        worksheet.getRow(5).font = {
          italic: true,
          color: { argb: "FF4B5563" },
        };
        worksheet.mergeCells("A5:E5");
        currentRowOffset = 5;
      }

      worksheet.addRow([]);
      currentRowOffset += 1;

      const headerRowIndex = currentRowOffset + 1;
      const headerRow = worksheet.getRow(headerRowIndex);
      const headerRowValues: CellValue[] = [
        "Transaction ID",
        "Type",
        "Date",
        "Amount (Credits)",
        "Balance After",
      ];
      headerRow.values = headerRowValues;

      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
      headerRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF0F172A" },
      };
      headerRow.alignment = { vertical: "middle", horizontal: "center" };

      const borderStyle: Partial<Borders> = {
        top: { style: "thin", color: { argb: "FFCBD5E1" } },
        left: { style: "thin", color: { argb: "FFCBD5E1" } },
        bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
        right: { style: "thin", color: { argb: "FFCBD5E1" } },
      };

      ["A", "B", "C", "D", "E"].forEach((col) => {
        headerRow.getCell(col).border = borderStyle;
      });

      historyPage.items.forEach((tx) => {
        const displayTxId = tx.id
          ? `TX-${tx.id.split("-")[0].toUpperCase()}`
          : "TX-UNKNOWN";
        const row = worksheet.addRow({
          id: displayTxId,
          type: tx.type === "top_up" ? "Top-Up" : "Consumption",
          date: new Date(tx.createdAt),
          amount: tx.amount,
          balance: tx.balanceAfter,
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

      worksheet.addRow([]);

      const sumRow1 = worksheet.addRow(["", "", "Total Top-Up:", totalTopUp]);
      sumRow1.getCell(3).font = { bold: true };
      sumRow1.getCell(4).numFmt = "#,##0";
      sumRow1.getCell(4).font = { color: { argb: "FF16A34A" }, bold: true };
      sumRow1.getCell(3).border = borderStyle;
      sumRow1.getCell(4).border = borderStyle;

      const sumRow2 = worksheet.addRow([
        "",
        "",
        "Total Consumed:",
        totalConsumed,
      ]);
      sumRow2.getCell(3).font = { bold: true };
      sumRow2.getCell(4).numFmt = "#,##0";
      sumRow2.getCell(4).font = { color: { argb: "FFDC2626" }, bold: true };
      sumRow2.getCell(3).border = borderStyle;
      sumRow2.getCell(4).border = borderStyle;

      const sumRow3 = worksheet.addRow(["", "", "Net Change:", netChange]);
      sumRow3.getCell(3).font = { bold: true };
      sumRow3.getCell(4).numFmt = "#,##0";
      sumRow3.getCell(4).font = {
        bold: true,
        color: { argb: netChange > 0 ? "FF16A34A" : "FFDC2626" },
      };
      sumRow3.getCell(3).border = borderStyle;
      sumRow3.getCell(4).border = borderStyle;

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      saveAs(blob, `WarpTalk_Wallet_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
      setIsExportOpen(false);
      toast.success(
        `Exported ${historyPage.items.length} transactions to Excel.`,
      );
    } catch {
      toast.error("Failed to export. Please try again.");
    }
  };

  const displayPlanName = subscription?.planName || "No Active Plan";
  const displayPlanPrice = subscription?.price
    ? formatMoney(subscription.price, "VND")
    : "--";

  // The three queries below own every number on this surface. If any of them failed we must not
  // fall through to the normal layout, because `?? 0` would paint a fabricated balance of 0 next to
  // spinners that never resolve.
  const coreErrors = [balanceError, subscriptionError, reportError];
  const isCoreLoading =
    isBalanceLoading || isSubscriptionLoading || isReportLoading;
  const hasNoSubscription = coreErrors.some(isNoSubscriptionError);
  const hardError = coreErrors.find(
    (error) => error && !isNoSubscriptionError(error),
  );

  const retryBillingQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["billing"] });
    queryClient.invalidateQueries({ queryKey: ["workspace-usage-chart"] });
    queryClient.invalidateQueries({ queryKey: ["workspace-feature-breakdown"] });
  };

  if (!role) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-canvas">
        <Spinner className="h-6 w-6 animate-spin text-ink-muted" />
      </div>
    );
  }

  if (role !== "owner" && role !== "admin") {
    return (
      <div className="flex h-[80vh] items-center justify-center w-full">
        <Card className="max-w-md border-hairline bg-surface-1/40 p-6 text-center shadow-sm">
          <CardHeader className="flex flex-col items-center gap-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <Lock className="h-6 w-6" />
            </div>
            <CardTitle className="text-lg font-bold">Access Denied</CardTitle>
            <CardDescription className="text-xs">
              Only workspace Owners and Administrators can view billing and
              subscription configurations.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!isCoreLoading && hasNoSubscription) {
    return <BillingNoSubscriptionState workspaceSlug={workspaceSlug} />;
  }

  if (!isCoreLoading && hardError) {
    return (
      <BillingErrorState
        message={getBillingErrorMessage(hardError)}
        onRetry={retryBillingQueries}
      />
    );
  }

  return (
    <div className="flex h-full flex-col bg-surface-1 px-4 pb-6 text-ink">
      {/* Header section with styling consistent with members and documents */}
      <div className="flex shrink-0 flex-col gap-2 pb-1.5 pt-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar">
          {[
            { value: "overview", label: "Overview & Usage" },
            { value: "history", label: "Transaction History" },
            { value: "invoices", label: "Billing History" },
          ].map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setBillingTab(item.value)}
              className={`flex h-[26px] ${BILLING_FILTER_WIDTH_CLASS[item.value]} shrink-0 items-center justify-center rounded-full border px-3 text-[12px] font-medium transition-colors select-none ${
                billingTab === item.value
                  ? "border-[#d5d6dc] bg-[#ececf0] text-[#08090a] shadow-none dark:border-[#34363a] dark:bg-[#2b2b2e] dark:text-white"
                  : "border-[#e2e3e7] bg-transparent text-[#6b7280] hover:border-[#d6d7dc] hover:bg-[#f1f1f4] hover:text-[#0f1115] dark:border-[#25272b] dark:text-[#9fa0a5] dark:hover:border-[#303236] dark:hover:bg-[#232524] dark:hover:text-white"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 shrink-0 sm:ml-auto">
          <button
            type="button"
            onClick={() => setBillingTab("history")}
            className="relative flex h-[28px] w-[28px] items-center justify-center rounded-full border border-border/60 text-muted-foreground shadow-sm transition-colors hover:bg-surface-2 hover:text-foreground"
            title="Transaction filters"
          >
            <Funnel weight="bold" size={13} />
            {activeFiltersCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex size-3 items-center justify-center rounded-full bg-primary text-[8px] font-bold text-white">
                {activeFiltersCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setBillingTab("history")}
            className="flex h-[28px] w-[28px] items-center justify-center rounded-full border border-border/60 text-muted-foreground shadow-sm transition-colors hover:bg-surface-2 hover:text-foreground"
            title="Billing display options"
          >
            <SlidersHorizontal weight="bold" size={13} />
          </button>
          <div className="mx-1 h-4 w-[1px] bg-border" />
          <button
            onClick={handleOpenExport}
            className="inline-flex h-[28px] items-center gap-1.5 rounded-full border border-border/60 bg-surface-1 px-3 text-[13px] font-medium text-ink shadow-sm transition hover:bg-surface-2"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export usage</span>
          </button>

          <Link href={`/${workspaceSlug}/payment/plans`}>
            <button className="inline-flex h-[28px] items-center gap-1.5 rounded-full bg-foreground px-3.5 text-[13px] font-medium text-background shadow-sm transition hover:opacity-90">
              <Wallet className="h-3.5 w-3.5" />
              <span>Manage Plan &amp; Credits</span>
            </button>
          </Link>
        </div>
      </div>

      {/* Grid wrapper using standard border-hairline/30 bg-surface-1/40 card styling */}
      <section className="grid gap-6 md:grid-cols-2">
        <BillingMetric
          icon={Coins}
          label="AI credits remaining"
          value={isBalanceLoading ? "..." : currentCredits.toLocaleString()}
          detail={
            isBalanceLoading
              ? "Loading..."
              : `${creditsUsed.toLocaleString()} of ${totalCredits.toLocaleString()} used. Renews ${renewsDate}`
          }
        />

        <div className="flex items-start justify-between gap-4 rounded-[14px] border border-border bg-canvas p-4 shadow-linear">
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] font-medium text-ink-muted">Current plan</span>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <p className="text-[24px] font-semibold leading-none tracking-tight text-ink">
                {isSubscriptionLoading ? "…" : displayPlanName}
              </p>
              {subscription && (
                <Badge className="rounded-full border-none bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 hover:bg-emerald-500/15 dark:text-emerald-400">
                  Active
                </Badge>
              )}
            </div>
            <p className="mt-1.5 text-[12px] text-ink-muted">
              {isSubscriptionLoading
                ? "Loading plan details…"
                : subscription
                  ? `${displayPlanPrice} / month`
                  : "No active plan. Upgrade to unlock advanced AI capabilities."}
            </p>
          </div>
          <Link href={`/${workspaceSlug}/payment/plans`} className="shrink-0">
            <span className="inline-flex h-[28px] items-center rounded-full border border-border/60 bg-surface-1 px-3 text-[13px] font-medium text-ink shadow-sm transition hover:bg-surface-2">
              {subscription ? "Change plan" : "Upgrade plan"}
            </span>
          </Link>
        </div>
      </section>

      <Tabs value={billingTab} onValueChange={setBillingTab} className="w-full">
        <TabsContent value="overview" className="mt-6 space-y-6 outline-none">
          <section className="flex flex-col gap-6">
            <Card className="border-hairline/30 bg-surface-1/40 rounded-lg shadow-sm">
              <CardContent className="pt-6">
                <UsageChart workspaceId={workspaceId} />
              </CardContent>
            </Card>

            <div className="grid gap-6 md:grid-cols-2">
              <Card className="border-hairline/30 bg-surface-1/40 rounded-lg shadow-sm">
                <CardContent className="pt-6">
                  <FeatureBreakdownChart workspaceId={workspaceId} />
                </CardContent>
              </Card>

              <Card className="border-hairline/30 bg-surface-1/40 rounded-lg shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base font-semibold">
                    Credit allocation
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div
                    className="relative mx-auto flex h-40 w-40 items-center justify-center rounded-full"
                    style={{
                      background: `conic-gradient(#5e6ad2 0 ${usagePercent}%, var(--color-surface-3) ${usagePercent}% 100%)`,
                    }}
                  >
                    <div className="flex h-32 w-32 flex-col items-center justify-center rounded-full bg-surface-1 border border-hairline/40">
                      <p className="text-2xl font-bold">{usagePercent}%</p>
                      <p className="text-xs text-ink-muted">used</p>
                    </div>
                  </div>
                  <div className="space-y-3 text-xs border-t border-hairline/25 pt-4">
                    <div className="flex justify-between items-center">
                      <span className="text-ink-muted">Monthly allowance</span>
                      <strong className="font-semibold text-ink">
                        {totalCredits.toLocaleString()}
                      </strong>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-ink-muted">Consumed</span>
                      <strong className="font-semibold text-ink">
                        {creditsUsed.toLocaleString()}
                      </strong>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-ink-muted">Remaining</span>
                      <strong className="font-semibold text-primary">
                        {currentCredits.toLocaleString()}
                      </strong>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>

          <section className="grid min-h-0 flex-1 gap-6">
            <Card className="border-hairline/30 bg-surface-1/40 rounded-lg shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-hairline/20 px-5 pt-5">
                <div>
                  <CardTitle className="text-base font-semibold">
                    Cost by AI service
                  </CardTitle>
                  <p className="text-xs text-ink-muted mt-1">
                    Variable AI usage costs this billing cycle
                    {subscription?.planName
                      ? ` · ${subscription.planName} plan`
                      : ""}
                    .
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className="rounded-md border-hairline text-xs"
                >
                  {format(new Date(), "MMMM yyyy")}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-4 p-5">
                {isReportLoading ? (
                  <p className="text-xs text-ink-muted py-4">
                    Loading usage data...
                  </p>
                ) : usageBreakdown.length === 0 ? (
                  <p className="text-xs text-ink-muted py-4">
                    No usage data for this month.
                  </p>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    {usageBreakdown.map((usage: UsageBreakdownDto) => {
                      const Icon = getIconForUsage(usage.usageType);
                      const name = getLabelForUsage(usage.usageType);
                      const percent = report?.totalConsumedCredits
                        ? Math.round(
                            (usage.creditsConsumed /
                              report.totalConsumedCredits) *
                              100,
                          )
                        : 0;

                      return (
                        <div
                          key={usage.usageType}
                          className="rounded-lg border border-hairline/50 bg-surface-2 p-4 flex flex-col justify-between"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-canvas text-ink border border-hairline/40">
                                <Icon className="h-4 w-4" />
                              </span>
                              <div>
                                <p className="text-xs font-semibold text-ink">
                                  {name}
                                </p>
                                <p className="text-[11px] text-ink-muted">
                                  {percent}% of variable AI spend
                                </p>
                              </div>
                            </div>
                            <p className="text-sm font-semibold text-ink">
                              {usage.creditsConsumed.toLocaleString()} cr
                            </p>
                          </div>
                          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-3/60">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2 mt-2">
                  <div className="rounded-lg border border-hairline/40 bg-surface-2/60 p-4">
                    <p className="text-xs text-ink-muted">
                      Average translation cost
                    </p>
                    <p className="text-base font-bold mt-1 text-ink">
                      {report?.averageTranslationCostPer100Chars !== undefined &&
                      report?.averageTranslationCostPer100Chars !== null
                        ? `${report.averageTranslationCostPer100Chars} cr / 100 chars`
                        : "--"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-hairline/40 bg-surface-2/60 p-4">
                    <p className="text-xs text-ink-muted">
                      Average cost per meeting
                    </p>
                    <p className="text-base font-bold mt-1 text-ink">
                      {report?.averageCostPerMeeting !== undefined &&
                      report?.averageCostPerMeeting !== null
                        ? `${report.averageCostPerMeeting} cr`
                        : "--"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>
        </TabsContent>

        <TabsContent value="history" className="mt-6 outline-none">
          <Card className="border-hairline/30 bg-surface-1/40 rounded-lg shadow-sm">
            <CardHeader className="flex flex-col items-start gap-4 pb-4 border-b border-hairline/20 px-5 pt-5">
              <div className="flex w-full items-center justify-between">
                <CardTitle className="text-base font-semibold">
                  Transaction History
                </CardTitle>
              </div>

              <div className="space-y-3 w-full">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-[11px] font-semibold text-ink-muted">
                      Type
                    </Label>
                    <Select
                      value={historyTypeFilter}
                      onValueChange={(v) => {
                        setHistoryTypeFilter(v || "ALL");
                        setHistoryPageNumber(1);
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs bg-surface-2 border-hairline w-[130px] font-medium">
                        <SelectValue placeholder="All types" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL" className="text-xs">
                          All types
                        </SelectItem>
                        <SelectItem value="top_up" className="text-xs">
                          Top-Up
                        </SelectItem>
                        <SelectItem value="consume" className="text-xs">
                          Consumption
                        </SelectItem>
                        <SelectItem value="adjustment" className="text-xs">
                          Adjustment
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label className="text-[11px] font-semibold text-ink-muted">
                      From date
                    </Label>
                    <Input
                      type="date"
                      className="h-8 text-xs bg-surface-2 border-hairline w-[130px]"
                      value={filterFromDate}
                      onChange={(e) => {
                        setFilterFromDate(e.target.value);
                        setHistoryPageNumber(1);
                      }}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-[11px] font-semibold text-ink-muted">
                      To date
                    </Label>
                    <Input
                      type="date"
                      className="h-8 text-xs bg-surface-2 border-hairline w-[130px]"
                      value={filterToDate}
                      onChange={(e) => {
                        setFilterToDate(e.target.value);
                        setHistoryPageNumber(1);
                      }}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label className="text-[11px] font-semibold text-ink-muted">
                      Min amount (cr)
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      placeholder="e.g. 10"
                      className="h-8 text-xs bg-surface-2 border-hairline w-[110px]"
                      value={filterMinAmount}
                      onChange={(e) => {
                        setFilterMinAmount(
                          e.target.value ? Number(e.target.value) : "",
                        );
                        setHistoryPageNumber(1);
                      }}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-[11px] font-semibold text-ink-muted">
                      Max amount (cr)
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      placeholder="e.g. 1000"
                      className="h-8 text-xs bg-surface-2 border-hairline w-[110px]"
                      value={filterMaxAmount}
                      onChange={(e) => {
                        setFilterMaxAmount(
                          e.target.value ? Number(e.target.value) : "",
                        );
                        setHistoryPageNumber(1);
                      }}
                    />
                  </div>

                  {activeFiltersCount > 0 && (
                    <button
                      onClick={resetFilters}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-hairline bg-surface-2 hover:bg-surface-3 px-3 text-xs font-semibold text-ink transition duration-150 cursor-pointer self-end"
                    >
                      <span>Clear filters</span>
                      <Badge className="h-4 px-1.5 text-[9px] font-bold rounded-full bg-primary text-white border-none">
                        {activeFiltersCount}
                      </Badge>
                    </button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-surface-2/80">
                    <TableRow className="border-hairline/35 hover:bg-transparent">
                      <TableHead className="w-[60px] text-[11px] font-semibold text-ink-muted uppercase tracking-wider pl-5 py-2.5">
                        No.
                      </TableHead>
                      <TableHead className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider py-2.5">
                        Workspace
                      </TableHead>
                      <TableHead className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider py-2.5">
                        Type
                      </TableHead>
                      <TableHead className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider py-2.5">
                        Date
                      </TableHead>
                      <TableHead className="text-right text-[11px] font-semibold text-ink-muted uppercase tracking-wider py-2.5">
                        Amount
                      </TableHead>
                      <TableHead className="text-right text-[11px] font-semibold text-ink-muted uppercase tracking-wider py-2.5">
                        Balance After
                      </TableHead>
                      <TableHead className="text-right text-[11px] font-semibold text-ink-muted uppercase tracking-wider pr-5 py-2.5">
                        Action
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-hairline/20">
                    {isHistoryLoading ? (
                      <TableRow>
                        <TableCell
                          colSpan={7}
                          className="text-center py-8 text-xs text-ink-muted"
                        >
                          <Spinner className="h-4 w-4 animate-spin inline mr-2 text-primary" />
                          Loading history...
                        </TableCell>
                      </TableRow>
                    ) : paginatedGroups.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={7}
                          className="text-center py-8 text-xs text-ink-muted"
                        >
                          No transactions found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedGroups.map((tx, index) => {
                        const isPositive = tx.amount > 0;
                        const sign = isPositive ? "+" : "";
                        const isGrouped =
                          tx.originalTx && tx.originalTx.length > 1;
                        const rowIndex =
                          (historyPageNumber - 1) * PAGE_SIZE + index + 1;

                        return (
                          <TableRow
                            key={tx.id}
                            className="border-hairline/15 hover:bg-surface-2/20"
                          >
                            <TableCell className="font-mono text-xs text-ink-muted pl-5 py-3">
                              {rowIndex}
                            </TableCell>
                            <TableCell className="text-xs font-semibold text-ink py-3 capitalize">
                              {tx.workspaceName || workspaceSlug}
                            </TableCell>
                            <TableCell className="py-3">
                              <div className="flex items-center gap-2 text-xs">
                                {/* There is no "reserve" transaction type on the billing
                                    service; the spinner branch could never be reached. */}
                                {tx.amount > 0 ? (
                                  <ArrowUpRight className="h-3.5 w-3.5 text-emerald-500" />
                                ) : (
                                  <ArrowDownRight className="h-3.5 w-3.5 text-rose-500" />
                                )}
                                <span className="capitalize font-medium text-ink">
                                  {tx.type.replace("_", "-")}
                                </span>
                                {isGrouped && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] font-mono ml-2 py-0 px-1 border-hairline text-ink-muted font-normal"
                                  >
                                    {tx.originalTx.length} items
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-xs text-ink-muted py-3">
                              {format(
                                new Date(tx.createdAt),
                                "MMM dd, yyyy HH:mm",
                              )}
                            </TableCell>
                            <TableCell
                              className={`text-right text-xs font-semibold py-3 ${isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-ink"}`}
                            >
                              {sign}
                              {tx.amount.toLocaleString()} cr
                            </TableCell>
                            <TableCell className="text-right text-xs font-mono text-ink-muted py-3">
                              {tx.balanceAfter.toLocaleString()} cr
                            </TableCell>
                            <TableCell className="text-right text-xs pr-5 py-3">
                              {(isGrouped || tx.type === "consume") && (
                                <button
                                  onClick={() =>
                                    setSelectedTxGroup(
                                      isGrouped
                                        ? tx
                                        : { ...tx, originalTx: [tx] },
                                    )
                                  }
                                  className="text-primary hover:underline font-semibold cursor-pointer bg-transparent border-none p-0"
                                >
                                  View Details
                                </button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
              <div className="flex items-center justify-between border-t border-hairline/20 px-5 py-4">
                <p className="text-xs text-ink-muted">
                  {!isHistoryLoading ? (
                    <>
                      Showing{" "}
                      {Math.min(
                        (historyPageNumber - 1) * PAGE_SIZE + 1,
                        groupedHistoryItems.length,
                      )}
                      –
                      {Math.min(
                        historyPageNumber * PAGE_SIZE,
                        groupedHistoryItems.length,
                      )}{" "}
                      of {groupedHistoryItems.length} transactions
                    </>
                  ) : (
                    "Loading..."
                  )}
                </p>
                {totalPages >= 1 && (
                  <div className="flex items-center gap-1">
                    <button
                      disabled={historyPageNumber <= 1}
                      onClick={() =>
                        setHistoryPageNumber((p) => Math.max(1, p - 1))
                      }
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-hairline bg-surface-2 hover:bg-surface-3 disabled:opacity-50 text-xs font-medium"
                    >
                      ‹
                    </button>

                    {(() => {
                      const pages: (number | "...")[] = [];
                      const delta = 2;
                      for (let i = 1; i <= totalPages; i++) {
                        if (
                          i === 1 ||
                          i === totalPages ||
                          (i >= historyPageNumber - delta &&
                            i <= historyPageNumber + delta)
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
                            className="h-7 w-7 flex items-center justify-center text-xs text-ink-muted"
                          >
                            …
                          </span>
                        ) : (
                          <button
                            key={p}
                            onClick={() => setHistoryPageNumber(p as number)}
                            className={`inline-flex h-7 w-7 items-center justify-center rounded-md border text-xs font-semibold transition-colors duration-150 ${p === historyPageNumber ? "bg-primary border-primary text-white" : "border-hairline bg-surface-2 hover:bg-surface-3"}`}
                          >
                            {p}
                          </button>
                        ),
                      );
                    })()}

                    <button
                      disabled={historyPageNumber >= totalPages}
                      onClick={() =>
                        setHistoryPageNumber((p) => Math.min(totalPages, p + 1))
                      }
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-hairline bg-surface-2 hover:bg-surface-3 disabled:opacity-50 text-xs font-medium"
                    >
                      ›
                    </button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invoices" className="mt-6 outline-none">
          <Card className="border-hairline/30 bg-surface-1/40 rounded-lg shadow-sm">
            <CardHeader className="pb-4 border-b border-hairline/20 px-5 pt-5">
              <CardTitle className="text-base font-semibold">
                Billing History
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-surface-2/80">
                    <TableRow className="border-hairline/35 hover:bg-transparent">
                      <TableHead className="w-[60px] text-[11px] font-semibold text-ink-muted uppercase tracking-wider pl-5 py-2.5">
                        No.
                      </TableHead>
                      <TableHead className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider py-2.5">
                        Invoice ID
                      </TableHead>
                      <TableHead className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider py-2.5">
                        Date
                      </TableHead>
                      <TableHead className="text-right text-[11px] font-semibold text-ink-muted uppercase tracking-wider py-2.5">
                        Amount
                      </TableHead>
                      <TableHead className="text-right text-[11px] font-semibold text-ink-muted uppercase tracking-wider pr-5 py-2.5">
                        Action
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-hairline/20">
                    {isInvoicesLoading ? (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="text-center py-8 text-xs text-ink-muted"
                        >
                          <Spinner className="h-4 w-4 animate-spin inline mr-2 text-primary" />
                          Loading invoices...
                        </TableCell>
                      </TableRow>
                    ) : !invoicesPage?.items?.length ? (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="text-center py-8 text-xs text-ink-muted"
                        >
                          No invoices found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      invoicesPage.items.map((invoice, index) => {
                        const rowIndex =
                          (invoicesPageNumber - 1) * 20 + index + 1;
                        return (
                          <TableRow
                            key={invoice.id}
                            className="border-hairline/15 hover:bg-surface-2/20"
                          >
                            <TableCell className="font-mono text-xs text-ink-muted pl-5 py-3">
                              {rowIndex}
                            </TableCell>
                            <TableCell className="text-xs font-mono text-ink py-3">
                              {invoice.invoiceNumber}
                            </TableCell>
                            <TableCell className="text-xs text-ink-muted py-3">
                              {format(
                                new Date(invoice.createdAt),
                                "MMM dd, yyyy HH:mm",
                              )}
                            </TableCell>
                            <TableCell className="text-right text-xs font-semibold text-ink py-3">
                              {formatMoney(invoice.total, invoice.currency)}
                            </TableCell>
                            <TableCell className="text-right text-xs pr-5 py-3 space-x-3">
                              <button
                                onClick={() => setSelectedInvoice(invoice)}
                                className="text-primary hover:underline font-semibold cursor-pointer bg-transparent border-none p-0"
                              >
                                View Details
                              </button>
                              {invoice.pdfUrl &&
                                invoice.pdfUrl.startsWith("http") && (
                                  <a
                                    href={invoice.pdfUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-primary hover:underline font-semibold"
                                  >
                                    Download PDF
                                  </a>
                                )}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>

      <Dialog open={isExportOpen} onOpenChange={setIsExportOpen}>
        <DialogContent className="sm:max-w-[500px] border-hairline bg-surface-1 shadow-lg rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">
              Export Usage Preview
            </DialogTitle>
            <DialogDescription className="text-xs text-ink-muted">
              Review your transaction summary before generating the Excel file.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="rounded-lg border border-hairline bg-surface-2 p-4">
              <div className="flex justify-between mb-2">
                <span className="text-xs text-ink-muted">
                  Transactions Found:
                </span>
                <span className="text-xs font-bold text-ink">
                  {historyPage?.items?.length || 0}
                </span>
              </div>
              <div className="flex justify-between mb-2">
                <span className="text-xs text-ink-muted">Total Top-Ups:</span>
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  +{totalTopUp.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between mb-2">
                <span className="text-xs text-ink-muted">Total Consumed:</span>
                <span className="text-xs font-bold text-rose-600 dark:text-rose-400">
                  -{totalConsumed.toLocaleString()}
                </span>
              </div>
              <div className="pt-2 mt-2 border-t border-hairline/25 flex justify-between">
                <span className="text-xs font-bold text-ink">
                  Net Balance Change:
                </span>
                <span
                  className={`text-xs font-bold ${netChange > 0 ? "text-emerald-600" : netChange < 0 ? "text-rose-600" : ""}`}
                >
                  {netChange > 0 ? "+" : ""}
                  {netChange.toLocaleString()}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="exportNote" className="text-xs font-semibold">
                Add an explanatory note (optional)
              </Label>
              <Textarea
                id="exportNote"
                placeholder="e.g., Final report for Q2 2026..."
                value={exportNote}
                onChange={(e) => setExportNote(e.target.value)}
                className="resize-none h-20 text-xs bg-surface-2 border-hairline focus:ring-1 focus:ring-primary focus-visible:ring-1"
              />
              <p className="text-[10px] text-ink-muted">
                This note will be printed at the top of the exported Excel sheet
                to provide context for stakeholders.
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <button
              onClick={() => setIsExportOpen(false)}
              className="inline-flex h-8 items-center rounded-md border border-hairline bg-surface-2 hover:bg-surface-3 px-3.5 text-xs font-semibold text-ink cursor-pointer transition duration-150"
            >
              Cancel
            </button>
            <button
              onClick={confirmExportUsage}
              className="inline-flex h-8 items-center rounded-md bg-primary hover:bg-primary-hover px-3.5 text-xs font-semibold text-white cursor-pointer transition duration-150"
            >
              Confirm & Export
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!selectedInvoice}
        onOpenChange={(open) => !open && setSelectedInvoice(null)}
      >
        <DialogContent
          id="invoice-print-area"
          className="sm:max-w-[420px] border-hairline bg-surface-1 shadow-lg rounded-xl overflow-hidden p-0 print:hidden"
        >
          <div className="bg-gradient-to-br from-primary/10 via-canvas to-canvas px-6 pt-6 pb-4 text-center border-b border-hairline/30 relative">
            <div className="absolute top-4 right-4 text-[9px] uppercase font-mono tracking-widest text-ink-muted no-print">
              Receipt
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500 text-white mx-auto mb-2 shadow-md shadow-emerald-500/25">
              <span className="text-lg font-bold">✓</span>
            </div>
            <h3 className="text-base font-extrabold text-ink tracking-tight">
              Payment Successful
            </h3>
            <p className="text-[11px] text-ink-muted mt-0.5">
              Thank you for your subscription payment
            </p>
          </div>

          <div className="px-6 py-5 space-y-4">
            {selectedInvoice && (
              <div className="space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-ink-muted">Invoice Number</span>
                  <span className="font-mono font-bold text-ink uppercase tracking-wider">
                    {selectedInvoice.invoiceNumber}
                  </span>
                </div>

                <div className="flex justify-between items-center text-xs">
                  <span className="text-ink-muted">Date & Time</span>
                  <span className="text-ink font-semibold">
                    {format(
                      new Date(selectedInvoice.createdAt),
                      "MMMM dd, yyyy HH:mm",
                    )}
                  </span>
                </div>

                <div className="flex justify-between items-center text-xs">
                  <span className="text-ink-muted">Workspace</span>
                  <span className="text-ink font-bold capitalize">
                    {workspaceSlug}
                  </span>
                </div>

                <div className="flex justify-between items-center text-xs">
                  <span className="text-ink-muted">Payment Method</span>
                  <span className="text-ink font-semibold">Stripe Gateway</span>
                </div>

                <div className="border-t border-dashed border-hairline/60 my-4 pt-4 flex justify-between items-center">
                  <div>
                    <span className="text-xs text-ink-muted font-medium block">
                      Amount Paid
                    </span>
                    <span className="text-[9px] text-emerald-600 font-bold bg-emerald-100 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded uppercase mt-0.5 inline-block">
                      Status: Paid
                    </span>
                  </div>
                  <span className="text-lg font-extrabold text-ink tracking-tight">
                    {formatMoney(selectedInvoice.total, selectedInvoice.currency)}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="bg-surface-2/60 px-6 py-4 border-t border-hairline/25 flex gap-3 no-print">
            <button
              onClick={() => {
                window.print();
              }}
              className="flex-1 inline-flex h-9 items-center justify-center rounded-md border border-hairline bg-surface-1 hover:bg-surface-2 px-3 text-xs font-semibold text-ink cursor-pointer transition duration-150"
            >
              Print Receipt
            </button>
            <button
              onClick={() => setSelectedInvoice(null)}
              className="flex-1 inline-flex h-9 items-center justify-center rounded-md bg-primary hover:bg-primary-hover px-3 text-xs font-semibold text-white cursor-pointer transition duration-150"
            >
              Close
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Official Print-Only Invoice Sheet */}
      <div
        id="official-invoice-print-sheet"
        className="hidden print:block p-10 bg-white text-black font-sans text-xs w-full max-w-[800px] mx-auto"
      >
        <style>{`
          @media print {
            body * {
              visibility: hidden !important;
            }
            #official-invoice-print-sheet, #official-invoice-print-sheet * {
              visibility: visible !important;
            }
            #official-invoice-print-sheet {
              display: block !important;
              position: fixed !important;
              left: 0 !important;
              top: 0 !important;
              width: 100% !important;
              height: 100% !important;
              background: white !important;
              color: black !important;
              padding: 40px !important;
              margin: 0 !important;
              box-sizing: border-box !important;
              z-index: 999999 !important;
            }
            @page {
              size: A4;
              margin: 0;
            }
          }
        `}</style>

        {/* Header */}
        <div className="flex justify-between items-start border-b-2 border-gray-300 pb-6">
          <div>
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">
              WarpTalk
            </h1>
            <p className="text-[10px] text-gray-500 mt-1">
              AI-Powered Translation Platform
            </p>
          </div>
          <div className="text-right">
            <h2 className="text-lg font-bold text-gray-800 uppercase tracking-wide">
              Official Receipt
            </h2>
            <p className="text-xs font-mono font-bold text-gray-700 mt-1.5">
              No:{" "}
              {selectedInvoice?.invoiceNumber ?? ""}
            </p>
            <p className="text-[10px] text-gray-500 mt-1">
              Date:{" "}
              {selectedInvoice &&
                format(new Date(selectedInvoice.createdAt), "MMMM dd, yyyy")}
            </p>
          </div>
        </div>

        {/* Company & Client Info */}
        <div className="grid grid-cols-2 gap-10 my-8">
          <div>
            <h3 className="font-bold text-gray-500 uppercase text-[9px] tracking-wider mb-2">
              From
            </h3>
            <p className="font-bold text-gray-900 text-sm">
              WarpTalk Global Inc.
            </p>
            <p className="text-gray-600 mt-1">
              123 AI Boulevard, Tech District
            </p>
            <p className="text-gray-600">Email: billing@warptalk.com</p>
            <p className="text-gray-600">Website: warptalk.com</p>
          </div>
          <div>
            <h3 className="font-bold text-gray-500 uppercase text-[9px] tracking-wider mb-2">
              To
            </h3>
            <p className="font-bold text-gray-900 text-sm capitalize">
              {workspaceSlug} Workspace
            </p>
            <p className="text-gray-600 mt-1">
              Status:{" "}
              <span className="text-emerald-600 font-extrabold uppercase">
                Paid
              </span>
            </p>
            <p className="text-gray-600">Payment Gateway: Stripe</p>
          </div>
        </div>

        {/* Itemized Table */}
        <table className="w-full text-left border-collapse my-8">
          <thead>
            <tr className="border-b-2 border-gray-800 text-[9px] uppercase font-bold text-gray-600 bg-gray-50">
              <th className="py-3 px-3">Description</th>
              <th className="py-3 px-3 text-center w-[80px]">Qty</th>
              <th className="py-3 px-3 text-right w-[150px]">Unit Price</th>
              <th className="py-3 px-3 text-right pr-4 w-[150px]">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {selectedInvoice && (
              <tr>
                <td className="py-4 px-3">
                  <span className="font-bold text-gray-900 block text-xs">
                    WarpTalk Startup Plan Subscription
                  </span>
                  <span className="text-[10px] text-gray-500 mt-1 block">
                    High-quality real-time audio translation & meeting summaries
                    (1 Month)
                  </span>
                </td>
                <td className="py-4 px-3 text-center text-gray-700">1</td>
                <td className="py-4 px-3 text-right text-gray-700 font-mono">
                  {formatMoney(selectedInvoice.total, selectedInvoice.currency)}
                </td>
                <td className="py-4 px-3 text-right text-gray-900 font-bold font-mono pr-4">
                  {formatMoney(selectedInvoice.total, selectedInvoice.currency)}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Total Summary */}
        <div className="flex justify-end my-8">
          <div className="w-[320px] space-y-2.5 border-t border-gray-200 pt-4">
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Subtotal:</span>
              <span className="font-semibold text-gray-900 font-mono">
                {selectedInvoice && formatMoney(selectedInvoice.total, selectedInvoice.currency)}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Tax (0%):</span>
              <span className="text-gray-900 font-mono">
                {formatMoney(0, selectedInvoice?.currency)}
              </span>
            </div>
            <div className="flex justify-between text-xs border-t border-gray-800 pt-3.5 font-black text-sm">
              <span className="text-gray-900">Total Paid:</span>
              <span className="text-gray-950 font-mono text-base">
                {selectedInvoice && formatMoney(selectedInvoice.total, selectedInvoice.currency)}
              </span>
            </div>
          </div>
        </div>

        {/* Electronic receipt signature section */}
        <div className="mt-16 grid grid-cols-2 gap-8 text-center text-[10px]">
          <div>
            <p className="text-gray-500">Prepared by</p>
            <p className="mt-8 font-bold text-gray-700">
              WarpTalk Billing System
            </p>
          </div>
          <div>
            <p className="text-gray-500">Customer Signature</p>
            <div className="mt-8 h-10 w-32 border-b border-dashed border-gray-300 mx-auto"></div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 pt-6 mt-16 text-center text-[9px] text-gray-400 space-y-1">
          <p className="font-bold text-gray-500">
            Thank you for choosing WarpTalk!
          </p>
          <p>
            This is a system-generated electronic receipt. No physical signature
            or stamp is required.
          </p>
          <p>
            For support, please contact billing@warptalk.com or visit our Help
            Center.
          </p>
        </div>
      </div>
      <Dialog
        open={!!selectedTxGroup}
        onOpenChange={(open) => !open && setSelectedTxGroup(null)}
      >
        <DialogContent className="sm:max-w-[760px] w-[95vw] border-hairline bg-surface-1 shadow-lg rounded-xl overflow-hidden p-0">
          <div className="bg-gradient-to-br from-primary/10 via-canvas to-canvas px-6 pt-6 pb-4 border-b border-hairline/30 relative">
            <h3 className="text-base font-extrabold text-ink tracking-tight flex items-center gap-2">
              <span>📊 Transaction Details</span>
            </h3>
            <p className="text-xs text-ink-muted mt-1">
              Breakdown of variable AI service spend for this session
            </p>
          </div>

          <div className="px-6 py-5 space-y-5">
            {selectedTxGroup && (
              <div className="space-y-5">
                {/* Session General Info */}
                <div className="grid grid-cols-2 gap-4 bg-surface-2 p-4 rounded-lg border border-hairline/80 text-xs text-ink">
                  <div>
                    <span className="text-[10px] text-ink-muted block uppercase font-mono tracking-wider">
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
                    <span className="text-[10px] text-ink-muted block uppercase font-mono tracking-wider">
                      Total Deducted
                    </span>
                    <span className="text-rose-600 dark:text-rose-400 font-extrabold mt-1 block text-sm">
                      {selectedTxGroup.amount.toLocaleString()} cr
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
                    <div className="divide-y divide-hairline/25 border border-hairline/65 rounded-lg bg-surface-2/40 overflow-hidden">
                      {Object.entries(
                        selectedTxGroup.originalTx.reduce<
                          Record<string, UsageGroupSummary>
                        >((acc, item) => {
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
                        }, {}),
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
                              <span className="text-[10px] text-ink-muted mt-1 block">
                                {data.count}{" "}
                                {data.count === 1 ? "call" : "calls"} ×{" "}
                                {unitPriceVal} {suffix}
                              </span>
                            </div>
                            <span className="font-extrabold text-rose-600 dark:text-rose-400">
                              {data.cost.toLocaleString()} cr
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
                    <div className="h-[268px] overflow-y-auto border border-hairline/80 rounded-lg divide-y divide-hairline/40 text-xs bg-surface-1 text-ink font-sans p-3 space-y-0.5 select-text [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-surface-2/30 [&::-webkit-scrollbar-track]:rounded-r-lg [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-ink-muted">
                      {selectedTxGroup.originalTx.map((item, idx) => (
                        <div
                          key={item.id || idx}
                          className="flex justify-between items-center py-2.5 px-3 rounded-md hover:bg-surface-2/60 transition-colors"
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary/70"></span>
                            <span className="text-ink font-medium flex items-center">
                              <span className="font-mono text-ink-muted text-[10px] mr-2.5">
                                {format(new Date(item.createdAt), "HH:mm:ss")}
                              </span>
                              {getLabelForUsage(
                                item.referenceType || "AI usage",
                              )}
                            </span>
                          </div>
                          <span className="text-rose-600 dark:text-rose-400 font-bold ml-2 shrink-0">
                            {item.amount.toLocaleString()} cr
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="bg-surface-2/60 px-6 py-4 border-t border-hairline/25 flex justify-end">
            <button
              onClick={() => setSelectedTxGroup(null)}
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary hover:bg-primary-hover px-4 text-xs font-semibold text-white cursor-pointer transition duration-150"
            >
              Close
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Legitimate account state: the workspace simply has no plan yet. Deliberately not styled as a
 * failure, and it carries the one action that resolves it.
 */
function BillingNoSubscriptionState({
  workspaceSlug,
}: {
  workspaceSlug: string;
}) {
  // The shared empty state, not a 320px card floating in the middle of an 80vh void. It used to
  // be centred vertically in the viewport, so the copy wrapped to six short lines in a narrow
  // column while the rest of the page was blank — the state read as an error page for a workspace
  // that is simply new.
  return (
    <div className="px-4 py-4">
      <WorkspaceEmptyState
        icon={<CreditCard className="h-7 w-7" />}
        title="No active subscription"
        description="This workspace has no billing plan yet, so there is no balance or usage to report. Choose a plan to start tracking credits and AI usage."
        action={
          <Link href={`/${workspaceSlug}/payment/plans`}>
            <span className="inline-flex h-[28px] items-center gap-1.5 rounded-full bg-foreground px-3.5 text-[13px] font-medium text-background shadow-sm transition hover:opacity-90">
              <Wallet className="h-3.5 w-3.5" />
              Choose a plan
            </span>
          </Link>
        }
      />
    </div>
  );
}

/**
 * Anything that is not "no plan": the numbers are unknown, so none are shown.
 */
function BillingErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex h-[80vh] items-center justify-center w-full">
      <Card className="max-w-md border-hairline bg-surface-1/40 p-6 text-center shadow-sm">
        <CardHeader className="flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <WarningCircle className="h-6 w-6" />
          </div>
          <CardTitle className="text-lg font-bold">
            Could not load billing data
          </CardTitle>
          <CardDescription className="text-xs">
            Your balance and usage are unavailable right now, so nothing is
            shown rather than a figure that could be wrong. {message}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center pt-2">
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary hover:bg-primary-hover px-4 text-xs font-semibold text-white transition duration-150 cursor-pointer"
          >
            <ArrowClockwise className="h-3.5 w-3.5" />
            <span>Retry</span>
          </button>
        </CardContent>
      </Card>
    </div>
  );
}

function BillingMetric({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Coins;
  label: string;
  value: string;
  detail: string;
}) {
  // Same box as the dashboard's tiles: 14px radius on `bg-canvas`, a 12px muted label, a 24px
  // semibold value, one line of context. It was a translucent `bg-surface-1/40` card with a 48px
  // icon tile and a 2xl bold number — a third card language on a page that already had two.
  return (
    <div className="rounded-[14px] border border-border bg-canvas p-4 shadow-linear">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-medium text-ink-muted">{label}</span>
        <Icon className="h-4 w-4 text-ink-muted" />
      </div>
      <p className="mt-3 text-[24px] font-semibold leading-none tracking-tight text-ink">{value}</p>
      <p className="mt-1.5 text-[12px] text-ink-muted">{detail}</p>
    </div>
  );
}
