"use client";

import { AdminPanel } from "@/components/admin/admin-page-chrome";
import {
  AdminDataTable,
  AdminListToolbar,
  resolveAdminWorkspaces,
  searchAdminWorkspaces,
  useAdminListState,
  type AdminColumn,
  type AdminFilterField,
} from "@/components/admin/list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  dateRangeBounds,
  dateRangeValue,
  entityValues,
  enumValue,
  numberRangeValue,
  type ListStateConfig,
  type SortDirection,
} from "@/lib/admin/list-state";
import { billingService } from "@/services/billing.service";
import {
  Buildings,
  CalendarBlank,
  CircleHalf,
  CurrencyCircleDollar,
  Coins,
  Receipt,
} from "@phosphor-icons/react/dist/ssr";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Bot,
  Building2,
  Check,
  Copy,
  Shield,
  User,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo, useState } from "react";
import { formatMoney } from "@/lib/format/currency";

/**
 * WT-457 — this file used to declare its OWN `InvoiceDto` here, and every field of it was wrong.
 *
 * It named `stripeInvoiceId`, `amount`, `invoicePdfUrl` and `hostedInvoiceUrl`. The API has never
 * sent any of them; it sends `invoiceNumber`, `total` and `pdfUrl`. `types/billing.ts` was
 * corrected for exactly this reason and carries the note — but this shadow copy was left behind,
 * and `as unknown as InvoiceDto[]` on the query result meant TypeScript checked the fiction
 * against nothing.
 *
 * So every one of these read `undefined` at runtime. "View Receipt" called
 * `undefined.startsWith("in_")`, which threw and handed the whole route to the error boundary —
 * the reported 404 with `Cannot read properties of undefined (reading 'startsWith')`. The
 * quieter half never threw: every amount in the table and on the receipt was `undefined`, and
 * the min/max amount filters compared against it and silently matched nothing.
 *
 * The real type is imported now, so the next field the API renames breaks the build instead of
 * the page.
 */
import type { GlobalInvoiceFilters, InvoiceDto } from "@/types/billing";

const PAGE_SIZE = 20;

/** Mirrors InvoiceConstants.InvoiceStatuses.Filterable in the billing service. */
const INVOICE_STATUSES = ["draft", "issued", "open", "paid", "void", "uncollectible"] as const;
/** The two currencies the platform prices in. */
const INVOICE_CURRENCIES = ["VND", "USD"] as const;

/**
 * The invoice list's view, in the URL beside `tab=invoices`. Everything is server-side
 * (GET /invoices/global): this tab used to fetch 200 invoices and filter them in memory, which
 * quietly stopped being "every invoice" at invoice 201. A palette result lands here as
 * `?tab=invoices&q=<invoice number>`.
 */
const INVOICE_LIST_CONFIG: ListStateConfig = {
  filters: [
    { key: "status", kind: "enum", values: INVOICE_STATUSES },
    { key: "workspace", kind: "entity" },
    { key: "currency", kind: "enum", values: INVOICE_CURRENCIES },
    { key: "issued", kind: "dateRange" },
    { key: "total", kind: "numberRange" },
  ],
  sortFields: ["issued", "total", "due"],
  defaultSort: { field: "issued", direction: "desc" },
  columns: [
    { id: "invoice" },
    { id: "issued" },
    { id: "workspace" },
    { id: "status" },
    { id: "due" },
    { id: "total" },
    { id: "actions" },
  ],
};

/** The toolkit's field + direction as the one sort key the endpoint takes. It has no due_desc. */
function invoiceApiSort(field: string, direction: SortDirection): NonNullable<GlobalInvoiceFilters["sort"]> {
  if (field === "total") return direction === "asc" ? "total_asc" : "total_desc";
  if (field === "due") return "due_asc";
  return direction === "asc" ? "issued_asc" : "issued_desc";
}

