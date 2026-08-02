"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useParams } from "next/navigation";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FeatureBreakdownChart } from "@/components/admin/FeatureBreakdownChart";
import { UsageChart } from "@/components/admin/UsageChart";
import { getLanguageName, SUPPORTED_LANGUAGES } from "@/lib/languages";
import { billingService } from "@/services/billing.service";
import { WorkspaceService } from "@/services/workspace.service";
import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { InvoiceDto } from "@/types/billing";

const CURRENT_MONTH = new Date().getMonth() + 1;
const CURRENT_YEAR = new Date().getFullYear();
const BILLING_REALTIME_REFETCH_MS = 10_000;
const TRIAL_WORKSPACE_MEMBER_LIMIT = 5;
const MAX_REQUESTED_MONTHLY_CREDITS = 10_000_000;
const MAX_REQUESTED_WORKSPACE_MEMBERS = 10_000;
const MAX_ENTERPRISE_LANGUAGES = 3;
const CONTRACT_LANGUAGE_CODES = ["en", "vi", "ja"];
const CONTRACT_LANGUAGE_OPTIONS = SUPPORTED_LANGUAGES.filter((language) =>
  CONTRACT_LANGUAGE_CODES.includes(language.code),
);
const DEFAULT_AI_SERVICE_OPTIONS = [
  "Real-time translation",
  "Meeting transcripts",
  "AI meeting summaries",
];
const CONTRACT_AI_SERVICE_OPTIONS = [
  ...DEFAULT_AI_SERVICE_OPTIONS,
  "Voice translation / TTS",
  "Voice cloning",
  "Glossary access",
  "Google Meet integration",
];
const GOOGLE_MEET_INTEGRATION_LABEL = "Google Meet integration";
const PAYMENT_TERM_OPTIONS = ["Net 15", "Net 30"];

function formatDate(value?: string | null) {
  return value ? format(new Date(value), "MMM d, yyyy") : "--";
}

function formatVnd(value?: number | null) {
  if (value == null) return "--";
  return `${new Intl.NumberFormat("vi-VN").format(value)} VND`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("vi-VN").format(value);
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

function splitContactName(fullName?: string | null, email?: string | null) {
  const fallback = email?.split("@")[0] || "Workspace";
  const parts = (fullName || fallback).trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] || fallback;
  const lastName = parts.slice(1).join(" ") || "Owner";
  return { firstName, lastName };
}

function toggleStringValue(values: string[], value: string) {
  return values.includes(value)
    ? values.filter((selectedValue) => selectedValue !== value)
    : [...values, value];
}

export default function WorkspaceBillingPage() {
  return <WorkspaceEnterpriseBillingContent />;
}

