"use client";

import React, { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Plus, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WorkspaceService } from "@/services/workspace.service";
import { billingService } from "@/services/billing.service";
import { toast } from "sonner";
import type { PlanDto, SalesInquiryDto, SubscriptionDto, UpdateSubscriptionContractTermsRequest } from "@/types/billing";
import type { WorkspaceDto } from "@/types/workspace";
import { BILLING_POLICY } from "@/constants/billing-policy";

const toInputNumber = (value: number | null | undefined) =>
  value === null || value === undefined ? "" : String(value);

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const closedInquiryStatuses = new Set(["converted", "closed"]);

function formatVatRate(vatRate?: number | null) {
  return typeof vatRate === "number" && Number.isFinite(vatRate)
    ? `${(vatRate * 100).toLocaleString("vi-VN", { maximumFractionDigits: 2 })}% VAT`
    : "configured VAT";
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null) {
    const response = (error as { response?: { status?: unknown; data?: { message?: unknown; error?: unknown } } }).response;
    const message = response?.data?.message ?? response?.data?.error;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

function getHttpStatus(error: unknown) {
  if (typeof error !== "object" || error === null) return null;
  const status = (error as { response?: { status?: unknown } }).response?.status;
  return typeof status === "number" ? status : null;
}

type WorkspaceContractCandidate = {
  workspace: WorkspaceDto;
  subscription?: SubscriptionDto;
  inquiry?: SalesInquiryDto;
  priority: number;
  label: string;
  requestedCredits: number | null;
};

const formatCredits = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? value.toLocaleString() : "N/A";

const parseRequestedCredits = (inquiry?: SalesInquiryDto) => {
  if (!inquiry) return null;
  const estimate = inquiry.pricingEstimate as { estimatedCredits?: unknown; creditsPerCycle?: unknown } | null | undefined;
  const estimatedCredits = Number(estimate?.estimatedCredits ?? estimate?.creditsPerCycle);
  if (Number.isFinite(estimatedCredits) && estimatedCredits > 0) return estimatedCredits;

  const match = inquiry.currentMonthlyMeetingVolume?.match(/[\d,.]+/);
  if (!match) return null;
  const parsed = Number(match[0].replace(/,/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export function CreateWorkspaceContractModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [workspaceName, setWorkspaceName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [creditsOverride, setCreditsOverride] = useState("");
  const [priceOverride, setPriceOverride] = useState("");
  const [overageCapOverride, setOverageCapOverride] = useState("");
  const [overagePriceOverride, setOveragePriceOverride] = useState("");
  const [invoiceTermsDaysOverride, setInvoiceTermsDaysOverride] = useState("");
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [selectedInquiryId, setSelectedInquiryId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: plans = [], isLoading: isLoadingPlans } = useQuery({
    queryKey: ["billing-plans-for-contract-template"],
    queryFn: () => billingService.getPlans(),
    enabled: open,
  });

  const { data: pricingConfig } = useQuery({
    queryKey: ["billing", "pricing-config"],
    queryFn: () => billingService.getPricingConfig(),
    enabled: open,
  });

  const { data: billingPolicy } = useQuery({
    queryKey: ["billing", "billing-policy"],
    queryFn: () => billingService.getBillingPolicy(),
    enabled: open,
  });

  const { data: globalSubscriptions } = useQuery({
    queryKey: ["global-subscriptions-list"],
    queryFn: () => billingService.getGlobalSubscriptions(1, 200),
    enabled: open,
  });

  const { data: workspaces } = useQuery({
    queryKey: ["admin-contract-workspace-candidates"],
    queryFn: () => WorkspaceService.list(1, 200, ""),
    enabled: open,
  });

  const { data: salesInquiries } = useQuery({
    queryKey: ["admin-contract-sales-inquiry-candidates"],
    queryFn: () => billingService.getSalesInquiries(1, 200),
    enabled: open,
  });

  const enterprisePlan = useMemo<PlanDto | undefined>(() => {
    return plans.find((p) => p.slug?.toLowerCase() === "enterprise" || p.tier?.toLowerCase() === "enterprise")
      ?? plans.find((p) => p.isActive)
      ?? plans[0];
  }, [plans]);

  const workspaceCandidates = useMemo<WorkspaceContractCandidate[]>(() => {
    const subscriptionsByWorkspaceId = new Map(
      (globalSubscriptions?.items ?? [])
        .filter((subscription) => subscription.workspaceId)
        .map((subscription) => [subscription.workspaceId as string, subscription])
    );
    const openInquiriesByWorkspaceId = new Map<string, SalesInquiryDto>();

    (salesInquiries?.items ?? [])
      .filter((inquiry) => inquiry.workspaceId && !closedInquiryStatuses.has(inquiry.status?.toLowerCase()))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .forEach((inquiry) => {
        if (inquiry.workspaceId && !openInquiriesByWorkspaceId.has(inquiry.workspaceId)) {
          openInquiriesByWorkspaceId.set(inquiry.workspaceId, inquiry);
        }
      });

    return (workspaces?.items ?? [])
      .map((workspace) => {
        const subscription = subscriptionsByWorkspaceId.get(workspace.id);
        const inquiry = openInquiriesByWorkspaceId.get(workspace.id);
        const hasContract = Boolean(subscription);
        const hasTrial = Boolean(subscription?.trialEndsAt);
        const hasOpenRequest = Boolean(inquiry);
        const requestedCredits = parseRequestedCredits(inquiry);

        let priority = 4;
        let label = "No contract";

        if (hasTrial && hasOpenRequest) {
          priority = 0;
          label = "Trial + request";
        } else if (!hasContract && hasOpenRequest) {
          priority = 1;
          label = "Request, no contract";
        } else if (!hasContract) {
          priority = 2;
          label = "No contract";
        } else if (hasTrial) {
          priority = 3;
          label = "Trial";
        }

        return { workspace, subscription, inquiry, priority, label, requestedCredits };
      })
      .filter((candidate) => candidate.priority <= 3)
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return new Date(b.workspace.createdAt).getTime() - new Date(a.workspace.createdAt).getTime();
      })
      .slice(0, 8);
  }, [globalSubscriptions, salesInquiries, workspaces]);

  const selectedCandidate = useMemo(() => {
    return workspaceCandidates.find((candidate) => candidate.workspace.id === selectedWorkspaceId);
  }, [selectedWorkspaceId, workspaceCandidates]);

  const applyBaselineTerms = useCallback((plan = enterprisePlan) => {
    if (!plan) return;
    setCreditsOverride(toInputNumber(plan.creditsPerCycle));
    setPriceOverride(toInputNumber(plan.price));
    setOverageCapOverride(toInputNumber(plan.overageCapCredits));
    setOveragePriceOverride(toInputNumber(plan.overagePricePerCredit));
    setInvoiceTermsDaysOverride(toInputNumber(plan.invoiceTermsDays ?? pricingConfig?.defaultInvoiceTermsDays));
  }, [enterprisePlan, pricingConfig?.defaultInvoiceTermsDays]);

  const resetForm = () => {
    setWorkspaceName("");
    setContactEmail("");
    setCreditsOverride("");
    setPriceOverride("");
    setOverageCapOverride("");
    setOveragePriceOverride("");
    setInvoiceTermsDaysOverride("");
    setSelectedWorkspaceId(null);
    setSelectedInquiryId(null);
    setIsSubmitting(false);
  };

  const applyCandidate = (candidate: WorkspaceContractCandidate) => {
    setSelectedWorkspaceId(candidate.workspace.id);
    setSelectedInquiryId(candidate.inquiry?.id ?? null);
    setWorkspaceName(candidate.workspace.name);
    setContactEmail(
      candidate.inquiry?.workEmail
        ?? candidate.subscription?.billingContactEmail
        ?? ""
    );
    applyBaselineTerms(enterprisePlan);
  };

  const resolveBillingEmail = (name: string) =>
    (contactEmail.trim() || `billing@${name.toLowerCase().replace(/[^a-z0-9]/g, "") || "company"}.com`).toLowerCase();

  const parseNumberField = (value: string, label: string, options: { integer?: boolean; min?: number; max?: number } = {}) => {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      throw new Error(`${label} must be a valid number.`);
    }
    if (options.integer && !Number.isInteger(parsed)) {
      throw new Error(`${label} must be a whole number.`);
    }
    if (options.min !== undefined && parsed < options.min) {
      throw new Error(`${label} must be at least ${options.min}.`);
    }
    if (options.max !== undefined && parsed > options.max) {
      throw new Error(`${label} must be at most ${options.max}.`);
    }

    return parsed;
  };

  const buildContractTerms = (email: string): UpdateSubscriptionContractTermsRequest => {
    if (!enterprisePlan) {
      throw new Error("Enterprise plan template is not available.");
    }
    if (!emailPattern.test(email)) {
      throw new Error("Finance email must be a valid email address.");
    }

    const parsedCreditsPerCycleOverride = parseNumberField(creditsOverride, "Credits / Cycle", { integer: true, min: 1 });
    const parsedContractPriceVnd = parseNumberField(priceOverride, "Price (VND)", { min: 0 });
    const parsedOverageCapCreditsOverride = parseNumberField(overageCapOverride, "Overage Cap", { integer: true, min: 0 });
    const parsedOveragePricePerCreditOverride = parseNumberField(overagePriceOverride, "Overage / Credit", { min: 0 });
    const parsedInvoiceTermsDaysOverride = parseNumberField(invoiceTermsDaysOverride, "Terms (Days)", {
      integer: true,
      min: 1,
    });

    const effectiveCredits = parsedCreditsPerCycleOverride ?? enterprisePlan.creditsPerCycle;
    const effectivePrice = parsedContractPriceVnd ?? enterprisePlan.price;
    const effectiveOverageCap = parsedOverageCapCreditsOverride ?? enterprisePlan.overageCapCredits;
    const effectiveOveragePrice = parsedOveragePricePerCreditOverride ?? enterprisePlan.overagePricePerCredit;
    const priceFloorPerCredit = pricingConfig?.minimumPricePerCreditVnd ?? BILLING_POLICY.minimumPricePerCreditVnd;

    if (effectivePrice / effectiveCredits < priceFloorPerCredit) {
      throw new Error(`Contract price must be at least ${priceFloorPerCredit.toFixed(2)} VND per credit.`);
    }
    if (effectiveOverageCap > effectiveCredits) {
      throw new Error("Overage cap cannot be greater than committed credits.");
    }
    if (effectiveOverageCap > 0 && effectiveOveragePrice < enterprisePlan.overagePricePerCredit) {
      throw new Error(`Overage price must be at least ${enterprisePlan.overagePricePerCredit} VND per credit.`);
    }

    return {
      creditsPerCycleOverride: parsedCreditsPerCycleOverride,
      contractPriceVnd: parsedContractPriceVnd,
      overageCapCreditsOverride: parsedOverageCapCreditsOverride,
      overagePricePerCreditOverride: parsedOveragePricePerCreditOverride,
      invoiceTermsDaysOverride: parsedInvoiceTermsDaysOverride,
      billingContactEmail: email,
    };
  };

  const getOrCreateWorkspace = async (name: string): Promise<WorkspaceDto> => {
    try {
      return await WorkspaceService.create({ name });
    } catch (err: unknown) {
      if (getHttpStatus(err) !== 400) throw err;

      const existing = await WorkspaceService.list(1, 10, name);
      const matched = existing.items?.find((workspace) => workspace.name.toLowerCase() === name.toLowerCase());
      if (!matched) throw err;

      toast.info(`Workspace "${matched.name}" already exists. Reusing it for this contract.`);
      return matched;
    }
  };

  const applyContractTerms = async (workspaceId: string, terms: UpdateSubscriptionContractTermsRequest) => {
    await billingService.updateSubscriptionContractTerms(workspaceId, terms);
  };

  const createOrUpdateEnterpriseContract = async (workspaceId: string, planId: string, terms: UpdateSubscriptionContractTermsRequest) => {
    try {
      await billingService.createWorkspaceContractSubscription({
        workspaceId,
        planId,
        contractTerms: terms,
      });
    } catch (err: unknown) {
      if (getHttpStatus(err) !== 400) throw err;
      await billingService.getActiveSubscription(workspaceId);
      toast.info("This workspace already has a subscription. Updating its contract terms instead.");
    }

    await applyContractTerms(workspaceId, terms);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = workspaceName.trim();
    if (!name) {
      toast.error("Workspace name is required.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (!enterprisePlan) {
        throw new Error("Enterprise plan template is not available.");
      }

      const contractTerms = buildContractTerms(resolveBillingEmail(name));

      const newWs = selectedCandidate?.workspace ?? await getOrCreateWorkspace(name);

      if (selectedInquiryId) {
        await billingService.convertSalesInquiryToContract(selectedInquiryId, {
          workspaceId: newWs.id,
          planId: enterprisePlan.id,
          contractTerms,
        });
      } else {
        await createOrUpdateEnterpriseContract(newWs.id, enterprisePlan.id, contractTerms);
      }

      toast.success(`Workspace "${newWs.name}" saved with an Enterprise contract.`);
      
      queryClient.invalidateQueries({ queryKey: ["admin-billing-workspaces"] });
      queryClient.invalidateQueries({ queryKey: ["global-subscriptions-list"] });
      queryClient.invalidateQueries({ queryKey: ["global-billing-metrics"] });
      queryClient.invalidateQueries({ queryKey: ["admin-contract-sales-inquiry-candidates"] });
      queryClient.invalidateQueries({ queryKey: ["admin-sales-inquiries"] });

      onOpenChange(false);
      resetForm();

      router.push(`/billing/workspace/${newWs.id}`);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, "Failed to create workspace contract."));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => { onOpenChange(val); if (!val) resetForm(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto bg-surface-1 border-hairline rounded-xl sm:max-w-[760px]">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 mb-1">
              <div className="flex h-8 w-8 items-center justify-center rounded-md border border-hairline bg-primary/10 text-primary">
                <Building2 className="h-4 w-4" />
              </div>
              <DialogTitle className="text-lg font-bold">New Company Workspace Contract</DialogTitle>
            </div>
          </div>
          <DialogDescription className="text-sm text-muted-foreground">
            Select a real workspace request or create a contract for an existing company workspace.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-2 rounded-lg border border-hairline bg-surface-2/60 p-3">
            <div>
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Workspace candidates
              </span>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {workspaceCandidates.length > 0 ? (
                workspaceCandidates.map((candidate) => {
                  const baseline = enterprisePlan?.creditsPerCycle ?? null;
                  const requested = candidate.requestedCredits;
                  const delta = requested !== null && baseline !== null ? requested - baseline : null;
                  return (
                    <button
                      key={candidate.workspace.id}
                      type="button"
                      className={`rounded-md border p-3 text-left transition ${
                        selectedWorkspaceId === candidate.workspace.id
                          ? "border-primary bg-primary/5"
                          : "border-hairline bg-surface-1 hover:border-primary/40"
                      }`}
                      onClick={() => applyCandidate(candidate)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-foreground">{candidate.workspace.name}</span>
                        <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted-foreground">
                          {candidate.label}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {candidate.inquiry?.workEmail ?? candidate.subscription?.billingContactEmail ?? candidate.workspace.slug}
                      </p>
                      <p className="mt-2 text-xs font-medium text-foreground">
                        Request: {requested ? `${formatCredits(requested)} credits / month` : "No credit request"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Baseline: {formatCredits(baseline)} credits
                        {delta !== null ? ` (${delta === 0 ? "matches" : `${delta > 0 ? "+" : ""}${formatCredits(delta)} vs baseline`})` : ""}
                      </p>
                    </button>
                  );
                })
              ) : (
                <span className="text-xs text-muted-foreground">No workspace candidates.</span>
              )}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Company / Workspace Name <span className="text-rose-500">*</span>
              </Label>
              <Input
                placeholder="Search or enter workspace name"
                value={workspaceName}
                onChange={(e) => {
                  setWorkspaceName(e.target.value);
                  setSelectedWorkspaceId(null);
                  setSelectedInquiryId(null);
                }}
                className="h-10 bg-surface-2 border-hairline"
                autoFocus
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Finance Email
              </Label>
              <Input
                type="email"
                placeholder="billing@company.com"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                className="h-10 bg-surface-2 border-hairline"
              />
            </div>
          </div>

          <section className="space-y-3 rounded-lg border border-hairline bg-surface-2/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Enterprise contract terms</p>
                <p className="text-xs text-muted-foreground">
                  Based on the baseline plan template. Prices are before {formatVatRate(billingPolicy?.vatRate)}; invoices include VAT.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 shrink-0 text-xs"
                onClick={() => applyBaselineTerms()}
                disabled={!enterprisePlan || isLoadingPlans}
              >
                Reset baseline
              </Button>
            </div>

            <div className="rounded-md border border-hairline bg-surface-1 px-3 py-2 text-xs text-muted-foreground">
              {isLoadingPlans ? (
                "Loading Enterprise baseline..."
              ) : enterprisePlan ? (
                <>
                  <span className="font-semibold text-foreground">{enterprisePlan.name}</span>
                  {` baseline: ${enterprisePlan.creditsPerCycle.toLocaleString()} credits, ${enterprisePlan.price.toLocaleString()} VND before VAT, ${enterprisePlan.overageCapCredits.toLocaleString()} overage cap, ${enterprisePlan.invoiceTermsDays ?? pricingConfig?.defaultInvoiceTermsDays ?? "configured"} day terms.`}
                </>
              ) : (
                "No active billing plan template is available."
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className="space-y-1 lg:col-span-1">
                <Label className="text-[11px] text-muted-foreground">Credits / Cycle</Label>
                <Input
                  type="number"
                  placeholder={toInputNumber(enterprisePlan?.creditsPerCycle)}
                  value={creditsOverride}
                  onChange={(e) => setCreditsOverride(e.target.value)}
                  className="h-9 text-sm bg-surface-1"
                />
              </div>
              <div className="space-y-1 lg:col-span-1">
                <Label className="text-[11px] text-muted-foreground">Price before VAT</Label>
                <Input
                  type="number"
                  placeholder={toInputNumber(enterprisePlan?.price)}
                  value={priceOverride}
                  onChange={(e) => setPriceOverride(e.target.value)}
                  className="h-9 text-sm bg-surface-1"
                />
              </div>
              <div className="space-y-1 lg:col-span-1">
                <Label className="text-[11px] text-muted-foreground">Overage Cap</Label>
                <Input
                  type="number"
                  placeholder={toInputNumber(enterprisePlan?.overageCapCredits)}
                  value={overageCapOverride}
                  onChange={(e) => setOverageCapOverride(e.target.value)}
                  className="h-9 text-sm bg-surface-1"
                />
              </div>
              <div className="space-y-1 lg:col-span-1">
                <Label className="text-[11px] text-muted-foreground">Overage / Credit</Label>
                <Input
                  type="number"
                  placeholder={toInputNumber(enterprisePlan?.overagePricePerCredit)}
                  value={overagePriceOverride}
                  onChange={(e) => setOveragePriceOverride(e.target.value)}
                  className="h-9 text-sm bg-surface-1"
                />
              </div>
              <div className="space-y-1 lg:col-span-1">
                <Label className="text-[11px] text-muted-foreground">Terms (Days)</Label>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  placeholder={toInputNumber(enterprisePlan?.invoiceTermsDays ?? pricingConfig?.defaultInvoiceTermsDays)}
                  value={invoiceTermsDaysOverride}
                  onChange={(e) => setInvoiceTermsDaysOverride(e.target.value)}
                  className="h-9 text-sm bg-surface-1"
                />
              </div>
            </div>
          </section>

          <DialogFooter className="pt-2">
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="gap-2">
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" /> Create Enterprise Contract
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
