"use client";

/**
 * Payments — every charge recorded against this workspace, beside Invoices.
 *
 * WHY IT IS NOT JUST THE INVOICES PAGE. An invoice is what was owed; a payment is what happened
 * when someone tried to settle it. A failed card, a refund and a pending checkout never produce a
 * paid invoice, so on Invoices they were invisible — an owner asking "did that charge go
 * through?" had nowhere in the app to look. This page answers that question and nothing else.
 *
 * SCOPE, STATED ON THE PAGE. The server returns the payments of the workspace's CURRENT
 * subscription (PaymentService.GetPaymentHistoryAsync). A workspace with no active subscription
 * has no history to show, which the API reports as not-found; that is an empty state here, not an
 * error.
 *
 * Owner and Admin, like Invoices. Paying happens on Invoices, owner only.
 *
 * Rows, ruled — the same primitives as its siblings. See ../components.
 */

import { Spinner } from "@phosphor-icons/react";
import { format } from "date-fns";
import Link from "next/link";
import { useMemo, useState } from "react";

import { useWorkspaceRole, useWorkspaceRoleLoaded } from "@/hooks/use-workspace-role";
import { useWorkspacePaymentHistory } from "@/hooks/use-workspace-payments";
import { apiErrorCode } from "@/lib/api/errors";
import { paymentMethodLabel, paymentStatusOf } from "@/lib/billing/invoice-payment";
import { formatMoney } from "@/lib/format/currency";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/stores/workspace-store";

import {
  BillingButton,
  Row,
  RowGroup,
  Section,
  SectionHeader,
} from "../components/billing-primitives";

const PAGE_SIZE = 20;

/** The two answers that are states of the workspace, not faults. */
const NO_SUBSCRIPTION_CODES = new Set<string | number>([404, "BILLING_SUBSCRIPTION_NOT_FOUND"]);
const FORBIDDEN_CODES = new Set<string | number>([403, "FORBIDDEN"]);