function WorkspaceEnterpriseBillingContent() {
  const params = useParams<{ workspaceSlug: string }>();
  const routeWorkspaceSlug = params.workspaceSlug;
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const activeWorkspaceName = useWorkspaceStore((state) => state.activeWorkspaceName);
  const activeWorkspaceSlug = useWorkspaceStore((state) => state.activeWorkspaceSlug);
  const activeWorkspaceDefaultLanguage = useWorkspaceStore((state) => state.defaultLanguage);
  const activeRole = useWorkspaceStore((state) => state.role);
  const setActiveWorkspace = useWorkspaceStore((state) => state.setActiveWorkspace);
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const [nowMs] = useState(() => Date.now());
  const [workspaceLookupTimedOut, setWorkspaceLookupTimedOut] = useState(false);
  const [isContractRequestOpen, setIsContractRequestOpen] = useState(false);
  const [contractRequest, setContractRequest] = useState({
    companyLegalName: activeWorkspaceName ?? "",
    billingContactName: user?.fullName ?? "",
    billingContactEmail: user?.email ?? "",
    requestedMonthlyCredits: "",
    invoiceEmail: user?.email ?? "",
    paymentTerms: "",
    requestedWorkspaceMembers: String(TRIAL_WORKSPACE_MEMBER_LIMIT),
    requestedLanguages: ["en", "vi"],
    requestedAiServices: DEFAULT_AI_SERVICE_OPTIONS,
  });

  const shouldResolveWorkspaceFromSlug = !!routeWorkspaceSlug;
  const { data: workspaceLookup, isLoading: isWorkspaceLookupLoading, isError: isWorkspaceLookupError } = useQuery({
    queryKey: ["billing", "workspace-by-slug", routeWorkspaceSlug],
    queryFn: () => WorkspaceService.list(1, 20, routeWorkspaceSlug),
    enabled: shouldResolveWorkspaceFromSlug,
    retry: 1,
  });

  const routeWorkspace = useMemo(() => {
    if (!shouldResolveWorkspaceFromSlug) return null;
    return workspaceLookup?.items?.find((workspace) => workspace.slug === routeWorkspaceSlug) ?? null;
  }, [routeWorkspaceSlug, shouldResolveWorkspaceFromSlug, workspaceLookup?.items]);

  const workspaceId = routeWorkspace?.id ?? (!shouldResolveWorkspaceFromSlug ? activeWorkspaceId : "") ?? "";
  const workspaceName = routeWorkspace?.name ?? (!shouldResolveWorkspaceFromSlug ? activeWorkspaceName : null) ?? "Workspace";
  const role = (routeWorkspace?.role ?? (!shouldResolveWorkspaceFromSlug ? activeRole : null) ?? "").toLowerCase();
  const isSystemBillingAdmin = user?.roles?.some((userRole) => userRole.toLowerCase() === "admin") ?? false;
  const canViewBilling = role === "owner" || role === "admin" || isSystemBillingAdmin;

  useEffect(() => {
    if (!routeWorkspace) return;
    setActiveWorkspace(
      routeWorkspace.id,
      routeWorkspace.name,
      routeWorkspace.slug,
      routeWorkspace.role,
      routeWorkspace.membershipType ?? null,
      routeWorkspace.defaultLanguage ?? null,
    );
  }, [routeWorkspace, setActiveWorkspace]);

  useEffect(() => {
    if (!shouldResolveWorkspaceFromSlug || routeWorkspace || isWorkspaceLookupError) {
      setWorkspaceLookupTimedOut(false);
      return;
    }

    const timeout = window.setTimeout(() => setWorkspaceLookupTimedOut(true), 8000);
    return () => window.clearTimeout(timeout);
  }, [isWorkspaceLookupError, routeWorkspace, routeWorkspaceSlug, shouldResolveWorkspaceFromSlug]);

  useEffect(() => {
    setContractRequest((current) => ({
      ...current,
      companyLegalName: current.companyLegalName || workspaceName,
      billingContactName: current.billingContactName || user?.fullName || "",
      billingContactEmail: current.billingContactEmail || user?.email || "",
      invoiceEmail: current.invoiceEmail || user?.email || "",
    }));
  }, [user?.email, user?.fullName, workspaceName]);

  const { data: subscription, isLoading: isSubscriptionLoading } = useQuery({
    queryKey: ["billing", "subscription", workspaceId],
    queryFn: () => billingService.getActiveSubscription(workspaceId),
    enabled: !!workspaceId && canViewBilling,
    refetchInterval: BILLING_REALTIME_REFETCH_MS,
    retry: 1,
  });

  const { data: pricingConfig } = useQuery({
    queryKey: ["billing", "pricing-config"],
    queryFn: () => billingService.getPricingConfig(),
    enabled: !!workspaceId && canViewBilling,
    retry: 1,
  });

  const hasSubscription = !!subscription;

  const { data: balance, isLoading: isBalanceLoading } = useQuery({
    queryKey: ["billing", "balance", workspaceId],
    queryFn: () => billingService.getWorkspaceCredits(workspaceId),
    enabled: !!workspaceId && canViewBilling && hasSubscription,
    refetchInterval: BILLING_REALTIME_REFETCH_MS,
    retry: 1,
  });

  const { isLoading: isReportLoading } = useQuery({
    queryKey: ["billing", "report", workspaceId, CURRENT_YEAR, CURRENT_MONTH],
    queryFn: () => billingService.getBillingReport(workspaceId, CURRENT_MONTH, CURRENT_YEAR),
    enabled: !!workspaceId && canViewBilling && hasSubscription,
    refetchInterval: BILLING_REALTIME_REFETCH_MS,
    retry: 1,
  });

  const { data: invoicesPage, isLoading: isInvoicesLoading } = useQuery({
    queryKey: ["billing", "invoices", workspaceId],
    queryFn: () => billingService.getWorkspaceInvoices(workspaceId, 1, 5),
    enabled: !!workspaceId && canViewBilling && hasSubscription,
    refetchInterval: BILLING_REALTIME_REFETCH_MS,
    retry: 1,
  });

  const { data: salesInquiryPage, isLoading: isSalesInquiryLoading } = useQuery({
    queryKey: ["sales-inquiries", "workspace", workspaceId],
    queryFn: () => billingService.getSalesInquiries(1, 5, { workspaceId }),
    enabled: !!workspaceId && canViewBilling && !!subscription?.trialEndsAt,
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
  const invoiceTerms = subscription?.effectiveInvoiceTermsDays
    ?? subscription?.invoiceTermsDaysOverride
    ?? pricingConfig?.defaultInvoiceTermsDays
    ?? 0;
  const defaultPaymentTerms = invoiceTerms > 0 ? `Net ${invoiceTerms}` : "Net 15";
  const paymentTermOptions = useMemo(
    () => Array.from(new Set([defaultPaymentTerms, ...PAYMENT_TERM_OPTIONS])),
    [defaultPaymentTerms],
  );
  const extraUsageCap = subscription?.effectiveOverageCapCredits ?? subscription?.overageCapCreditsOverride ?? 0;
  const invoices = invoicesPage?.items ?? [];
  const latestContractInquiry = salesInquiryPage?.items?.find((inquiry) =>
    inquiry.requestType === "enterprise_contract_request",
  ) ?? null;
  const hasPendingContractInquiry = latestContractInquiry
    ? !["converted", "closed"].includes(latestContractInquiry.status.toLowerCase())
    : false;
  const shouldShowNoBillingPlan = !!workspaceId && !isSubscriptionLoading && !hasSubscription;
  const workspaceDefaultLanguage = routeWorkspace?.defaultLanguage ?? activeWorkspaceDefaultLanguage ?? "en";

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
      toast.success("Enterprise trial started");
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
      window.location.assign(url);
    },
  });

  const requestContractMutation = useMutation({
    mutationFn: () => {
      if (!workspaceId || !user?.email) {
        throw new Error("Missing workspace owner account");
      }

      const { firstName, lastName } = splitContactName(user.fullName, user.email);
      const companyLegalName = contractRequest.companyLegalName.trim();
      const billingContactName = contractRequest.billingContactName.trim();
      const billingContactEmail = contractRequest.billingContactEmail.trim();
      const requestedMonthlyCredits = contractRequest.requestedMonthlyCredits.trim();
      const invoiceEmail = contractRequest.invoiceEmail.trim();
      const paymentTerms = contractRequest.paymentTerms.trim();
      const effectivePaymentTerms = paymentTerms || defaultPaymentTerms;
      const requestedWorkspaceMembers = contractRequest.requestedWorkspaceMembers.trim();
      const requestedLanguages = contractRequest.requestedLanguages.length
        ? contractRequest.requestedLanguages
        : [workspaceDefaultLanguage];
      const requestedLanguageNames = requestedLanguages.map(getLanguageName).join(", ");
      const requestedAiServices = contractRequest.requestedAiServices;
      const requiredFeatures = [
        `Workspace members requested: ${requestedWorkspaceMembers}`,
        `Languages: ${requestedLanguageNames}`,
        `AI services: ${requestedAiServices.join(", ")}`,
      ].join("\n");
      const requestNotes = [
        `Company legal name: ${companyLegalName}`,
        `Billing contact: ${billingContactName} <${billingContactEmail}>`,
        `Invoice email: ${invoiceEmail}`,
        `Payment terms: ${effectivePaymentTerms}`,
        `Requested monthly credits: ${requestedMonthlyCredits}`,
        "Billing frequency: Monthly",
        `Required features / limits: ${requiredFeatures}`,
      ].filter(Boolean).join("\n");

      const featureInterests = [
        "enterprise_contract",
        "workspace_trial",
        "ai_meetings",
        ...(requestedAiServices.includes(GOOGLE_MEET_INTEGRATION_LABEL) ? ["google_meet"] : []),
      ];

      return billingService.createWorkspaceSalesInquiry({
        workspaceId,
        firstName,
        lastName,
        workEmail: billingContactEmail || user.email,
        company: companyLegalName || workspaceName,
        requestType: "enterprise_contract_request",
        featureInterests,
        targetLanguages: requestedLanguages,
        currentMonthlyMeetingVolume: `${requestedMonthlyCredits} credits / month`,
        expectedMonthlyMeetingVolumeInSixMonths: `${requestedMonthlyCredits} credits / month`,
        useCaseNotes: requestNotes,
        pricingEstimate: {
          workspaceId,
          workspaceName,
          workspaceSlug: routeWorkspace?.slug ?? activeWorkspaceSlug,
          companyLegalName,
          billingContactName,
          billingContactEmail: billingContactEmail || user.email,
          invoiceEmail,
          paymentTerms: effectivePaymentTerms,
          requestedMonthlyCredits,
          billingFrequency: "Monthly",
          requiredFeatures,
          requestedWorkspaceMembers,
          requestedLanguages,
          requestedAiServices,
          subscriptionId: subscription?.id,
          planName: subscription?.planName,
          trialEndsAt: subscription?.trialEndsAt,
          creditsPerCycle: cycleCredits,
          estimatedCredits: cycleCredits,
          consumedCredits,
          creditsRemaining: currentCredits,
          usagePercent,
          source: "workspace_billing_trial",
        },
        consent: true,
        source: "workspace_billing_trial",
      });
    },
    onSuccess: () => {
      toast.success("Enterprise contract request sent to WarpTalk billing");
      setIsContractRequestOpen(false);
      queryClient.invalidateQueries({ queryKey: ["sales-inquiries"] });
      setContractRequest((current) => ({
        ...current,
        requestedMonthlyCredits: "",
        requestedWorkspaceMembers: String(TRIAL_WORKSPACE_MEMBER_LIMIT),
        requestedLanguages: ["en", "vi"],
        requestedAiServices: DEFAULT_AI_SERVICE_OPTIONS,
      }));
    },
    onError: (err: unknown) => {
      toast.error(getErrorMessage(err, "Could not send Enterprise contract request"));
    },
  });

  const handleRequestContract = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (contractRequest.companyLegalName.trim().length < 2) {
      toast.error("Enter the company legal name");
      return;
    }

    if (contractRequest.billingContactName.trim().length < 2) {
      toast.error("Enter the billing contact name");
      return;
    }

    if (!contractRequest.billingContactEmail.includes("@")) {
      toast.error("Enter a valid billing contact email");
      return;
    }

    if (!contractRequest.invoiceEmail.includes("@")) {
      toast.error("Enter a valid invoice email");
      return;
    }

    const requestedMonthlyCredits = Number(contractRequest.requestedMonthlyCredits);
    if (!Number.isInteger(requestedMonthlyCredits) || requestedMonthlyCredits < 1) {
      toast.error("Enter the monthly credits needed");
      return;
    }

    if (requestedMonthlyCredits > MAX_REQUESTED_MONTHLY_CREDITS) {
      toast.error(`Monthly credits cannot exceed ${formatNumber(MAX_REQUESTED_MONTHLY_CREDITS)}`);
      return;
    }

    const requestedWorkspaceMembers = Number(contractRequest.requestedWorkspaceMembers);
    if (!Number.isInteger(requestedWorkspaceMembers) || requestedWorkspaceMembers < 1) {
      toast.error("Enter a valid workspace member count");
      return;
    }

    if (requestedWorkspaceMembers > MAX_REQUESTED_WORKSPACE_MEMBERS) {
      toast.error(`Workspace members cannot exceed ${formatNumber(MAX_REQUESTED_WORKSPACE_MEMBERS)}`);
      return;
    }

    if (contractRequest.requestedLanguages.length < 1) {
      toast.error("Select at least one supported language");
      return;
    }

    if (contractRequest.requestedLanguages.length > MAX_ENTERPRISE_LANGUAGES) {
      toast.error(`Select up to ${MAX_ENTERPRISE_LANGUAGES} supported languages`);
      return;
    }

    if (contractRequest.requestedAiServices.length < 1) {
      toast.error("Select at least one AI service");
      return;
    }

    requestContractMutation.mutate();
  };

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

  if (shouldResolveWorkspaceFromSlug && isWorkspaceLookupLoading && !workspaceLookupTimedOut) {
    return (
      <div className="flex h-full items-center justify-center bg-canvas p-6">
        <div className="flex items-center gap-2 text-sm text-ink-muted">
          <Spinner className="h-4 w-4 animate-spin" />
          Loading workspace billing
        </div>
      </div>
    );
  }

  if (
    shouldResolveWorkspaceFromSlug &&
    (workspaceLookupTimedOut || isWorkspaceLookupError || (!isWorkspaceLookupLoading && !routeWorkspace))
  ) {
    return (
      <div className="flex h-full items-center justify-center bg-canvas p-6">
        <Card className="max-w-md rounded-md border-border">
          <CardHeader>
            <CardTitle className="text-base">Workspace billing unavailable</CardTitle>
            <CardDescription>
              This workspace was not found or your account does not have access to its billing page.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

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
                  <StatusRow label="Trial length" value="Configured trial" />
                  <StatusRow label="Trial credits" value="Granted when trial starts" />
                  <StatusRow label="Workspace seats" value={`Up to ${TRIAL_WORKSPACE_MEMBER_LIMIT} members`} />
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
                    {startTrialMutation.isPending ? "Starting trial..." : "Start trial"}
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
                  After admin approval, WarpTalk saves the negotiated credits, price before VAT, overage cap, and NET terms.
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
            detail={hasTrialPeriod ? "Trial does not create invoices or extra usage" : invoiceTerms > 0 ? `Net ${invoiceTerms} invoice terms` : "Configured invoice terms"}
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
                ? "Paid billing starts after admin approves the Enterprise contract."
                : "Workspace billing is handled as one Enterprise contract flow."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <StatusRow label="Status" value={subscriptionStatusLabel} />
            <StatusRow label="Billing contact" value={subscription?.billingContactEmail || "billing@warptalk.com"} />
            {hasTrialPeriod ? (
              <>
                <StatusRow label="Workspace seats" value={`Up to ${TRIAL_WORKSPACE_MEMBER_LIMIT} members`} />
                <StatusRow label="Contract" value="Pending approval" />
              </>
            ) : (
              <>
                <StatusRow label="Contract value" value={formatVnd(subscription?.effectiveContractPriceVnd ?? subscription?.contractPriceVnd)} />
                <StatusRow label="Invoice terms" value={invoiceTerms > 0 ? `Net ${invoiceTerms}` : "Configured"} />
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
                <CardTitle className="text-base">Contract details</CardTitle>
                <CardDescription>
                  {hasPendingContractInquiry
                    ? "The contract request was sent and is waiting for admin review."
                    : "Complete the request form when the company is ready to move from trial to paid billing."}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                {hasPendingContractInquiry ? (
                  <StatusRow label="Request status" value={latestContractInquiry?.status || "Pending review"} />
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={hasPendingContractInquiry || isSalesInquiryLoading}
                  onClick={() => setIsContractRequestOpen(true)}
                >
                  {hasPendingContractInquiry ? "Pending admin review" : "Complete contract details"}
                </Button>
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
            <UsageChart workspaceId={workspaceId} refetchIntervalMs={BILLING_REALTIME_REFETCH_MS} />
            <FeatureBreakdownChart workspaceId={workspaceId} refetchIntervalMs={BILLING_REALTIME_REFETCH_MS} />
          </section>
        )}

        <Dialog open={isContractRequestOpen} onOpenChange={setIsContractRequestOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto border-border bg-surface-1 text-ink sm:max-w-[720px]">
            <DialogHeader>
              <DialogTitle>Request Enterprise contract</DialogTitle>
              <DialogDescription>
                Enter the company, invoice, usage, and plan details needed to prepare the subscription contract.
              </DialogDescription>
            </DialogHeader>

            <form className="grid gap-4" onSubmit={handleRequestContract}>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-medium text-ink sm:col-span-2">
                  Company legal name
                  <Input
                    value={contractRequest.companyLegalName}
                    onChange={(event) => setContractRequest((current) => ({
                      ...current,
                      companyLegalName: event.target.value,
                    }))}
                    placeholder="Legal entity name for the contract"
                    required
                  />
                </label>

                <label className="grid gap-1.5 text-sm font-medium text-ink">
                  Billing contact name
                  <Input
                    value={contractRequest.billingContactName}
                    onChange={(event) => setContractRequest((current) => ({
                      ...current,
                      billingContactName: event.target.value,
                    }))}
                    placeholder="Contact name"
                    required
                  />
                </label>

                <label className="grid gap-1.5 text-sm font-medium text-ink">
                  Billing contact email
                  <Input
                    type="email"
                    value={contractRequest.billingContactEmail}
                    onChange={(event) => setContractRequest((current) => ({
                      ...current,
                      billingContactEmail: event.target.value,
                      invoiceEmail: current.invoiceEmail || event.target.value,
                    }))}
                    placeholder="finance@company.com"
                    required
                  />
                </label>

                <label className="grid gap-1.5 text-sm font-medium text-ink">
                  Requested monthly credits
                    <Input
                      type="number"
                      min={1}
                      max={MAX_REQUESTED_MONTHLY_CREDITS}
                      step={1}
                      value={contractRequest.requestedMonthlyCredits}
                    onChange={(event) => setContractRequest((current) => ({
                      ...current,
                      requestedMonthlyCredits: event.target.value,
                    }))}
                    placeholder="Example: 700000 credits / month"
                    required
                  />
                </label>

                <label className="grid gap-1.5 text-sm font-medium text-ink">
                  Invoice email
                  <Input
                    type="email"
                    value={contractRequest.invoiceEmail}
                    onChange={(event) => setContractRequest((current) => ({
                      ...current,
                      invoiceEmail: event.target.value,
                    }))}
                    placeholder="ap@company.com"
                    required
                  />
                </label>

                <label className="grid gap-1.5 text-sm font-medium text-ink">
                  Payment terms
                  <Select
                    value={contractRequest.paymentTerms || defaultPaymentTerms}
                    onValueChange={(value) => setContractRequest((current) => ({
                      ...current,
                      paymentTerms: value ?? defaultPaymentTerms,
                    }))}
                  >
                    <SelectTrigger className="h-10 w-full rounded-md">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {paymentTermOptions.map((term) => (
                        <SelectItem key={term} value={term}>
                          {term}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
              </div>

              <fieldset className="grid gap-3">
                <legend className="text-sm font-medium text-ink">Required features / limits</legend>
                <div className="grid gap-3 rounded-md border border-border bg-surface-1 p-3">
                  <div className="grid gap-3">
                    <label className="grid gap-1.5 text-sm font-medium text-ink">
                      Workspace members
                      <Input
                        type="number"
                        min={1}
                        max={MAX_REQUESTED_WORKSPACE_MEMBERS}
                        value={contractRequest.requestedWorkspaceMembers}
                        onChange={(event) => setContractRequest((current) => ({
                          ...current,
                          requestedWorkspaceMembers: event.target.value,
                        }))}
                        required
                      />
                    </label>
                  </div>

                  <div className="grid gap-2">
                    <div className="text-sm font-medium text-ink">Supported languages</div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {CONTRACT_LANGUAGE_OPTIONS.map((language) => (
                        <label key={language.code} className="flex items-start gap-2 text-sm text-ink">
                          <input
                            type="checkbox"
                            checked={contractRequest.requestedLanguages.includes(language.code)}
                            onChange={() => setContractRequest((current) => {
                              const isSelected = current.requestedLanguages.includes(language.code);
                              if (!isSelected && current.requestedLanguages.length >= MAX_ENTERPRISE_LANGUAGES) {
                                toast.error(`Select up to ${MAX_ENTERPRISE_LANGUAGES} supported languages`);
                                return current;
                              }

                              return {
                                ...current,
                                requestedLanguages: toggleStringValue(current.requestedLanguages, language.code),
                              };
                            })}
                            className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
                          />
                          <span>{language.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <div className="text-sm font-medium text-ink">AI services</div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {CONTRACT_AI_SERVICE_OPTIONS.map((option) => (
                        <label key={option} className="flex items-start gap-2 text-sm text-ink">
                          <input
                            type="checkbox"
                            checked={contractRequest.requestedAiServices.includes(option)}
                            onChange={() => setContractRequest((current) => ({
                              ...current,
                              requestedAiServices: toggleStringValue(current.requestedAiServices, option),
                            }))}
                            className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
                          />
                          <span>{option}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </fieldset>

              <div className="flex justify-end gap-2 border-t border-border pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsContractRequestOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={requestContractMutation.isPending || !user?.email}
                >
                  {requestContractMutation.isPending ? (
                    <>
                      <Spinner className="h-4 w-4 animate-spin" />
                      Sending request
                    </>
                  ) : (
                    "Submit contract request"
                  )}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
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
