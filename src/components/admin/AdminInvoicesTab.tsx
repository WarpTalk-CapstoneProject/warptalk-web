"use client";

import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2, Building2, User, Bot, Check, Copy, Shield } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { billingService } from "@/services/billing.service";
import { WorkspaceService } from "@/services/workspace.service";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";

interface InvoiceDto {
  id: string;
  invoiceNumber?: string | null;
  stripeInvoiceId?: string | null;
  subtotal?: number | null;
  tax?: number | null;
  amount?: number | null;
  total?: number | null;
  pdfUrl?: string | null;
  currency: string;
  status: string;
  invoicePdfUrl?: string;
  hostedInvoiceUrl?: string;
  createdAt: string;
  workspaceId?: string | null;
  workspaceName?: string | null;
}

function getInvoiceAmount(invoice: InvoiceDto): number {
  return invoice.total ?? invoice.amount ?? 0;
}

function getInvoiceTax(invoice: InvoiceDto): number {
  return invoice.tax ?? 0;
}

function getInvoiceSubtotal(invoice: InvoiceDto): number {
  return invoice.subtotal ?? Math.max(0, getInvoiceAmount(invoice) - getInvoiceTax(invoice));
}

function formatInvoiceMoney(invoice: InvoiceDto, value: number): string {
  return `${value.toLocaleString("vi-VN")}${invoice.currency.toLowerCase() === "vnd" ? " VND" : ` ${invoice.currency.toUpperCase()}`}`;
}

function getInvoiceNumber(invoice: InvoiceDto): string {
  if (invoice.invoiceNumber) return invoice.invoiceNumber;
  if (invoice.stripeInvoiceId) {
    const rawId = invoice.stripeInvoiceId;
    const suffix = rawId.substring(Math.max(0, rawId.length - 8)).toUpperCase();
    return rawId.startsWith("in_") ? `INV-${suffix}` : rawId;
  }
  return invoice.id;
}