export default function WorkspacePaymentsPage() {
  const workspaceId = useWorkspaceStore((state) => state.activeWorkspaceId) || "";
  const workspaceSlug = useWorkspaceStore((state) => state.activeWorkspaceSlug);
  const role = useWorkspaceRole();
  const roleLoaded = useWorkspaceRoleLoaded();
  const [page, setPage] = useState(1);

  const canView = role === "owner" || role === "admin";
  const { data, isLoading, isError, error, refetch, isFetching } = useWorkspacePaymentHistory(
    canView ? workspaceId : null,
    page,
    PAGE_SIZE,
  );

  const payments = useMemo(() => data?.items ?? [], [data]);
  const total = data?.totalCount ?? payments.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Sums over what is loaded. With more than one page that is not the lifetime figure, so the
  // label says which it is rather than presenting a page's worth as the whole.
  const summary = useMemo(() => {
    const byTone = (tone: string) =>
      payments.filter((payment) => paymentStatusOf(payment.status).tone === tone);
    const paid = byTone("paid");
    return {
      paidTotal: paid.reduce((sum, payment) => sum + payment.totalAmount, 0),
      paidCount: paid.length,
      pendingCount: byTone("pending").length,
      failedCount: byTone("failed").length,
      currency: payments[0]?.currency,
    };
  }, [payments]);

  const code = isError ? apiErrorCode(error) : undefined;
  const noSubscription = code !== undefined && NO_SUBSCRIPTION_CODES.has(code);
  const forbidden = code !== undefined && FORBIDDEN_CODES.has(code);

  // Until the role resolves, `useWorkspaceRole` reads as "member" — rendering the refusal then
  // would flash "only Owners" at the very Owner the page is for.
  if (!roleLoaded) {
    return (
      <div className="flex h-[160px] items-center justify-center">
        <Spinner className="h-5 w-5 animate-spin text-ink-muted" />
      </div>
    );
  }

  if (!canView || forbidden) {
    return (
      <div className="px-4 py-4 text-[13px] text-ink-muted">
        Only workspace Owners and Administrators can view payments.
      </div>
    );
  }

  const pageScope = totalPages > 1 ? " on this page" : "";

  return (
    <div className="flex flex-col gap-4 px-4 py-4 text-ink">
      <Section>
        <SectionHeader
          title="Payments"
          description={
            isLoading
              ? "Loading…"
              : noSubscription
                ? "This workspace has no active subscription"
                : `${total} payment${total === 1 ? "" : "s"} on this workspace's current subscription`
          }
        />
        <RowGroup>
          <Row
            label={`Paid${pageScope}`}
            value={formatMoney(summary.paidTotal, summary.currency)}
            hint={`${summary.paidCount} payment${summary.paidCount === 1 ? "" : "s"}`}
          />
          <Row
            label={`Not completed${pageScope}`}
            value={summary.pendingCount + summary.failedCount}
            hint={
              summary.pendingCount + summary.failedCount > 0
                ? `${summary.pendingCount} pending, ${summary.failedCount} failed`
                : "Every payment went through"
            }
          />
        </RowGroup>
      </Section>

      <Section>
        <SectionHeader
          title="Payment history"
          actions={
            workspaceSlug ? (
              <Link
                href={`/${workspaceSlug}/settings/billing/invoices`}
                className="text-[12px] text-ink-muted transition-colors hover:text-ink"
              >
                View invoices
              </Link>
            ) : null
          }
        />
        {isLoading ? (
          <div className="flex h-[160px] items-center justify-center">
            <Spinner className="h-5 w-5 animate-spin text-ink-muted" />
          </div>
        ) : noSubscription ? (
          <p className="px-4 py-10 text-center text-[13px] text-ink-muted">
            There is no payment history without an active subscription.
          </p>
        ) : isError ? (
          <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
            <p className="text-[13px] text-ink-muted">Payments could not be loaded.</p>
            <BillingButton
              tone="outline"
              className="w-auto px-3"
              disabled={isFetching}
              onClick={() => void refetch()}
            >
              Try again
            </BillingButton>
          </div>
        ) : payments.length === 0 ? (
          <p className="px-4 py-10 text-center text-[13px] text-ink-muted">
            No payment has been recorded for this workspace yet.
          </p>
        ) : (
          <div className="divide-y divide-hairline">
            {payments.map((payment) => {
              const status = paymentStatusOf(payment.status);
              const when = payment.paidAt ?? payment.createdAt;
              return (
                <div
                  key={payment.id}
                  className="flex items-center justify-between gap-4 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] text-ink">
                      {paymentMethodLabel(payment.provider, payment.paymentMethod)}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-ink-subtle">
                      {payment.paidAt ? "Paid" : "Created"}{" "}
                      {format(new Date(when), "MMM d, yyyy")}
                      {payment.providerTransactionId ? (
                        <span className="font-mono"> · {payment.providerTransactionId}</span>
                      ) : null}
                    </p>
                    {/* The provider's own reason. Without it a "Failed" row tells an owner that
                        something went wrong and nothing about whether to retry. */}
                    {status.tone === "failed" && payment.failureReason ? (
                      <p className="mt-0.5 truncate text-[11px] text-rose-500">
                        {payment.failureReason}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-4">
                    <span
                      className={cn(
                        "text-[12px] font-medium",
                        status.tone === "paid" && "text-emerald-600 dark:text-emerald-400",
                        status.tone === "pending" && "text-amber-500",
                        status.tone === "failed" && "text-rose-500",
                        (status.tone === "refunded" || status.tone === "other") &&
                          "text-ink-subtle",
                      )}
                    >
                      {status.label}
                    </span>
                    <span className="w-[110px] text-right text-[13px] font-medium tabular-nums text-ink">
                      {formatMoney(payment.totalAmount, payment.currency)}
                    </span>
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
