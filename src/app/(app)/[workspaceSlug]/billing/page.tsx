"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  Buildings,
  CalendarBlank,
  Coins,
  CreditCard,
  FileText,
  LockKey,
  Spinner,
  TrendUp,
  Warning,
} from "@phosphor-icons/react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FeatureBreakdownChart } from "@/components/admin/FeatureBreakdownChart";
import { UsageChart } from "@/components/admin/UsageChart";
import { billingService } from "@/services/billing.service";
import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { InvoiceDto } from "@/types/billing";

const CURRENT_MONTH = new Date().getMonth() + 1;
const CURRENT_YEAR = new Date().getFullYear();

function formatDate(value?: string | null) {
  return value ? format(new Date(value), "MMM d, yyyy") : "--";
}

function formatVnd(value?: number | null) {
  if (value == null) return "--";
  return `${new Intl.NumberFormat("vi-VN").format(value)} VND`;
}

function formatInvoiceAmount(invoice: InvoiceDto) {
  return formatVnd(invoice.total ?? invoice.amount ?? 0);
}

function getInvoiceNumber(invoice: InvoiceDto) {
  return invoice.invoiceNumber || invoice.stripeInvoiceId || invoice.id;
}

function isInvoiceOpen(invoice: InvoiceDto) {
  return ["open", "issued"].includes((invoice.status || "").toLowerCase());
}

function getErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null) {
    const responseMessage = (error as { response?: { data?: { message?: unknown } } }).response?.data?.message;
    if (typeof responseMessage === "string") return responseMessage;

    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }

  return fallback;
}

export default function WorkspaceBillingPage() {
  return <WorkspaceEnterpriseBillingContent />;
}