function getInvoicePdfUrl(invoice: InvoiceDto): string | null {
  return invoice.pdfUrl ?? invoice.invoicePdfUrl ?? null;
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

export function AdminInvoicesTab() {
  const [page, setPage] = useState(1);
  const [workspaceFilter, setWorkspaceFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [minAmountFilter, setMinAmountFilter] = useState<number | "">("");
  const [maxAmountFilter, setMaxAmountFilter] = useState<number | "">("");
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceDto | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["global-invoices-list"],
    queryFn: () => billingService.getGlobalInvoices(1, 200), // Fetch up to 200 for rich client-side filters
  });

  const invoices = useMemo(() => (data?.items || []) as unknown as InvoiceDto[], [data?.items]);
  const invoiceWorkspaceIds = useMemo(
    () => Array.from(new Set(invoices.map((invoice) => invoice.workspaceId).filter(Boolean) as string[])).sort(),
    [invoices]
  );

  const { data: workspaces } = useQuery({
    queryKey: ["admin-invoice-workspace-names"],
    queryFn: () => WorkspaceService.list(1, 500, ""),
  });

  const { data: workspaceDetailsById } = useQuery({
    queryKey: ["admin-invoice-workspace-details", invoiceWorkspaceIds.join(",")],
    queryFn: async () => {
      const results = await Promise.allSettled(invoiceWorkspaceIds.map((id) => WorkspaceService.getById(id)));
      return new Map(
        results.flatMap((result) => result.status === "fulfilled"
          ? [[result.value.id, result.value.name] as const]
          : [])
      );
    },
    enabled: invoiceWorkspaceIds.length > 0,
  });

  const workspaceNamesById = useMemo(() => {
    const names = new Map<string, string>();
    (workspaces?.items ?? []).forEach((workspace) => {
      names.set(workspace.id, workspace.name);
    });
    (workspaceDetailsById ?? new Map<string, string>()).forEach((name, id) => {
      names.set(id, name);
    });
    return names;
  }, [workspaceDetailsById, workspaces?.items]);

  const filteredInvoices = useMemo(() => {
    return invoices.filter(inv => {
      const query = workspaceFilter.toLowerCase();
      const resolvedWorkspaceName = inv.workspaceId ? workspaceNamesById.get(inv.workspaceId) : undefined;
      const matchWorkspace = workspaceFilter
        ? (inv.workspaceId?.toLowerCase().includes(query)
          || inv.workspaceName?.toLowerCase().includes(query)
          || resolvedWorkspaceName?.toLowerCase().includes(query))
        : true;
      const matchStatus = statusFilter !== "ALL" ? inv.status?.toLowerCase() === statusFilter.toLowerCase() : true;
      const amount = getInvoiceAmount(inv);
      const matchMin = minAmountFilter !== "" ? amount >= minAmountFilter : true;
      const matchMax = maxAmountFilter !== "" ? amount <= maxAmountFilter : true;
      return matchWorkspace && matchStatus && matchMin && matchMax;
    });
  }, [invoices, workspaceFilter, statusFilter, minAmountFilter, maxAmountFilter, workspaceNamesById]);

  const displayTotalCount = filteredInvoices.length;
  const totalPages = Math.max(1, Math.ceil(displayTotalCount / 20));
  const paginatedInvoices = useMemo(() => {
    return filteredInvoices.slice((page - 1) * 20, page * 20);
  }, [filteredInvoices, page]);

  const activeFiltersCount = [
    workspaceFilter !== "",
    statusFilter !== "ALL",
    minAmountFilter !== "",
    maxAmountFilter !== "",
  ].filter(Boolean).length;
  const selectedInvoiceWorkspaceName = selectedInvoice?.workspaceId
    ? workspaceNamesById.get(selectedInvoice.workspaceId) ?? selectedInvoice.workspaceName
    : selectedInvoice?.workspaceName;

  const resetFilters = () => {
    setWorkspaceFilter("");
    setStatusFilter("ALL");
    setMinAmountFilter("");
    setMaxAmountFilter("");
    setPage(1);
  };

  return (
    <Card className="rounded-xl border border-hairline bg-surface-1 shadow-linear flex flex-col">
      <CardHeader className="p-4 border-b border-hairline bg-surface-1/50 flex-none">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <CardTitle className="text-lg">Contract invoices</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Invoices are created by paid checkout events or when a workspace billing cycle closes.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 mt-4 pt-4 border-t border-hairline">
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Status</Label>
            <Select value={statusFilter} onValueChange={(val) => { setStatusFilter(val || "ALL"); setPage(1); }}>
              <SelectTrigger className="w-[140px] h-8 text-sm">
                <SelectValue placeholder="All status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Status</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="unpaid">Unpaid</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Workspace</Label>
            <Input type="text" placeholder="Name or ID..." className="h-8 text-sm w-[140px]"
              value={workspaceFilter}
              onChange={(e) => { setWorkspaceFilter(e.target.value); setPage(1); }} />
          </div>

          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Min amount</Label>
            <Input type="number" min={0} placeholder="Min..." className="h-8 text-sm w-[110px]"
              value={minAmountFilter}
              onChange={(e) => { setMinAmountFilter(e.target.value ? Number(e.target.value) : ""); setPage(1); }} />
          </div>

          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Max amount</Label>
            <Input type="number" min={0} placeholder="Max..." className="h-8 text-sm w-[110px]"
              value={maxAmountFilter}
              onChange={(e) => { setMaxAmountFilter(e.target.value ? Number(e.target.value) : ""); setPage(1); }} />
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
              <TableHead className="w-[180px]">Date</TableHead>
              <TableHead>Workspace</TableHead>
              <TableHead>Invoice</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : paginatedInvoices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  No invoices have been issued yet.
                </TableCell>
              </TableRow>
            ) : paginatedInvoices.map((inv) => {
              const workspaceId = inv.workspaceId ?? "";
              const workspaceName = workspaceId ? workspaceNamesById.get(workspaceId) ?? inv.workspaceName : inv.workspaceName;
              const hostedInvoiceUrl = inv.hostedInvoiceUrl;
              const pdfUrl = getInvoicePdfUrl(inv);
              return (
              <TableRow key={inv.id} className="border-hairline hover:bg-surface-2">
                <TableCell className="text-xs font-mono text-muted-foreground">
                  {format(new Date(inv.createdAt), "MMM d, yyyy HH:mm")}
                </TableCell>
                <TableCell>
                  {workspaceId ? (
                    <Link href={`/billing/workspace/${workspaceId}`} className="block hover:opacity-80 transition-opacity">
                      <IdBadge id={workspaceId} type="workspace" name={workspaceName} />
                    </Link>
                  ) : (
                    <IdBadge id="unknown" type="workspace" name={workspaceName ?? "Unknown"} />
                  )}
                </TableCell>
                <TableCell className="text-xs font-mono text-muted-foreground">{getInvoiceNumber(inv)}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={inv.status === "paid" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30" : "bg-surface-3 text-ink"}>
                    {inv.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-medium">
                  {getInvoiceAmount(inv).toLocaleString()} {inv.currency.toUpperCase()}
                </TableCell>
                <TableCell className="text-right space-x-2">
                  <Button variant="outline" size="sm" className="h-7 text-xs font-medium rounded-md px-2.5" onClick={() => setSelectedInvoice(inv)}>
                    View Receipt
                  </Button>
                  {hostedInvoiceUrl && (
                    <a href={hostedInvoiceUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline text-xs font-semibold">
                      Stripe Invoice
                    </a>
                  )}
                  {pdfUrl && (
                    <a href={pdfUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline text-xs font-semibold">
                      PDF
                    </a>
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
          {data && displayTotalCount > 0 ? (
            <>Showing <strong>{(page - 1) * 20 + 1}-{Math.min(page * 20, displayTotalCount)}</strong> of <strong>{displayTotalCount}</strong> invoices</>
          ) : data ? "0 invoices issued" : "Loading invoices..."}
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

      <Dialog open={!!selectedInvoice} onOpenChange={(open) => !open && setSelectedInvoice(null)}>
        <DialogContent id="invoice-print-area" className="sm:max-w-[420px] border-hairline bg-surface-1 shadow-lg rounded-xl overflow-hidden p-0 print:hidden">
          <div className="bg-gradient-to-br from-primary/10 via-canvas to-canvas px-6 pt-6 pb-4 text-center border-b border-hairline/30 relative">
            <div className="absolute top-4 right-4 text-[9px] uppercase font-mono tracking-widest text-ink-muted no-print">Receipt</div>
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500 text-white mx-auto mb-2 shadow-md shadow-emerald-500/25">
              <span className="text-lg font-bold">✓</span>
            </div>
            <h3 className="text-base font-extrabold text-ink tracking-tight">Payment Successful</h3>
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
                    {getInvoiceNumber(selectedInvoice)}
                  </span>
                </div>
                
                <div className="flex justify-between items-center text-xs">
                  <span className="text-ink-muted">Date & Time</span>
                  <span className="text-ink font-semibold">{format(new Date(selectedInvoice.createdAt), "MMMM dd, yyyy HH:mm")}</span>
                </div>

                <div className="flex justify-between items-center text-xs">
                  <span className="text-ink-muted">Workspace</span>
                  <span className="text-ink font-semibold">{selectedInvoiceWorkspaceName ?? "Unknown"}</span>
                </div>

                <div className="flex justify-between items-center text-xs">
                  <span className="text-ink-muted">Payment Method</span>
                  <span className="text-ink font-semibold">Stripe Gateway</span>
                </div>

                <div className="border-t border-dashed border-hairline/60 my-4 pt-4 flex justify-between items-center">
                  <div>
                    <span className="text-xs text-ink-muted font-medium block">Amount Paid</span>
                    <span className="text-[9px] text-emerald-600 font-bold bg-emerald-100 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded uppercase mt-0.5 inline-block">Status: Paid</span>
                  </div>
                  <span className="text-lg font-extrabold text-ink tracking-tight">
                    {getInvoiceAmount(selectedInvoice).toLocaleString("vi-VN")}{selectedInvoice.currency.toLowerCase() === "vnd" ? "đ" : ` ${selectedInvoice.currency.toUpperCase()}`}
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
      <div id="official-invoice-print-sheet" className="hidden print:block p-10 bg-white text-black font-sans text-xs w-full max-w-[800px] mx-auto">
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
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">WarpTalk</h1>
            <p className="text-[10px] text-gray-500 mt-1">AI-Powered Translation Platform</p>
          </div>
          <div className="text-right">
            <h2 className="text-lg font-bold text-gray-800 uppercase tracking-wide">Official Receipt</h2>
            <p className="text-xs font-mono font-bold text-gray-700 mt-1.5">
              No: {selectedInvoice && getInvoiceNumber(selectedInvoice)}
            </p>
            <p className="text-[10px] text-gray-500 mt-1">Date: {selectedInvoice && format(new Date(selectedInvoice.createdAt), "MMMM dd, yyyy")}</p>
          </div>
        </div>

        {/* Company & Client Info */}
        <div className="grid grid-cols-2 gap-10 my-8">
          <div>
            <h3 className="font-bold text-gray-500 uppercase text-[9px] tracking-wider mb-2">From</h3>
            <p className="font-bold text-gray-900 text-sm">WarpTalk Global Inc.</p>
            <p className="text-gray-600 mt-1">123 AI Boulevard, Tech District</p>
            <p className="text-gray-600">Email: billing@warptalk.com</p>
            <p className="text-gray-600">Website: warptalk.com</p>
          </div>
          <div>
            <h3 className="font-bold text-gray-500 uppercase text-[9px] tracking-wider mb-2">To</h3>
            <p className="font-bold text-gray-900 text-xs mt-1">{selectedInvoiceWorkspaceName ?? "Unknown workspace"}</p>
            <p className="text-gray-600 mt-1">Status: <span className="text-emerald-600 font-extrabold uppercase">Paid</span></p>
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
                  <span className="font-bold text-gray-900 block text-xs">WarpTalk Plan Subscription</span>
                  <span className="text-[10px] text-gray-500 mt-1 block">High-quality real-time audio translation & meeting summaries (1 Month)</span>
                </td>
                <td className="py-4 px-3 text-center text-gray-700">1</td>
                <td className="py-4 px-3 text-right text-gray-700 font-mono">
                  {formatInvoiceMoney(selectedInvoice, getInvoiceSubtotal(selectedInvoice))}
                </td>
                <td className="py-4 px-3 text-right text-gray-900 font-bold font-mono pr-4">
                  {formatInvoiceMoney(selectedInvoice, getInvoiceSubtotal(selectedInvoice))}
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
                {selectedInvoice && formatInvoiceMoney(selectedInvoice, getInvoiceSubtotal(selectedInvoice))}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Tax:</span>
              <span className="text-gray-900 font-mono">
                {selectedInvoice && formatInvoiceMoney(selectedInvoice, getInvoiceTax(selectedInvoice))}
              </span>
            </div>
            <div className="flex justify-between text-xs border-t border-gray-800 pt-3.5 font-black text-sm">
              <span className="text-gray-900">Total Paid:</span>
              <span className="text-gray-950 font-mono text-base">
                {selectedInvoice && formatInvoiceMoney(selectedInvoice, getInvoiceAmount(selectedInvoice))}
              </span>
            </div>
          </div>
        </div>

        {/* Signature Stamp Mock */}
        <div className="mt-16 grid grid-cols-2 gap-8 text-center text-[10px]">
          <div>
            <p className="text-gray-500">Prepared by</p>
            <p className="mt-8 font-bold text-gray-700">WarpTalk Billing System</p>
          </div>
          <div>
            <p className="text-gray-500">Customer Signature</p>
            <div className="mt-8 h-10 w-32 border-b border-dashed border-gray-300 mx-auto"></div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 pt-6 mt-16 text-center text-[9px] text-gray-400 space-y-1">
          <p className="font-bold text-gray-500">Thank you for choosing WarpTalk!</p>
          <p>This is a system-generated electronic receipt. No physical signature or stamp is required.</p>
          <p>For support, please contact billing@warptalk.com or visit our Help Center.</p>
        </div>
      </div>
    </Card>
  );
}
