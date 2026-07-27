"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Plus, Loader2, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WorkspaceService } from "@/services/workspace.service";
import { billingService } from "@/services/billing.service";
import { toast } from "sonner";
import type { PlanDto, UpdateSubscriptionContractTermsRequest } from "@/types/billing";
import type { WorkspaceDto } from "@/types/workspace";

export interface DemoCompanyPreset {
  name: string;
}

export const SAMPLE_COMPANY_PRESETS: DemoCompanyPreset[] = [
  {
    name: "FPT-SEP490-SU26",
  },
  {
    name: "Viettel High Tech",
  },
  {
    name: "VinAI Research",
  },
  {
    name: "VNG Games",
  },
  {
    name: "MISA Joint Stock",
  },
];

const toInputNumber = (value: number | null | undefined) =>
  value === null || value === undefined ? "" : String(value);

const normalizeCompanyName = (name: string | null | undefined) => name?.trim().toLowerCase() ?? "";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const maxInvoiceTermsDays = 30;
const priceFloorPerCredit = 2.6;

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSeedingBatch, setIsSeedingBatch] = useState(false);

  const { data: plans = [], isLoading: isLoadingPlans } = useQuery({
    queryKey: ["billing-plans-for-contract-template"],
    queryFn: () => billingService.getPlans(),
    enabled: open,
  });

  const { data: globalSubscriptions } = useQuery({
    queryKey: ["global-subscriptions-list"],
    queryFn: () => billingService.getGlobalSubscriptions(1, 200),
    enabled: open,
  });

  const enterprisePlan = useMemo<PlanDto | undefined>(() => {
    return plans.find((p) => p.slug?.toLowerCase() === "enterprise" || p.tier?.toLowerCase() === "enterprise")
      ?? plans.find((p) => p.isActive)
      ?? plans[0];
  }, [plans]);

  const availablePresets = useMemo(() => {
    const contractedWorkspaceNames = new Set(
      (globalSubscriptions?.items ?? [])
        .map((subscription) => normalizeCompanyName(subscription.workspaceName))
        .filter(Boolean)
    );

    return SAMPLE_COMPANY_PRESETS.filter((preset) => !contractedWorkspaceNames.has(normalizeCompanyName(preset.name)));
  }, [globalSubscriptions]);

  const applyBaselineTerms = useCallback((plan = enterprisePlan) => {
    if (!plan) return;
    setCreditsOverride(toInputNumber(plan.creditsPerCycle));
    setPriceOverride(toInputNumber(plan.price));
    setOverageCapOverride(toInputNumber(plan.overageCapCredits));
    setOveragePriceOverride(toInputNumber(plan.overagePricePerCredit));
    setInvoiceTermsDaysOverride(toInputNumber(plan.invoiceTermsDays));
  }, [enterprisePlan]);

  const resetForm = () => {
    setWorkspaceName("");
    setContactEmail("");
    setCreditsOverride("");
    setPriceOverride("");
    setOverageCapOverride("");
    setOveragePriceOverride("");
    setInvoiceTermsDaysOverride("");
    setIsSubmitting(false);
    setIsSeedingBatch(false);
  };

  const applyPreset = (preset: DemoCompanyPreset) => {
    setWorkspaceName(preset.name);
  };

  useEffect(() => {
    if (!open || !enterprisePlan) return;
    const hasManualTerms =
      creditsOverride || priceOverride || overageCapOverride || overagePriceOverride || invoiceTermsDaysOverride;
    if (!hasManualTerms) {
      applyBaselineTerms(enterprisePlan);
    }
  }, [
    open,
    enterprisePlan,
    creditsOverride,
    priceOverride,
    overageCapOverride,
    overagePriceOverride,
    invoiceTermsDaysOverride,
    applyBaselineTerms,
  ]);

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
      max: maxInvoiceTermsDays,
    });

    const effectiveCredits = parsedCreditsPerCycleOverride ?? enterprisePlan.creditsPerCycle;
    const effectivePrice = parsedContractPriceVnd ?? enterprisePlan.price;
    const effectiveOverageCap = parsedOverageCapCreditsOverride ?? enterprisePlan.overageCapCredits;
    const effectiveOveragePrice = parsedOveragePricePerCreditOverride ?? enterprisePlan.overagePricePerCredit;

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
    } catch (err: any) {
      if (err?.response?.status !== 400) throw err;

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
    } catch (err: any) {
      if (err?.response?.status !== 400) throw err;
      await billingService.getActiveSubscription(workspaceId);
      toast.info("This workspace already has a subscription. Updating its contract terms instead.");
    }

    await applyContractTerms(workspaceId, terms);
  };

  const handleSeedBatch = async () => {
    setIsSeedingBatch(true);
    let createdCount = 0;
    try {
      const plans = await billingService.getPlans();
      const enterprisePlan = plans.find(
        (p) => p.slug?.toLowerCase() === "enterprise" || p.tier?.toLowerCase() === "enterprise"
      ) ?? plans[0];

      if (!enterprisePlan) {
        throw new Error("Enterprise plan template unavailable.");
      }

      for (const preset of SAMPLE_COMPANY_PRESETS) {
        try {
          const newWs = await getOrCreateWorkspace(preset.name);
          await billingService.createSubscription(newWs.id, enterprisePlan.id);
          createdCount++;
        } catch (err) {
          console.warn(`Seed failed for preset ${preset.name}:`, err);
        }
      }

      toast.success(`Successfully seeded ${createdCount} sample company workspace contracts!`);
      queryClient.invalidateQueries({ queryKey: ["admin-billing-workspaces"] });
      queryClient.invalidateQueries({ queryKey: ["global-subscriptions-list"] });
      queryClient.invalidateQueries({ queryKey: ["global-billing-metrics"] });

      onOpenChange(false);
      resetForm();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || "Failed batch seeding sample workspaces.");
    } finally {
      setIsSeedingBatch(false);
    }
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

      // 1. Create the workspace, or reuse it if the company workspace already exists.
      const newWs = await getOrCreateWorkspace(name);

      await createOrUpdateEnterpriseContract(newWs.id, enterprisePlan.id, contractTerms);

      toast.success(`Workspace "${newWs.name}" created with an Enterprise contract.`);
      
      queryClient.invalidateQueries({ queryKey: ["admin-billing-workspaces"] });
      queryClient.invalidateQueries({ queryKey: ["global-subscriptions-list"] });
      queryClient.invalidateQueries({ queryKey: ["global-billing-metrics"] });

      onOpenChange(false);
      resetForm();

      router.push(`/billing/workspace/${newWs.id}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || "Failed to create workspace contract.");
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs text-primary border-primary/20 hover:bg-primary/5"
              onClick={handleSeedBatch}
              disabled={isSeedingBatch || isSubmitting}
            >
              {isSeedingBatch ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Seed 5 Demo Workspaces
            </Button>
          </div>
          <DialogDescription className="text-sm text-muted-foreground">
            Create or reuse a company workspace, then save the approved Enterprise contract terms.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="rounded-lg border border-hairline bg-surface-2/60 p-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-2">
              Quick Presets
            </span>
            <div className="flex flex-wrap gap-1.5">
              {availablePresets.length > 0 ? (
                availablePresets.map((preset) => (
                  <Button
                    key={preset.name}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs bg-surface-1 hover:border-primary/50"
                    onClick={() => applyPreset(preset)}
                  >
                    {preset.name}
                  </Button>
                ))
              ) : (
                <span className="text-xs text-muted-foreground">All demo company presets already have contracts.</span>
              )}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Company / Workspace Name <span className="text-rose-500">*</span>
              </Label>
              <Input
                placeholder="e.g. FPT-SEP490-SU26 or FPT Software"
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
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
                  Based on the baseline plan template. Prices are before 10% VAT; invoices include VAT.
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
                  {` baseline: ${enterprisePlan.creditsPerCycle.toLocaleString()} credits, ${enterprisePlan.price.toLocaleString()} VND before VAT, ${enterprisePlan.overageCapCredits.toLocaleString()} overage cap, ${enterprisePlan.invoiceTermsDays} day terms.`}
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
                  placeholder="700000"
                  value={creditsOverride}
                  onChange={(e) => setCreditsOverride(e.target.value)}
                  className="h-9 text-sm bg-surface-1"
                />
              </div>
              <div className="space-y-1 lg:col-span-1">
                <Label className="text-[11px] text-muted-foreground">Price before VAT</Label>
                <Input
                  type="number"
                  placeholder="1900000"
                  value={priceOverride}
                  onChange={(e) => setPriceOverride(e.target.value)}
                  className="h-9 text-sm bg-surface-1"
                />
              </div>
              <div className="space-y-1 lg:col-span-1">
                <Label className="text-[11px] text-muted-foreground">Overage Cap</Label>
                <Input
                  type="number"
                  placeholder="105000"
                  value={overageCapOverride}
                  onChange={(e) => setOverageCapOverride(e.target.value)}
                  className="h-9 text-sm bg-surface-1"
                />
              </div>
              <div className="space-y-1 lg:col-span-1">
                <Label className="text-[11px] text-muted-foreground">Overage / Credit</Label>
                <Input
                  type="number"
                  placeholder="3"
                  value={overagePriceOverride}
                  onChange={(e) => setOveragePriceOverride(e.target.value)}
                  className="h-9 text-sm bg-surface-1"
                />
              </div>
              <div className="space-y-1 lg:col-span-1">
                <Label className="text-[11px] text-muted-foreground">Terms (Days)</Label>
                <Input
                  type="number"
                  placeholder="30"
                  value={invoiceTermsDaysOverride}
                  onChange={(e) => setInvoiceTermsDaysOverride(e.target.value)}
                  className="h-9 text-sm bg-surface-1"
                />
              </div>
            </div>
          </section>

          <DialogFooter className="pt-2">
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)} disabled={isSubmitting || isSeedingBatch}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || isSeedingBatch} className="gap-2">
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
