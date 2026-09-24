"use client";

/**
 * Invoices — the billing history, and the only place a charge that did not go through is shown.
 *
 * WHY IT IS ITS OWN PAGE. It was the third tab of the billing screen, so answering "how many
 * invoices are there and what do they add up to" meant loading the subscription surface first and
 * then finding the tab. "invoice tách page đi, muốn theo dõi hóa đơn có bao nhiêu khó quá." The
 * outstanding and paid totals are the first row of the page, because they were the question.
 *
 * WHY PAYMENTS IS FOLDED IN. Payments was a sibling page built from the same template — a two-row
 * summary, then a ruled list of name / date / amount / status — and with one payment per invoice
 * it showed the same numbers. The owner, 2026-09-17: "2 page payment và invoice đang bị giống
 * nhau". Merged the way OpenAI's Billing history is: the invoice table, then a short "Payment
 * attempts" list that renders ONLY when something did not go through (pending, failed, cancelled,
 * refunded, disputed) — a paid payment is already on screen as the invoice it settled. The
 * attempts are not matched to invoice rows: `PaymentTransactionDto` carries no invoice id, and a
 * guessed link would be worse than none. The old /settings/billing/payments address forwards here
 * from the proxy.
 *
 * PAYING FROM HERE. An Owner gets a Pay button on every invoice the server would accept payment
 * for (lib/billing/invoice-payment), which opens Stripe checkout and returns through the payment
 * success page, where the payment — and so the invoice — is settled. Owner only, matching the
 * server: an Admin reads invoices but does not spend the workspace's money.
 *
 * THE FRAME is the Billing page's: one surface, rows ruled by 1px hairlines edge to edge, no
 * cards, no gaps, no shadows, no ground of its own. See ../components/billing-primitives.
 */

import { ArrowSquareOut, Spinner } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { useWorkspaceRole, useWorkspaceRoleLoaded } from "@/hooks/use-workspace-role";
import { useInvoiceCheckout, useWorkspacePaymentHistory } from "@/hooks/use-workspace-payments";
import { apiErrorCode, getErrorMessage } from "@/lib/api/errors";
import {
  invoicePeriodOf,
  isInvoicePayable,
  isUnsuccessfulPayment,
  paymentMethodLabel,
  paymentStatusOf,
} from "@/lib/billing/invoice-payment";
import { formatMoney } from "@/lib/format/currency";
import { billingService } from "@/services/billing.service";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { cn } from "@/lib/utils";
import type { InvoiceDto } from "@/types/billing";

import { BillingButton, GridRow, StatCell } from "../components/billing-primitives";

const PAGE_SIZE = 20;
/** The newest payments of the current subscription; attempts are filtered out of these. */
const PAYMENT_ATTEMPT_WINDOW = 50;

/** The two payment-history answers that are states of the workspace, not faults. */
const HIDDEN_ATTEMPT_CODES = new Set<string | number>([
  404,
  "BILLING_SUBSCRIPTION_NOT_FOUND",
  403,
  "FORBIDDEN",
]);

type InvoicesT = ReturnType<typeof useTranslations>;

function statusOf(invoice: { paidAt: string | null; status?: string | null }, t: InvoicesT) {
  if (invoice.paidAt) return { label: t("status.paid"), tone: "paid" as const };
  if ((invoice.status ?? "").toLowerCase() === "void") {
    return { label: t("status.void"), tone: "void" as const };
  }
  return { label: t("status.unpaid"), tone: "unpaid" as const };
}

const shortDate = (value: string) => format(new Date(value), "MMM d, yyyy");

function periodLabel(invoice: InvoiceDto): string {
  const period = invoicePeriodOf(invoice.lineItems);
  if (!period) return "—";
  return `${format(new Date(period.start), "MMM d")}–${format(new Date(period.end), "MMM d, yyyy")}`;
}

const TH = "whitespace-nowrap border-b border-hairline px-4 py-2.5 text-[12px] font-medium text-ink-muted first:pl-4 sm:first:pl-6 last:pr-4 sm:last:pr-6";
const TD = "whitespace-nowrap px-4 py-3 first:pl-4 sm:first:pl-6 last:pr-4 sm:last:pr-6";

