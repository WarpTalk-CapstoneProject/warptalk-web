"use client";

/**
 * Invoices — the full billing history, on a page of its own.
 *
 * WHY IT IS ITS OWN PAGE. It was the third tab of the billing screen, so answering "how many
 * invoices are there and what do they add up to" meant loading the subscription surface first and
 * then finding the tab. "invoice tách page đi, muốn theo dõi hóa đơn có bao nhiêu khó quá." A
 * count and a running total are the first two things on the page now, because they were the
 * question.
 *
 * Rows, ruled — not a bordered table with a header band. No shadows. See ../components.
 */

import { ArrowSquareOut, Spinner } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useMemo, useState } from "react";

import { useWorkspaceRole } from "@/hooks/use-workspace-role";
import { formatMoney } from "@/lib/format/currency";
import { billingService } from "@/services/billing.service";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { cn } from "@/lib/utils";

import {
  BillingButton,
  Row,
  RowGroup,
  Section,
  SectionHeader,
} from "../components/billing-primitives";

const PAGE_SIZE = 20;

function statusOf(invoice: { paidAt: string | null; status?: string | null }) {
  if (invoice.paidAt) return { label: "Paid", tone: "paid" as const };
  if ((invoice.status ?? "").toLowerCase() === "void") {
    return { label: "Void", tone: "void" as const };
  }
  return { label: "Unpaid", tone: "unpaid" as const };
}

export default function WorkspaceInvoicesPage() {
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const workspaceId = activeWorkspaceId || "";
  const role = useWorkspaceRole();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["billing", "invoices", workspaceId, page],
    queryFn: () => billingService.getWorkspaceInvoices(workspaceId, page, PAGE_SIZE),
    enabled: !!workspaceId,
    retry: 1,
  });

  const invoices = useMemo(() => data?.items ?? [], [data]);

  // Only invoices that were actually PAID count towards "invoiced to date". Counting
  // issued-but-unpaid ones would tell an owner they have spent money they still owe.
  const summary = useMemo(() => {
    const paid = invoices.filter((invoice) => invoice.paidAt !== null);
    const outstanding = invoices.filter(
      (invoice) =>
        invoice.paidAt === null && (invoice.status ?? "").toLowerCase() !== "void",
    );
    return {
      paidTotal: paid.reduce((sum, invoice) => sum + invoice.total, 0),
      paidCount: paid.length,
      outstandingTotal: outstanding.reduce((sum, invoice) => sum + invoice.total, 0),
      outstandingCount: outstanding.length,
      currency: invoices[0]?.currency,
    };
  }, [invoices]);

  const total = data?.totalCount ?? invoices.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (role && role !== "owner" && role !== "admin") {
    return (
      <div className="px-4 py-4 text-[13px] text-ink-muted">
        Only workspace Owners and Administrators can view invoices.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 bg-surface-1 px-4 py-4 text-ink">
      <Section>
        <SectionHeader
          title="Invoices"
          description={
            isLoading
              ? "Loading…"
              : `${total} invoice${total === 1 ? "" : "s"} issued to this workspace`
          }
        />
        <RowGroup>
          <Row
            label="Paid to date"
            value={formatMoney(summary.paidTotal, summary.currency)}
            hint={`${summary.paidCount} invoice${summary.paidCount === 1 ? "" : "s"}`}
          />
          <Row
            label="Outstanding"
            value={formatMoney(summary.outstandingTotal, summary.currency)}
            hint={
              summary.outstandingCount > 0
                ? `${summary.outstandingCount} invoice${summary.outstandingCount === 1 ? "" : "s"} awaiting payment`
                : "Nothing awaiting payment"
            }
          />
        </RowGroup>
      </Section>

      <Section>
        <SectionHeader title="All invoices" />
        {isLoading ? (
          <div className="flex h-[160px] items-center justify-center">
            <Spinner className="h-5 w-5 animate-spin text-ink-muted" />
          </div>
        ) : invoices.length === 0 ? (
          <p className="px-4 py-10 text-center text-[13px] text-ink-muted">
            No invoice has been issued for this workspace yet.
          </p>
        ) : (
          <div className="divide-y divide-hairline">
            {invoices.map((invoice) => {
              const status = statusOf(invoice);
              return (
                <div
                  key={invoice.id}
                  className="flex items-center justify-between gap-4 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-mono text-[13px] text-ink">
                      {invoice.invoiceNumber}
                    </p>
                    <p className="mt-0.5 text-[11px] text-ink-subtle">
                      Issued {format(new Date(invoice.issuedAt), "MMM d, yyyy")}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-4">
                    <span
                      className={cn(
                        "text-[12px] font-medium",
                        status.tone === "paid" && "text-emerald-600 dark:text-emerald-400",
                        status.tone === "unpaid" && "text-amber-500",
                        status.tone === "void" && "text-ink-subtle",
                      )}
                    >
                      {status.label}
                    </span>
                    <span className="w-[110px] text-right text-[13px] font-medium tabular-nums text-ink">
                      {formatMoney(invoice.total, invoice.currency)}
                    </span>
                    {/* Only a real http(s) URL becomes a link. `pdfUrl` is nullable and has been
                        seen carrying a storage key rather than a URL, which renders as a link
                        that navigates nowhere. */}
                    {invoice.pdfUrl && invoice.pdfUrl.startsWith("http") ? (
                      <a
                        href={invoice.pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[12px] text-ink-muted transition-colors hover:text-ink"
                      >
                        PDF
                        <ArrowSquareOut className="h-3.5 w-3.5" />
                      </a>
                    ) : (
                      <span className="w-[34px]" aria-hidden />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {totalPages > 1 ? (
          <div className="flex items-center justify-between gap-3 border-t border-hairline px-4 py-3">
            <p className="text-[12px] text-ink-muted">
              Page {page} of {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <BillingButton
                tone="outline"
                className="w-auto px-3"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </BillingButton>
              <BillingButton
                tone="outline"
                className="w-auto px-3"
                disabled={page >= totalPages}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              >
                Next
              </BillingButton>
            </div>
          </div>
        ) : null}
      </Section>
    </div>
  );
}