function WorkspaceEnterpriseBillingContent() {
  const workspaceId = useWorkspaceStore((state) => state.activeWorkspaceId) || "";
  const workspaceName = useWorkspaceStore((state) => state.activeWorkspaceName) || "Workspace";
  const role = useWorkspaceStore((state) => state.role);
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const canViewBilling = role === "Owner" || role === "Admin";
  const [nowMs] = useState(() => Date.now());

  const { data: subscription, isLoading: isSubscriptionLoading } = useQuery({
    queryKey: ["billing", "subscription", workspaceId],
    queryFn: () => billingService.getActiveSubscription(workspaceId),
    enabled: !!workspaceId && canViewBilling,
    retry: 1,
  });

  const hasSubscription = !!subscription;

  const { data: balance, isLoading: isBalanceLoading } = useQuery({
    queryKey: ["billing", "balance", workspaceId],
    queryFn: () => billingService.getWorkspaceCredits(workspaceId),
    enabled: !!workspaceId && canViewBilling && hasSubscription,
    retry: 1,
  });

  const { isLoading: isReportLoading } = useQuery({
    queryKey: ["billing", "report", workspaceId, CURRENT_YEAR, CURRENT_MONTH],
    queryFn: () => billingService.getBillingReport(workspaceId, CURRENT_MONTH, CURRENT_YEAR),
    enabled: !!workspaceId && canViewBilling && hasSubscription,
    retry: 1,
  });

  const { data: invoicesPage, isLoading: isInvoicesLoading } = useQuery({
    queryKey: ["billing", "invoices", workspaceId],
    queryFn: () => billingService.getWorkspaceInvoices(workspaceId, 1, 5),
    enabled: !!workspaceId && canViewBilling && hasSubscription,
    retry: 1,
  });

  const isLoading = isBalanceLoading || isSubscriptionLoading || isReportLoading;
  const hasTrialPeriod = !!subscription?.trialEndsAt;
  const isTrial = hasTrialPeriod && new Date(subscription.trialEndsAt!).getTime() > nowMs;
  const isTrialEnded = hasTrialPeriod && !isTrial;
  const trialEndsAt = formatDate(subscription?.trialEndsAt);
  const currentCredits = balance?.currentCredits ?? subscription?.creditsRemaining ?? 0;
  const cycleCredits = subscription?.effectiveCreditsPerCycle ?? balance?.totalCredits ?? 0;
  const consumedCredits = Math.max(0, (balance?.totalCredits ?? cycleCredits) - currentCredits);
  const usagePercent = cycleCredits > 0 ? Math.min(100, Math.round((consumedCredits / cycleCredits) * 100)) : 0;
  const invoiceTerms = subscription?.effectiveInvoiceTermsDays ?? subscription?.invoiceTermsDaysOverride ?? 15;
  const extraUsageCap = subscription?.effectiveOverageCapCredits ?? subscription?.overageCapCreditsOverride ?? 0;
  const invoices = invoicesPage?.items ?? [];
  const shouldShowNoBillingPlan = !!workspaceId && !isSubscriptionLoading && !hasSubscription;

  const startTrialMutation = useMutation({
    mutationFn: () => {
      if (!workspaceId || !user?.id || !user.email) {
        throw new Error("Missing workspace owner account");
      }

      return billingService.createTrialSubscription({
        workspaceId,
        userId: user.id,
        ownerEmail: user.email,
      });
    },
    onSuccess: () => {
      toast.success("14-day Enterprise trial started");
      queryClient.invalidateQueries({ queryKey: ["billing", "subscription", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["billing", "balance", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["billing", "invoices", workspaceId] });
    },
    onError: (err: unknown) => {
      toast.error(getErrorMessage(err, "Could not start Enterprise trial"));
    },
  });

  const createInvoiceCheckoutMutation = useMutation({
    mutationFn: (invoice: InvoiceDto) => billingService.createInvoiceCheckout(invoice.id),
    onSuccess: ({ url }) => {
      window.open(url, "_blank", "noopener,noreferrer");
    },
  });

  const statusTone = useMemo(() => {
    const state = subscription?.serviceState?.toLowerCase();
    if (state === "suspended") return "destructive";
    if (hasTrialPeriod) return "secondary";
    return "default";
  }, [subscription?.serviceState, hasTrialPeriod]);

  const serviceSuspendedMessage =
    subscription?.suspendedReason === "trial_ended"
      ? "The Enterprise trial has ended. Contact WarpTalk billing to finalize contract terms before AI usage can resume."
      : subscription?.suspendedReason === "overage_cap"
        ? "This workspace reached the agreed extra usage cap. WarpTalk billing must update the contract terms before AI usage can resume."
        : subscription?.suspendedReason === "invoice_overdue"
          ? "An invoice is overdue beyond the grace period. AI usage resumes after payment is confirmed."
          : subscription?.suspendedReason || "Resolve the billing status with WarpTalk billing to resume AI usage.";

  const subscriptionStatusLabel =
    subscription?.serviceState === "suspended" && subscription?.suspendedReason === "trial_ended"
      ? "Trial ended"
      : isTrial
        ? "Trial active"
        : subscription?.status || "Pending";

  if (!canViewBilling) {
    return (
      <div className="flex h-full items-center justify-center bg-canvas p-6">
        <Card className="max-w-md rounded-md border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <LockKey size={18} />
              Enterprise billing is restricted
            </CardTitle>
            <CardDescription>
              Only workspace Owners and Administrators can view Enterprise trial and invoice status.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <main className="min-h-full bg-canvas p-6 text-ink">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <header className="border-b border-border pb-5">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {!shouldShowNoBillingPlan && (
                <Badge variant={statusTone as "default" | "secondary" | "destructive"}>
                  {subscription?.serviceState === "suspended"
                  ? "Suspended"
                  : isTrial
                    ? "Enterprise trial"
                    : isTrialEnded
                      ? "Trial ended"
                    : "Enterprise billing"}
                </Badge>
              )}
              <span className="text-xs text-ink-muted">{workspaceName}</span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">Enterprise Billing</h1>
            <p className="mt-1 max-w-2xl text-sm text-ink-muted">
              Review trial access, contract status, open invoices, and Enterprise usage for this workspace.
            </p>
          </div>
        </header>

        {shouldShowNoBillingPlan && (
          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
            <Card className="rounded-md border-border">
              <CardHeader>
                <CardTitle className="text-xl">No billing plan yet</CardTitle>
                <CardDescription>
                  Start the self-service Enterprise trial for this workspace. Approved contract terms and invoices are handled later by WarpTalk billing.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <StatusRow label="Trial length" value="14 days" />
                  <StatusRow label="Trial credits" value="20,000 credits" />
                  <StatusRow label="Extra usage" value="Disabled during trial" />
                  <StatusRow label="Contract flow" value="Admin creates approved terms" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => startTrialMutation.mutate()}
                    disabled={startTrialMutation.isPending || !user?.id || !user.email}
                    className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/80 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {startTrialMutation.isPending ? "Starting trial..." : "Start 14-day trial"}
                  </button>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-md border-border">
              <CardHeader>
                <CardTitle className="text-base">What happens next</CardTitle>
                <CardDescription>
                  Trial usage stays separate from the paid contract. Finance only receives invoices after an Enterprise contract is approved and a billing cycle closes.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-ink-muted">
                <div className="rounded-md border border-border bg-surface-1 p-3">
                  Trial gives the team enough credits to test meetings, transcripts, and AI summaries without extra usage charges.
                </div>
                <div className="rounded-md border border-border bg-surface-1 p-3">
                  When procurement approves, WarpTalk admin saves the negotiated credits, price before VAT, overage cap, and NET terms.
                </div>
                <div className="rounded-md border border-border bg-surface-1 p-3">
                  Open invoices can be paid online by the workspace owner after the billing cycle closes.
                </div>
              </CardContent>
            </Card>
          </section>
        )}

        {!shouldShowNoBillingPlan && (
          <>
        {subscription?.serviceState === "suspended" && (
          <Card className="rounded-md border-destructive/30 bg-destructive/5">
            <CardContent className="flex items-start gap-3 p-4">
              <Warning className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <div>
                <div className="text-sm font-medium text-destructive">AI service is currently suspended</div>
                <p className="mt-1 text-sm text-ink-muted">
                  {serviceSuspendedMessage}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <section className={`grid gap-4 md:grid-cols-2 ${hasTrialPeriod ? "xl:grid-cols-3" : "xl:grid-cols-4"}`}>
          <MetricCard
            icon={Coins}
            title="Credits remaining"
            value={isLoading ? "Loading..." : new Intl.NumberFormat("vi-VN").format(currentCredits)}
            detail={`${usagePercent}% of current cycle used`}
          />
          <MetricCard
            icon={CalendarBlank}
            title={hasTrialPeriod ? (isTrial ? "Trial ends" : "Trial ended") : "Cycle renews"}
            value={isLoading ? "Loading..." : hasTrialPeriod ? trialEndsAt : formatDate(balance?.currentPeriodEnd ?? subscription?.currentPeriodEnd)}
            detail={hasTrialPeriod ? "Trial does not create invoices or extra usage" : `Net ${invoiceTerms} invoice terms`}
          />
          <MetricCard
            icon={Buildings}
            title={hasTrialPeriod ? "Trial package" : "Enterprise package"}
            value={hasTrialPeriod ? "Enterprise trial" : subscription?.planName || "Enterprise"}
            detail={hasTrialPeriod
              ? `${new Intl.NumberFormat("vi-VN").format(cycleCredits)} trial credits`
              : `${new Intl.NumberFormat("vi-VN").format(cycleCredits)} credits per cycle`}
          />
          {!hasTrialPeriod && (
            <MetricCard
              icon={TrendUp}
              title="Extra usage cap"
              value={new Intl.NumberFormat("vi-VN").format(extraUsageCap)}
              detail="Extra usage is invoiced after the cycle closes"
            />
          )}
        </section>

        <Card className="rounded-md border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{hasTrialPeriod ? "Trial status" : "Contract status"}</CardTitle>
            <CardDescription>
              {hasTrialPeriod
                ? "Trial usage is free and does not create invoices or extra usage charges."
                : "Workspace billing is handled as one Enterprise contract flow."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <StatusRow label="Status" value={subscriptionStatusLabel} />
            <StatusRow label="Billing contact" value={subscription?.billingContactEmail || "billing@warptalk.com"} />
            {hasTrialPeriod ? (
              <>
                <StatusRow label="Extra usage" value="Disabled" />
                <StatusRow label="Next step" value="Approve Enterprise contract terms" />
              </>
            ) : (
              <>
                <StatusRow label="Contract value" value={formatVnd(subscription?.effectiveContractPriceVnd ?? subscription?.contractPriceVnd)} />
                <StatusRow label="Invoice terms" value={`Net ${invoiceTerms}`} />
              </>
            )}
          </CardContent>
        </Card>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.85fr)]">
          <Card className="rounded-md border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CreditCard size={18} />
                {hasTrialPeriod ? "Trial usage" : "Current cycle usage"}
              </CardTitle>
              <CardDescription>
                {hasTrialPeriod
                  ? "Trial credits are consumed by meetings, transcripts, and AI summaries."
                  : "Usage is tracked for Enterprise review and invoice reconciliation."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4 h-2 rounded-full bg-surface-2">
                <div className="h-2 rounded-full bg-primary" style={{ width: `${usagePercent}%` }} />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <StatusRow label="Consumed" value={new Intl.NumberFormat("vi-VN").format(consumedCredits)} />
                <StatusRow label="Remaining" value={new Intl.NumberFormat("vi-VN").format(currentCredits)} />
                <StatusRow label={hasTrialPeriod ? "Trial total" : "Cycle total"} value={new Intl.NumberFormat("vi-VN").format(cycleCredits)} />
              </div>
              {isLoading && (
                <div className="mt-4 flex items-center gap-2 text-sm text-ink-muted">
                  <Spinner className="h-4 w-4 animate-spin" />
                  Loading Enterprise billing data
                </div>
              )}
            </CardContent>
          </Card>

          {hasTrialPeriod ? (
            <Card className="rounded-md border-border">
              <CardHeader>
                <CardTitle className="text-base">After the trial</CardTitle>
                <CardDescription>
                  WarpTalk admin finalizes the approved Enterprise contract before paid billing begins.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <StatusRow label="Contract price" value="Set after approval" />
                <StatusRow label="Invoices" value="Not created during trial" />
                <StatusRow label="Extra usage" value="Unavailable during trial" />
              </CardContent>
            </Card>
          ) : (
            <Card className="rounded-md border-border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText size={18} />
                  Recent invoices
                </CardTitle>
                <CardDescription>Pay open Enterprise invoices online when the billing cycle closes.</CardDescription>
              </CardHeader>
              <CardContent>
                {isInvoicesLoading ? (
                  <div className="flex items-center gap-2 text-sm text-ink-muted">
                    <Spinner className="h-4 w-4 animate-spin" />
                    Loading invoices
                  </div>
                ) : invoices.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border p-4 text-sm text-ink-muted">
                    No invoices yet. Usage will stay visible here until an Enterprise billing cycle closes.
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {invoices.map((invoice) => (
                      <div key={invoice.id} className="flex items-center justify-between gap-3 py-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{getInvoiceNumber(invoice)}</div>
                          <div className="text-xs text-ink-muted">{formatDate(invoice.createdAt)}</div>
                        </div>
                        <div className="flex shrink-0 items-center gap-3 text-right">
                          {isInvoiceOpen(invoice) && (
                            <button
                              type="button"
                              onClick={() => createInvoiceCheckoutMutation.mutate(invoice)}
                              disabled={createInvoiceCheckoutMutation.isPending}
                              className="inline-flex h-8 items-center justify-center rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground transition hover:bg-primary/80 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {createInvoiceCheckoutMutation.isPending ? "Opening..." : "Pay online"}
                            </button>
                          )}
                          <div>
                            <div className="text-sm font-semibold">{formatInvoiceAmount(invoice)}</div>
                            <div className="text-xs capitalize text-ink-muted">{invoice.status}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </section>

        {!hasTrialPeriod && (
          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.85fr)]">
            <UsageChart workspaceId={workspaceId} />
            <FeatureBreakdownChart workspaceId={workspaceId} />
          </section>
        )}
          </>
        )}
      </div>
    </main>
  );
}

function MetricCard({
  icon: Icon,
  title,
  value,
  detail,
}: {
  icon: React.ElementType;
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <Card className="rounded-md border-border">
      <CardContent className="p-4">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-xs font-medium text-ink-muted">{title}</div>
          <Icon className="h-4 w-4 text-ink-muted" />
        </div>
        <div className="truncate text-2xl font-semibold tracking-tight">{value}</div>
        <div className="mt-1 text-xs text-ink-muted">{detail}</div>
      </CardContent>
    </Card>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-surface-1 p-3">
      <div className="text-xs text-ink-muted">{label}</div>
      <div className="mt-1 truncate text-sm font-medium text-ink">{value}</div>
    </div>
  );
}