/**
 * The number to print on a receipt.
 *
 * `invoiceNumber` is the backend's own (`Invoice.InvoiceNumber`, non-null), so the common path is
 * simply to show it. The `in_…` branch survives because rows created straight from a Stripe
 * object carry Stripe's id in that column, and "INV-" + the last 8 characters is what the receipt
 * has always shown for those. Null-tolerant despite the non-null type: this renders inside a
 * printable receipt, and a blank line there is a better outcome than a thrown route.
 */
function receiptNumber(invoice: Pick<InvoiceDto, "invoiceNumber">): string {
  const number = invoice.invoiceNumber;
  if (!number) return "—";
  return number.startsWith("in_")
    ? `INV-${number.substring(number.length - 8).toUpperCase()}`
    : number;
}

function IdBadge({
  id,
  type,
  name,
}: {
  id: string;
  type: "workspace" | "user" | "system" | "admin";
  name?: string | null;
}) {
  const t = useTranslations("adminBillingLedger");
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
        title={t("idBadge.copyTooltip", { id })}
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

export function AdminInvoicesTab() {
  const t = useTranslations("adminBillingLedger.lists");
  const list = useAdminListState(INVOICE_LIST_CONFIG);
  const { state } = list;
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceDto | null>(
    null,
  );

  const status = enumValue(state.filters, "status");
  const workspaceId = entityValues(state.filters, "workspace")[0];
  const currency = enumValue(state.filters, "currency");
  const issued = dateRangeBounds(dateRangeValue(state.filters, "issued") ?? {});
  const total = numberRangeValue(state.filters, "total");

  const filters = useMemo<GlobalInvoiceFilters>(
    () => ({
      search: state.search || undefined,
      status,
      workspaceId,
      currency,
      fromDate: issued.from,
      // Half-open: the endpoint takes `issued_at < toDate`, the start of the day after.
      toDate: issued.toExclusive,
      minTotal: total?.min,
      maxTotal: total?.max,
      sort: invoiceApiSort(state.sort.field, state.sort.direction),
    }),
    [state.search, status, workspaceId, currency, issued.from, issued.toExclusive, total?.min, total?.max, state.sort.field, state.sort.direction],
  );

  // Under ["global-invoices"], which the page's realtime billing listener invalidates.
  const invoicesQuery = useQuery({
    queryKey: ["global-invoices", state.page, filters],
    queryFn: () => billingService.getGlobalInvoices(state.page, PAGE_SIZE, filters),
    placeholderData: (previous) => previous,
  });

  const invoices = invoicesQuery.data?.items ?? [];
  const totalCount = invoicesQuery.data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const statusLabel = (value: string) =>
    (INVOICE_STATUSES as readonly string[]).includes(value) ? t(`invoices.statuses.${value}`) : value;

  const filterFields: AdminFilterField[] = [
    {
      key: "status",
      label: t("invoices.filters.status"),
      icon: <CircleHalf size={13} />,
      kind: "enum",
      options: INVOICE_STATUSES.map((value) => ({ value, label: statusLabel(value) })),
    },
    {
      key: "workspace",
      label: t("invoices.filters.workspace"),
      icon: <Buildings size={13} />,
      kind: "entity",
      placeholder: t("workspacePlaceholder"),
      search: searchAdminWorkspaces,
      resolve: resolveAdminWorkspaces,
    },
    {
      key: "currency",
      label: t("invoices.filters.currency"),
      icon: <CurrencyCircleDollar size={13} />,
      kind: "enum",
      options: INVOICE_CURRENCIES.map((value) => ({ value, label: value })),
    },
    { key: "issued", label: t("invoices.filters.issued"), icon: <CalendarBlank size={13} />, kind: "dateRange" },
    {
      key: "total",
      label: t("invoices.filters.total"),
      icon: <Coins size={13} />,
      kind: "numberRange",
      step: 1,
    },
  ];

  const columns: AdminColumn<InvoiceDto>[] = [
    {
      id: "invoice",
      header: t("invoices.columns.invoice"),
      primary: true,
      cell: (inv) => <span className="text-xs font-mono text-ink">{inv.invoiceNumber}</span>,
    },
    {
      id: "issued",
      header: t("invoices.columns.issued"),
      sortField: "issued",
      defaultDirection: "desc",
      className: "w-[160px] whitespace-nowrap",
      cell: (inv) => (
        <span className="text-xs font-mono text-muted-foreground">
          {format(new Date(inv.issuedAt || inv.createdAt), "MMM d, yyyy HH:mm")}
        </span>
      ),
    },
    {
      id: "workspace",
      header: t("invoices.columns.workspace"),
      cell: (inv) =>
        // `workspaceId` is nullable — a personal invoice belongs to a user, not a workspace.
        inv.workspaceId ? (
          <Link
            href={`/billing/workspace/${inv.workspaceId}`}
            className="block hover:opacity-80 transition-opacity"
          >
            <IdBadge id={inv.workspaceId} type="workspace" name={inv.workspaceName} />
          </Link>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      id: "status",
      header: t("invoices.columns.status"),
      className: "w-[130px]",
      cell: (inv) => (
        <Badge
          variant="outline"
          className={
            inv.status === "paid"
              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
              : "bg-surface-3 text-ink"
          }
        >
          {statusLabel(inv.status)}
        </Badge>
      ),
    },
    {
      id: "due",
      header: t("invoices.columns.due"),
      sortField: "due",
      defaultDirection: "asc",
      className: "w-[130px] whitespace-nowrap",
      cell: (inv) => (
        <span className="text-xs text-muted-foreground">
          {inv.dueAt ? format(new Date(inv.dueAt), "MMM d, yyyy") : "—"}
        </span>
      ),
    },
    {
      id: "total",
      header: t("invoices.columns.total"),
      align: "right",
      sortField: "total",
      defaultDirection: "desc",
      className: "w-[140px]",
      cell: (inv) => <span className="font-medium">{formatMoney(inv.total, inv.currency)}</span>,
    },
    {
      id: "actions",
      header: t("invoices.columns.actions"),
      align: "right",
      className: "w-[220px]",
      cell: (inv) => (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs font-medium rounded-md px-2.5"
            onClick={() => setSelectedInvoice(inv)}
          >
            {t("invoices.viewReceipt")}
          </Button>
          {inv.pdfUrl && (
            <a
              href={inv.pdfUrl}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline text-xs font-semibold"
            >
              {t("invoices.stripeInvoice")}
            </a>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <AdminListToolbar
        list={list}
        searchPlaceholder={t("invoices.searchPlaceholder")}
        filters={filterFields}
        count={invoicesQuery.isPending ? null : totalCount}
        countLabel={t("invoices.count", { count: totalCount })}
        isFetching={invoicesQuery.isFetching && !invoicesQuery.isPending}
        display={{
          sortOptions: [
            { field: "issued", label: t("invoices.sort.issued") },
            { field: "total", label: t("invoices.sort.total") },
            { field: "due", label: t("invoices.sort.due") },
          ],
          columns: columns
            .filter((column) => !column.primary && column.id !== "actions")
            .map((column) => ({ id: column.id, label: column.header })),
        }}
      />

      <AdminPanel>
        <AdminDataTable
          list={list}
          columns={columns}
          rows={invoices}
          rowKey={(inv) => inv.id}
          isPending={invoicesQuery.isPending}
          isError={invoicesQuery.isError}
          onRetry={() => void invoicesQuery.refetch()}
          empty={{
            title: t("invoices.emptyTitle"),
            description: t("invoices.emptyDescription"),
            icon: <Receipt size={20} weight="duotone" />,
          }}
          pagination={{ page: state.page, pageCount: totalPages, total: totalCount, pageSize: PAGE_SIZE }}
          caption={t("invoices.caption")}
          minWidth={960}
        />
      </AdminPanel>

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
                    {receiptNumber(selectedInvoice)}
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
                  <span className="text-ink-muted">Workspace ID</span>
                  <span className="text-ink font-mono font-semibold">
                    {selectedInvoice.workspaceId}
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
              {selectedInvoice && receiptNumber(selectedInvoice)}
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
            <p className="font-bold text-gray-900 text-xs font-mono mt-1">
              Workspace ID: {selectedInvoice?.workspaceId}
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
    </>
  );
}