export default function WorkspaceInvoicesPage() {
  const t = useTranslations("settingsBillingInvoices");
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const workspaceId = activeWorkspaceId || "";
  const role = useWorkspaceRole();
  const roleLoaded = useWorkspaceRoleLoaded();
  const [page, setPage] = useState(1);
  const isOwner = role === "owner";
  const canView = role === "owner" || role === "admin";
  const checkout = useInvoiceCheckout();
  // Which row's button is spinning. The mutation's own `variables` would do, but it is cleared on
  // error before the toast renders, and every other row must stay clickable meanwhile.
  const [payingInvoiceId, setPayingInvoiceId] = useState<string | null>(null);

  // Back from Stripe restores this page from the back/forward cache with the spinner still set and
  // every Pay button disabled. `pageshow` with `persisted` is exactly that return.
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setPayingInvoiceId(null);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  const payInvoice = (invoiceId: string) => {
    setPayingInvoiceId(invoiceId);
    checkout.mutate(invoiceId, {
      onError: (error) => {
        setPayingInvoiceId(null);
        toast.error(getErrorMessage(error, t("checkoutError")));
      },
    });
  };

  const { data, isLoading } = useQuery({
    queryKey: ["billing", "invoices", workspaceId, page],
    queryFn: () => billingService.getWorkspaceInvoices(workspaceId, page, PAGE_SIZE),
    enabled: !!workspaceId && canView,
    retry: 1,
  });

  const invoices = useMemo(() => data?.items ?? [], [data]);

  // Only invoices that were actually PAID count towards "paid to date". Counting issued-but-unpaid
  // ones would tell an owner they have spent money they still owe. Void is owed by nobody.
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

  // Until the role resolves, `useWorkspaceRole` reads as "member" — rendering the refusal then
  // would flash "only Owners" at the very Owner the page is for.
  if (!roleLoaded) {
    return (
      <div className="flex h-[160px] items-center justify-center">
        <Spinner className="h-5 w-5 animate-spin text-ink-muted" />
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="px-4 py-4 text-[13px] text-ink-muted">
        {t("accessDenied")}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col text-ink">
      <GridRow>
        <h2 className="text-[14px] font-semibold leading-tight text-ink">{t("title")}</h2>
        <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">
          {isLoading
            ? t("loading")
            : t("countIssued", { count: total })}
        </p>
      </GridRow>

      {/* Stacked on a phone, where the first cell's bottom rule is the line between them; side by
          side from sm, where that rule becomes the vertical one. */}
      <div className="grid sm:grid-cols-2">
        <StatCell
          label={t("outstanding.label")}
          className="sm:border-r"
          value={formatMoney(summary.outstandingTotal, summary.currency)}
          tone={summary.outstandingCount > 0 ? "warn" : "default"}
          lines={[
            summary.outstandingCount > 0
              ? t("outstanding.awaitingPayment", { count: summary.outstandingCount })
              : t("outstanding.nothing"),
          ]}
        />
        <StatCell
          label={t("paidToDate.label")}
          value={formatMoney(summary.paidTotal, summary.currency)}
          lines={[t("paidToDate.count", { count: summary.paidCount })]}
        />
      </div>

      {isLoading ? (
        <GridRow className="flex h-[160px] items-center justify-center">
          <Spinner className="h-5 w-5 animate-spin text-ink-muted" />
        </GridRow>
      ) : invoices.length === 0 ? (
        <GridRow className="py-10 text-center text-[13px] text-ink-muted">
          {t("noInvoices")}
        </GridRow>
      ) : (
        <div className="min-w-0 overflow-x-auto border-b border-hairline">
          <table className="w-full min-w-[760px] border-collapse text-left text-[13px]">
            <thead>
              <tr>
                <th scope="col" className={TH}>{t("table.number")}</th>
                <th scope="col" className={TH}>{t("table.period")}</th>
                <th scope="col" className={TH}>{t("table.issued")}</th>
                <th scope="col" className={TH}>{t("table.due")}</th>
                <th scope="col" className={cn(TH, "text-right")}>{t("table.amount")}</th>
                <th scope="col" className={TH}>{t("table.status")}</th>
                <th scope="col" className={TH}>
                  <span className="sr-only">{t("table.actionsSr")}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {invoices.map((invoice) => {
                const status = statusOf(invoice, t);
                return (
                  <tr key={invoice.id}>
                    <td className={cn(TD, "font-mono text-ink")}>{invoice.invoiceNumber}</td>
                    <td className={cn(TD, "text-ink-muted")}>{periodLabel(invoice)}</td>
                    <td className={cn(TD, "text-ink-muted")}>{shortDate(invoice.issuedAt)}</td>
                    <td className={cn(TD, "text-ink-muted")}>
                      {invoice.dueAt ? shortDate(invoice.dueAt) : "—"}
                    </td>
                    <td className={cn(TD, "text-right font-medium tabular-nums text-ink")}>
                      {formatMoney(invoice.total, invoice.currency)}
                    </td>
                    <td className={TD}>
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
                    </td>
                    <td className={TD}>
                      <div className="flex items-center justify-end gap-3">
                        {/* Owner only, and only on an invoice the server will take payment for. On
                            success the browser leaves for Stripe, so the spinner never clears here. */}
                        {isOwner && isInvoicePayable(invoice) ? (
                          <BillingButton
                            tone="primary"
                            className="w-auto px-3"
                            disabled={payingInvoiceId !== null}
                            onClick={() => payInvoice(invoice.id)}
                          >
                            {payingInvoiceId === invoice.id ? (
                              <Spinner className="h-3.5 w-3.5 animate-spin" />
                            ) : null}
                            {t("pay")}
                          </BillingButton>
                        ) : null}
                        {/* Only a real http(s) URL becomes a link. `pdfUrl` is nullable and has
                            been seen carrying a storage key rather than a URL, which renders as a
                            link that navigates nowhere. */}
                        {invoice.pdfUrl && invoice.pdfUrl.startsWith("http") ? (
                          <a
                            href={invoice.pdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[12px] text-ink-muted transition-colors hover:text-ink"
                          >
                            {t("pdf")}
                            <ArrowSquareOut className="h-3.5 w-3.5" />
                          </a>
                        ) : (
                          <span className="w-[34px]" aria-hidden />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 ? (
        <GridRow className="flex items-center justify-between gap-3 py-3">
          <p className="text-[12px] text-ink-muted">
            {t("pagination.pageOf", { page, totalPages })}
          </p>
          <div className="flex items-center gap-2">
            <BillingButton
              tone="outline"
              className="w-auto px-3"
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              {t("pagination.previous")}
            </BillingButton>
            <BillingButton
              tone="outline"
              className="w-auto px-3"
              disabled={page >= totalPages}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            >
              {t("pagination.next")}
            </BillingButton>
          </div>
        </GridRow>
      ) : null}

      <PaymentAttempts workspaceId={workspaceId} />
    </div>
  );
}

/**
 * The payments that did not go through, or nothing at all.
 *
 * Its own component so its loading and failure never touch the invoice table above: the two come
 * from different endpoints, and a payment-history fault must not hide what was invoiced.
 */
function PaymentAttempts({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations("settingsBillingInvoices");
  const { data, isError, error, refetch, isFetching } = useWorkspacePaymentHistory(
    workspaceId || null,
    1,
    PAYMENT_ATTEMPT_WINDOW,
  );

  const attempts = useMemo(
    () => (data?.items ?? []).filter((payment) => isUnsuccessfulPayment(payment.status)),
    [data],
  );

  if (isError) {
    const code = apiErrorCode(error);
    // No subscription, or not allowed: states of the workspace, not faults — say nothing.
    if (code !== undefined && HIDDEN_ATTEMPT_CODES.has(code)) return null;
    return (
      <GridRow className="flex flex-wrap items-center justify-between gap-3 py-3">
        <p className="text-[12px] text-ink-muted">{t("paymentAttempts.loadError")}</p>
        <BillingButton
          tone="outline"
          className="w-auto px-3"
          disabled={isFetching}
          onClick={() => void refetch()}
        >
          {t("paymentAttempts.tryAgain")}
        </BillingButton>
      </GridRow>
    );
  }

  if (attempts.length === 0) return null;

  return (
    <div className="flex min-w-0 flex-col">
      <GridRow className="py-3">
        <h3 className="text-[14px] font-semibold leading-tight text-ink">
          {t("paymentAttempts.title")}
        </h3>
        <p className="mt-1 text-[12px] text-ink-muted">{t("paymentAttempts.subtitle")}</p>
      </GridRow>
      {attempts.map((payment) => {
        const status = paymentStatusOf(payment.status);
        const when = payment.paidAt ?? payment.createdAt;
        return (
          <GridRow
            key={payment.id}
            className="flex flex-col gap-1 py-3 text-[13px] sm:flex-row sm:items-baseline sm:gap-4"
          >
            <span className="shrink-0 text-ink-muted sm:w-[110px]">{shortDate(when)}</span>
            <span className="min-w-0 truncate text-ink sm:w-[160px] sm:shrink-0">
              {paymentMethodLabel(payment.provider, payment.paymentMethod)}
            </span>
            <span className="shrink-0 font-medium tabular-nums text-ink sm:w-[140px] sm:text-right">
              {formatMoney(payment.totalAmount, payment.currency)}
            </span>
            <span className="min-w-0 text-[12px]">
              <span
                className={cn(
                  "font-medium",
                  status.tone === "pending" && "text-amber-500",
                  status.tone === "failed" && "text-rose-500",
                  (status.tone === "refunded" || status.tone === "other") && "text-ink-subtle",
                )}
              >
                {status.label}
              </span>
              {/* The provider's own reason. Without it a "Failed" row says something went wrong
                  and nothing about whether to retry. */}
              {payment.failureReason ? (
                <span className="text-ink-muted"> — {payment.failureReason}</span>
              ) : null}
            </span>
          </GridRow>
        );
      })}
    </div>
  );
}
