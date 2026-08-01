"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Loader2, Save, SlidersHorizontal, Sparkles } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BILLING_POLICY } from "@/constants/billing-policy";
import { BROADCAST_CHANNELS } from "@/constants/realtime";
import { billingService } from "@/services/billing.service";
import type { PlanDto, PlanRequest, PricingConfigDto, UsageRateCardDto } from "@/types/billing";

type BaselinePlan = PlanDto & {
  voiceCloneEnabled?: boolean;
  aiAssistantEnabled?: boolean;
  glossaryEnabled?: boolean;
  dedicatedGpu?: boolean;
};

type BaselineFormState = {
  price: string;
  creditsPerCycle: string;
  overageCapCredits: string;
  overagePricePerCredit: string;
  lowBalanceThresholdCredits: string;
  rolloverCapCredits: string;
  invoiceTermsDays: string;
  invoiceGraceHours: string;
  maxParticipants: string;
  maxLanguages: string;
  voiceCloneEnabled: boolean;
  aiAssistantEnabled: boolean;
  glossaryEnabled: boolean;
  dedicatedGpu: boolean;
  isActive: boolean;
};

type PricingDraftRow = {
  id: string;
  chargeType: string;
  unit: string;
  provider: string;
  model: string;
  providerUnitCostUsd: number;
  markupMultiplier: number;
  enabled: boolean;
};

type BaselinePlanRequest = PlanRequest & {
  maxLanguages: number;
  voiceCloneEnabled: boolean;
  aiAssistantEnabled: boolean;
  glossaryEnabled: boolean;
  dedicatedGpu: boolean;
};

const DEFAULT_PRICING_DRAFT_ROWS: PricingDraftRow[] = [
  { id: "stt-second", chargeType: "STT", unit: "second", provider: "openai", model: "gpt-4o-transcribe", providerUnitCostUsd: 0.0001, markupMultiplier: 2.5, enabled: true },
  { id: "translation-token-in", chargeType: "TRANSLATION", unit: "token_in", provider: "openai", model: "gpt-4.1-mini", providerUnitCostUsd: 0.0000004, markupMultiplier: 2.5, enabled: true },
  { id: "translation-token-cached", chargeType: "TRANSLATION", unit: "token_in_cached", provider: "openai", model: "gpt-4.1-mini", providerUnitCostUsd: 0.0000001, markupMultiplier: 2.5, enabled: true },
  { id: "translation-token-out", chargeType: "TRANSLATION", unit: "token_out", provider: "openai", model: "gpt-4.1-mini", providerUnitCostUsd: 0.0000016, markupMultiplier: 2.5, enabled: true },
  { id: "tts-standard", chargeType: "AUDIO_DUBBING_STANDARD", unit: "character", provider: "cartesia", model: "sonic-3.5", providerUnitCostUsd: 0.0000392, markupMultiplier: 3, enabled: true },
  { id: "tts-clone", chargeType: "AUDIO_DUBBING_VOICE_CLONE", unit: "character", provider: "cartesia", model: "sonic-3.5-clone", providerUnitCostUsd: 0.0000588, markupMultiplier: 3.5, enabled: true },
  { id: "voice-enrollment", chargeType: "VOICE_CLONE_ENROLLMENT", unit: "profile", provider: "cartesia", model: "cartesia-localizing-voice", providerUnitCostUsd: 0.00882, markupMultiplier: 3.5, enabled: true },
  { id: "assistant-token-in", chargeType: "AI_ASSISTANT", unit: "token_in", provider: "openai", model: "gpt-4.1", providerUnitCostUsd: 0.000002, markupMultiplier: 2.5, enabled: true },
  { id: "assistant-token-cached", chargeType: "AI_ASSISTANT", unit: "token_in_cached", provider: "openai", model: "gpt-4.1", providerUnitCostUsd: 0.0000005, markupMultiplier: 2.5, enabled: true },
  { id: "assistant-token-out", chargeType: "AI_ASSISTANT", unit: "token_out", provider: "openai", model: "gpt-4.1", providerUnitCostUsd: 0.000008, markupMultiplier: 2.5, enabled: true },
  { id: "summary-token-in", chargeType: "AI_SUMMARY", unit: "token_in", provider: "openai", model: "gpt-4o-mini", providerUnitCostUsd: 0.00000015, markupMultiplier: 2.5, enabled: true },
  { id: "summary-token-cached", chargeType: "AI_SUMMARY", unit: "token_in_cached", provider: "openai", model: "gpt-4o-mini", providerUnitCostUsd: 0.000000075, markupMultiplier: 2.5, enabled: true },
  { id: "summary-token-out", chargeType: "AI_SUMMARY", unit: "token_out", provider: "openai", model: "gpt-4o-mini", providerUnitCostUsd: 0.0000006, markupMultiplier: 2.5, enabled: true },
];

const SERVICE_LABELS: Record<string, string> = {
  STT: "Speech to Text",
  TRANSLATION: "Translation",
  AUDIO_DUBBING_STANDARD: "TTS standard",
  AUDIO_DUBBING_VOICE_CLONE: "TTS voice clone",
  VOICE_CLONE_ENROLLMENT: "Voice enrollment",
  AI_ASSISTANT: "AI Assistant",
  AI_SUMMARY: "AI Summary",
};

const EMPTY_FORM: BaselineFormState = {
  price: "",
  creditsPerCycle: "",
  overageCapCredits: "",
  overagePricePerCredit: "",
  lowBalanceThresholdCredits: "",
  rolloverCapCredits: "",
  invoiceTermsDays: "",
  invoiceGraceHours: "",
  maxParticipants: "",
  maxLanguages: "",
  voiceCloneEnabled: false,
  aiAssistantEnabled: false,
  glossaryEnabled: false,
  dedicatedGpu: false,
  isActive: true,
};

function parseBaselineNumber(
  rawValue: string,
  label: string,
  options: { integer?: boolean; min?: number; max?: number; minExclusive?: number } = {}
): { value: number; error: null } | { value: null; error: string } {
  const value = rawValue.trim();
  if (!value) return { value: null, error: `${label} is required.` };

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return { value: null, error: `${label} must be a valid number.` };
  if (options.integer && !Number.isInteger(parsed)) return { value: null, error: `${label} must be a whole number.` };
  if (options.min !== undefined && parsed < options.min) return { value: null, error: `${label} must be at least ${options.min}.` };
  if (options.max !== undefined && parsed > options.max) return { value: null, error: `${label} must be at most ${options.max}.` };
  if (options.minExclusive !== undefined && parsed <= options.minExclusive) return { value: null, error: `${label} must be greater than ${options.minExclusive}.` };

  return { value: parsed, error: null };
}

function validateBaselineForm(
  form: BaselineFormState,
  policy: { minimumContractPriceVnd: number; minimumPricePerCreditVnd: number }
): string | null {
  const priceResult = parseBaselineNumber(form.price, "Price", { min: policy.minimumContractPriceVnd });
  if (priceResult.error) return priceResult.error;

  const creditsResult = parseBaselineNumber(form.creditsPerCycle, "Credits per cycle", { integer: true, minExclusive: 0 });
  if (creditsResult.error) return creditsResult.error;

  const warningResult = parseBaselineNumber(form.lowBalanceThresholdCredits, "Warning credits", { integer: true, min: 0 });
  if (warningResult.error) return warningResult.error;

  const overageCapResult = parseBaselineNumber(form.overageCapCredits, "Extra usage cap", { integer: true, min: 0 });
  if (overageCapResult.error) return overageCapResult.error;

  const overagePriceResult = parseBaselineNumber(form.overagePricePerCredit, "Extra usage price per credit", { min: 0 });
  if (overagePriceResult.error) return overagePriceResult.error;

  const rolloverResult = parseBaselineNumber(form.rolloverCapCredits, "Rollover cap", { integer: true, min: 0 });
  if (rolloverResult.error) return rolloverResult.error;

  const invoiceTermsResult = parseBaselineNumber(form.invoiceTermsDays, "Invoice terms days", { integer: true, minExclusive: 0 });
  if (invoiceTermsResult.error) return invoiceTermsResult.error;

  const invoiceGraceResult = parseBaselineNumber(form.invoiceGraceHours, "Invoice grace hours", { integer: true, minExclusive: 0 });
  if (invoiceGraceResult.error) return invoiceGraceResult.error;

  const maxParticipantsResult = parseBaselineNumber(form.maxParticipants, "Max participants", { integer: true, min: 2 });
  if (maxParticipantsResult.error) return maxParticipantsResult.error;

  const maxLanguagesResult = parseBaselineNumber(form.maxLanguages, "Max languages", { integer: true, min: 1, max: 3 });
  if (maxLanguagesResult.error) return maxLanguagesResult.error;

  const price = priceResult.value!;
  const credits = creditsResult.value!;
  const warningCredits = warningResult.value!;
  const overageCap = overageCapResult.value!;
  const overagePrice = overagePriceResult.value!;
  const rolloverCap = rolloverResult.value!;

  if (price / credits < policy.minimumPricePerCreditVnd) {
    return `Effective price per credit must be at least ${policy.minimumPricePerCreditVnd.toFixed(2)} VND.`;
  }

  if (overageCap > credits) return "Extra usage cap must not exceed credits per cycle.";
  if (overageCap > 0 && overagePrice <= 0) return "Extra usage price per credit must be greater than 0 when extra usage is enabled.";
  if (overageCap > 0 && warningCredits <= overageCap) return "Warning credits must be greater than extra usage cap.";
  if (warningCredits >= credits) return "Warning credits must be lower than credits per cycle.";
  if (rolloverCap > credits) return "Rollover cap must not exceed credits per cycle.";

  return null;
}

function isEnterprisePlan(plan: BaselinePlan) {
  return [plan.slug, plan.tier, plan.name].some((value) => value?.toLowerCase().includes("enterprise"));
}

function toBaselineForm(plan: BaselinePlan, pricingConfig?: PricingConfigDto | null): BaselineFormState {
  return {
    price: plan.price?.toString() ?? "0",
    creditsPerCycle: plan.creditsPerCycle?.toString() ?? "0",
    overageCapCredits: plan.overageCapCredits?.toString() ?? "0",
    overagePricePerCredit: plan.overagePricePerCredit?.toString() ?? "0",
    lowBalanceThresholdCredits: plan.lowBalanceThresholdCredits?.toString() ?? "0",
    rolloverCapCredits: plan.rolloverCapCredits?.toString() ?? "0",
    invoiceTermsDays: plan.invoiceTermsDays?.toString() ?? pricingConfig?.defaultInvoiceTermsDays.toString() ?? String(BILLING_POLICY.defaultInvoiceTermsDays),
    invoiceGraceHours: plan.invoiceGraceHours?.toString() ?? pricingConfig?.defaultInvoiceGraceHours.toString() ?? String(BILLING_POLICY.defaultInvoiceGraceHours),
    maxParticipants: plan.maxParticipants?.toString() ?? "0",
    maxLanguages: plan.maxLanguages?.toString() ?? "0",
    voiceCloneEnabled: plan.voiceCloneEnabled ?? false,
    aiAssistantEnabled: plan.aiAssistantEnabled ?? false,
    glossaryEnabled: plan.glossaryEnabled ?? false,
    dedicatedGpu: plan.dedicatedGpu ?? false,
    isActive: plan.isActive !== false,
  };
}

function toPlanPayload(plan: BaselinePlan, form: BaselineFormState): BaselinePlanRequest {
  return {
    name: plan.name,
    slug: plan.slug,
    tier: plan.tier,
    price: Number(form.price) || 0,
    currency: plan.currency || "VND",
    billingCycle: plan.billingCycle || "monthly",
    creditsPerCycle: Number(form.creditsPerCycle) || 0,
    overageCapCredits: Number(form.overageCapCredits) || 0,
    overagePricePerCredit: Number(form.overagePricePerCredit) || 0,
    lowBalanceThresholdCredits: Number(form.lowBalanceThresholdCredits) || 0,
    rolloverCapCredits: Number(form.rolloverCapCredits) || 0,
    invoiceTermsDays: Number(form.invoiceTermsDays) || BILLING_POLICY.defaultInvoiceTermsDays,
    invoiceGraceHours: Number(form.invoiceGraceHours) || BILLING_POLICY.defaultInvoiceGraceHours,
    maxParticipants: Number(form.maxParticipants) || 0,
    maxLanguages: Number(form.maxLanguages) || 0,
    voiceCloneEnabled: form.voiceCloneEnabled,
    aiAssistantEnabled: form.aiAssistantEnabled,
    glossaryEnabled: form.glossaryEnabled,
    dedicatedGpu: form.dedicatedGpu,
    features: plan.features || "[]",
    sortOrder: plan.sortOrder ?? 0,
    isActive: form.isActive,
  };
}

function toPricingDraftRow(rate: UsageRateCardDto): PricingDraftRow {
  return {
    id: rate.id,
    chargeType: rate.chargeType,
    unit: rate.unit,
    provider: rate.provider,
    model: rate.model,
    providerUnitCostUsd: rate.providerUnitCostUsd ?? 0,
    markupMultiplier: rate.markupMultiplier ?? 0,
    enabled: rate.isActive,
  };
}

function calculateDraftUnitPrice(row: PricingDraftRow, fxRate: number, creditValueVnd: number): number {
  if (!row.enabled || creditValueVnd <= 0) return 0;
  return (row.providerUnitCostUsd * fxRate * row.markupMultiplier) / creditValueVnd;
}

function formatProviderCostUsd(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  return value.toFixed(12).replace(/\.?0+$/, "");
}

function renderEnabled(value?: boolean) {
  return value ? "Enabled" : "Disabled";
}

function getErrorMessage(error: unknown, fallback: string) {
  const maybeError = error as {
    message?: string;
    response?: { data?: { message?: string; Message?: string } };
  };

  return maybeError?.response?.data?.message
    || maybeError?.response?.data?.Message
    || maybeError?.message
    || fallback;
}

export default function AdminPlansPage() {
  const queryClient = useQueryClient();
  const [editingPlan, setEditingPlan] = useState<BaselinePlan | null>(null);
  const [formState, setFormState] = useState<BaselineFormState>(EMPTY_FORM);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pricingDraftEdits, setPricingDraftEdits] = useState<Record<string, Partial<PricingDraftRow>>>({});
  const [useDefaultPricingRows, setUseDefaultPricingRows] = useState(false);
  const [pricingFxRateEdit, setPricingFxRateEdit] = useState<string | null>(null);
  const [pricingCreditValueVndEdit, setPricingCreditValueVndEdit] = useState<string | null>(null);
  const [minimumPricePerCreditEdit, setMinimumPricePerCreditEdit] = useState<string | null>(null);
  const [minimumContractPriceEdit, setMinimumContractPriceEdit] = useState<string | null>(null);
  const [salesUsageWeightEdit, setSalesUsageWeightEdit] = useState<string | null>(null);
  const [salesMembersWeightEdit, setSalesMembersWeightEdit] = useState<string | null>(null);
  const [salesLanguagesWeightEdit, setSalesLanguagesWeightEdit] = useState<string | null>(null);
  const [salesAiServicesWeightEdit, setSalesAiServicesWeightEdit] = useState<string | null>(null);
  const [defaultOverageCapRatioEdit, setDefaultOverageCapRatioEdit] = useState<string | null>(null);
  const [defaultInvoiceTermsDaysEdit, setDefaultInvoiceTermsDaysEdit] = useState<string | null>(null);
  const [defaultInvoiceGraceHoursEdit, setDefaultInvoiceGraceHoursEdit] = useState<string | null>(null);
  const [vatRateEdit, setVatRateEdit] = useState<string | null>(null);
  const [yearlyDiscountMultiplierEdit, setYearlyDiscountMultiplierEdit] = useState<string | null>(null);
  const [pricingDraftSavedAt, setPricingDraftSavedAt] = useState<string | null>(null);
  const [billingPolicySavedAt, setBillingPolicySavedAt] = useState<string | null>(null);

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["admin-plans"],
    queryFn: () => billingService.getPlans(),
  });

  const enterprisePlan = useMemo(
    () => (plans as BaselinePlan[]).find(isEnterprisePlan) ?? null,
    [plans]
  );

  const displayedPlans = useMemo(
    () => (enterprisePlan ? [enterprisePlan] : (plans as BaselinePlan[])),
    [enterprisePlan, plans]
  );

  const { data: pricingConfig, isError: isPricingConfigError } = useQuery({
    queryKey: ["billing", "pricing-config"],
    queryFn: () => billingService.getPricingConfig(),
    retry: 1,
  });

  const { data: billingPolicy, isError: isBillingPolicyError } = useQuery({
    queryKey: ["billing", "billing-policy"],
    queryFn: () => billingService.getBillingPolicy(),
    retry: 1,
  });

  const { data: activeRateCards = [], isError: isRateCardLoadError } = useQuery({
    queryKey: ["billing", "usage-rate-card"],
    queryFn: () => billingService.getUsageRateCard(),
    retry: 1,
  });

  const basePricingDraftRows = useMemo(
    () => useDefaultPricingRows || activeRateCards.length === 0
      ? DEFAULT_PRICING_DRAFT_ROWS
      : activeRateCards.map(toPricingDraftRow),
    [activeRateCards, useDefaultPricingRows]
  );

  const pricingDraftRows = useMemo(
    () => basePricingDraftRows.map((row) => ({ ...row, ...pricingDraftEdits[row.id] })),
    [basePricingDraftRows, pricingDraftEdits]
  );

  const pricingFxRate = pricingFxRateEdit ?? pricingConfig?.fxRateUsdVnd.toString() ?? "";
  const pricingCreditValueVnd = pricingCreditValueVndEdit ?? pricingConfig?.creditValueVnd.toString() ?? "";
  const minimumPricePerCredit = minimumPricePerCreditEdit ?? pricingConfig?.minimumPricePerCreditVnd.toString() ?? String(BILLING_POLICY.minimumPricePerCreditVnd);
  const minimumContractPrice = minimumContractPriceEdit ?? pricingConfig?.minimumContractPriceVnd.toString() ?? String(BILLING_POLICY.minimumContractPriceVnd);
  const salesUsageWeight = salesUsageWeightEdit ?? pricingConfig?.salesUsageWeight.toString() ?? String(BILLING_POLICY.suggestionWeights.usage);
  const salesMembersWeight = salesMembersWeightEdit ?? pricingConfig?.salesMembersWeight.toString() ?? String(BILLING_POLICY.suggestionWeights.members);
  const salesLanguagesWeight = salesLanguagesWeightEdit ?? pricingConfig?.salesLanguagesWeight.toString() ?? String(BILLING_POLICY.suggestionWeights.languages);
  const salesAiServicesWeight = salesAiServicesWeightEdit ?? pricingConfig?.salesAiServicesWeight.toString() ?? String(BILLING_POLICY.suggestionWeights.aiServices);
  const defaultOverageCapRatio = defaultOverageCapRatioEdit ?? pricingConfig?.defaultOverageCapRatio.toString() ?? String(BILLING_POLICY.defaultOverageCapRatio);
  const defaultInvoiceTermsDays = defaultInvoiceTermsDaysEdit ?? pricingConfig?.defaultInvoiceTermsDays.toString() ?? String(BILLING_POLICY.defaultInvoiceTermsDays);
  const defaultInvoiceGraceHours = defaultInvoiceGraceHoursEdit ?? pricingConfig?.defaultInvoiceGraceHours.toString() ?? String(BILLING_POLICY.defaultInvoiceGraceHours);
  const vatRate = vatRateEdit ?? billingPolicy?.vatRate.toString() ?? "";
  const yearlyDiscountMultiplier = yearlyDiscountMultiplierEdit ?? billingPolicy?.yearlyDiscountMultiplier.toString() ?? "";
  const pricingFormula = pricingConfig?.formula ?? "";
  const pricingResolverKey = pricingConfig?.resolverKey ?? "";
  const salesWeightTotal =
    Number(salesUsageWeight) +
    Number(salesMembersWeight) +
    Number(salesLanguagesWeight) +
    Number(salesAiServicesWeight);
  const pricingInputsAreValid =
    Number(pricingFxRate) > 0 &&
    Number(pricingCreditValueVnd) > 0 &&
    Number(minimumPricePerCredit) > 0 &&
    Number(minimumContractPrice) > 0 &&
    salesWeightTotal > 0 &&
    Number(defaultOverageCapRatio) >= 0 &&
    Number(defaultOverageCapRatio) <= 1 &&
    Number(defaultInvoiceTermsDays) > 0 &&
    Number(defaultInvoiceGraceHours) > 0 &&
    pricingDraftRows.length > 0;
  const canSaveServicePricing =
    pricingInputsAreValid &&
    !isPricingConfigError &&
    !isRateCardLoadError &&
    (useDefaultPricingRows || activeRateCards.length > 0);
  const billingPolicyInputsAreValid =
    Number(vatRate) >= 0 &&
    Number(vatRate) <= 1 &&
    Number(yearlyDiscountMultiplier) > 0 &&
    Number(yearlyDiscountMultiplier) <= 1;
  const canSaveBillingPolicy = billingPolicyInputsAreValid && !isBillingPolicyError;

  const updatePlanMutation = useMutation({
    mutationFn: ({ id, plan }: { id: string; plan: BaselinePlanRequest }) => billingService.updatePlan(id, plan),
    onSuccess: () => {
      toast.success("Enterprise baseline updated");
      queryClient.invalidateQueries({ queryKey: ["admin-plans"] });
      queryClient.invalidateQueries({ queryKey: ["billing", "plans"] });
      queryClient.invalidateQueries({ queryKey: ["landing-plans"] });
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      if (typeof window !== "undefined" && "BroadcastChannel" in window) {
        try {
          new BroadcastChannel(BROADCAST_CHANNELS.NOTIFICATIONS_SYNC).postMessage("REFRESH_PLANS");
        } catch {
          // Ignored
        }
      }
      setEditingPlan(null);
      setErrorMsg(null);
    },
    onError: (err: unknown) => {
      setErrorMsg(getErrorMessage(err, "Failed to update Enterprise baseline."));
    },
  });

  const updatePricingConfigMutation = useMutation({
    mutationFn: () => billingService.updatePricingConfig({
      fxRateUsdVnd: Number(pricingFxRate) || 0,
      creditValueVnd: Number(pricingCreditValueVnd) || 0,
      minimumPricePerCreditVnd: Number(minimumPricePerCredit) || 0,
      minimumContractPriceVnd: Number(minimumContractPrice) || 0,
      minimumContractPriceUsd: pricingConfig?.minimumContractPriceUsd ?? BILLING_POLICY.minimumContractPriceUsd,
      salesUsageWeight: Number(salesUsageWeight) || 0,
      salesMembersWeight: Number(salesMembersWeight) || 0,
      salesLanguagesWeight: Number(salesLanguagesWeight) || 0,
      salesAiServicesWeight: Number(salesAiServicesWeight) || 0,
      defaultOverageCapRatio: Number(defaultOverageCapRatio) || 0,
      defaultInvoiceTermsDays: Number(defaultInvoiceTermsDays) || 0,
      defaultInvoiceGraceHours: Number(defaultInvoiceGraceHours) || 0,
    }),
    onSuccess: (saved) => {
      setPricingFxRateEdit(saved.fxRateUsdVnd.toString());
      setPricingCreditValueVndEdit(saved.creditValueVnd.toString());
      setMinimumPricePerCreditEdit(saved.minimumPricePerCreditVnd.toString());
      setMinimumContractPriceEdit(saved.minimumContractPriceVnd.toString());
      setSalesUsageWeightEdit(saved.salesUsageWeight.toString());
      setSalesMembersWeightEdit(saved.salesMembersWeight.toString());
      setSalesLanguagesWeightEdit(saved.salesLanguagesWeight.toString());
      setSalesAiServicesWeightEdit(saved.salesAiServicesWeight.toString());
      setDefaultOverageCapRatioEdit(saved.defaultOverageCapRatio.toString());
      setDefaultInvoiceTermsDaysEdit(saved.defaultInvoiceTermsDays.toString());
      setDefaultInvoiceGraceHoursEdit(saved.defaultInvoiceGraceHours.toString());
      queryClient.invalidateQueries({ queryKey: ["billing", "pricing-config"] });
    },
  });

  const updateBillingPolicyMutation = useMutation({
    mutationFn: () => billingService.updateBillingPolicy({
      vatRate: Number(vatRate) || 0,
      yearlyDiscountMultiplier: Number(yearlyDiscountMultiplier) || 0,
    }),
    onSuccess: (saved) => {
      setVatRateEdit(saved.vatRate.toString());
      setYearlyDiscountMultiplierEdit(saved.yearlyDiscountMultiplier.toString());
      setBillingPolicySavedAt(new Date().toLocaleTimeString());
      queryClient.invalidateQueries({ queryKey: ["billing", "billing-policy"] });
      toast.success("Invoice policy updated");
    },
    onError: (err: unknown) => {
      toast.error(getErrorMessage(err, "Failed to update invoice policy"));
    },
  });

  const upsertUsageRateCardMutation = useMutation({
    mutationFn: (row: PricingDraftRow) => {
      const fxRate = Number(pricingFxRate) || 0;
      const creditValue = Number(pricingCreditValueVnd) || 0;
      return billingService.upsertUsageRateCard({
        chargeType: row.chargeType,
        unit: row.unit,
        provider: row.provider,
        model: row.model,
        providerUnitCostUsd: row.providerUnitCostUsd,
        markupMultiplier: row.markupMultiplier,
        unitPrice: calculateDraftUnitPrice(row, fxRate, creditValue),
        currency: "VND",
        isActive: row.enabled,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing", "usage-rate-card"] });
    },
  });

  const openEnterpriseEditor = (plan: BaselinePlan) => {
    setEditingPlan(plan);
    setFormState(toBaselineForm(plan, pricingConfig));
    setErrorMsg(null);
  };

  const updateFormField = <K extends keyof BaselineFormState>(field: K, value: BaselineFormState[K]) => {
    setFormState((current) => ({ ...current, [field]: value }));
  };

  const updatePricingDraftRow = <K extends keyof PricingDraftRow>(
    id: string,
    field: K,
    value: PricingDraftRow[K]
  ) => {
    setPricingDraftEdits((current) => ({
      ...current,
      [id]: { ...current[id], [field]: value },
    }));
    setPricingDraftSavedAt(null);
  };

  const handleSaveBaseline = () => {
    if (!editingPlan) return;
    setErrorMsg(null);

    if (!isEnterprisePlan(editingPlan)) {
      setErrorMsg("Only the Enterprise baseline can be edited from this screen.");
      return;
    }

    const validationError = validateBaselineForm(formState, {
      minimumContractPriceVnd: Number(minimumContractPrice) || BILLING_POLICY.minimumContractPriceVnd,
      minimumPricePerCreditVnd: Number(minimumPricePerCredit) || BILLING_POLICY.minimumPricePerCreditVnd,
    });
    if (validationError) {
      setErrorMsg(validationError);
      return;
    }

    updatePlanMutation.mutate({ id: editingPlan.id, plan: toPlanPayload(editingPlan, formState) });
  };

  const handleSavePricingDraft = async () => {
    try {
      await updatePricingConfigMutation.mutateAsync();
      await Promise.all(pricingDraftRows.map((row) => upsertUsageRateCardMutation.mutateAsync(row)));
      setPricingDraftSavedAt(new Date().toLocaleTimeString());
      toast.success("Service pricing baseline updated");
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, "Failed to update service pricing baseline"));
    }
  };

  const handleResetPricingDraftDefaults = () => {
    setUseDefaultPricingRows(true);
    setPricingDraftEdits({});
    setPricingFxRateEdit(String(BILLING_POLICY.defaultFxRateUsdVnd));
    setPricingCreditValueVndEdit(String(BILLING_POLICY.defaultCreditValueVnd));
    setMinimumPricePerCreditEdit(String(BILLING_POLICY.minimumPricePerCreditVnd));
    setMinimumContractPriceEdit(String(BILLING_POLICY.minimumContractPriceVnd));
    setSalesUsageWeightEdit(String(BILLING_POLICY.suggestionWeights.usage));
    setSalesMembersWeightEdit(String(BILLING_POLICY.suggestionWeights.members));
    setSalesLanguagesWeightEdit(String(BILLING_POLICY.suggestionWeights.languages));
    setSalesAiServicesWeightEdit(String(BILLING_POLICY.suggestionWeights.aiServices));
    setDefaultOverageCapRatioEdit(String(BILLING_POLICY.defaultOverageCapRatio));
    setDefaultInvoiceTermsDaysEdit(String(BILLING_POLICY.defaultInvoiceTermsDays));
    setDefaultInvoiceGraceHoursEdit(String(BILLING_POLICY.defaultInvoiceGraceHours));
    setPricingDraftSavedAt(null);
  };

  return (
    <div className="flex min-h-full flex-col gap-6 p-6 pb-12">
      <div className="rounded-xl border border-hairline bg-surface-1 p-6 shadow-linear">
        <div>
          <div className="mb-1 flex items-center gap-3">
            <Link href="/billing">
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <h1 className="text-2xl font-semibold tracking-tight">Subscription Plans</h1>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Manage Enterprise baseline, usage limits, and default service pricing.
          </p>
        </div>
      </div>

      <Card className="rounded-xl border-hairline bg-surface-1 shadow-linear">
        <CardHeader>
          <CardTitle>Enterprise baseline</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : displayedPlans.length === 0 ? (
            <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-hairline p-6 text-center text-sm text-muted-foreground">
              Enterprise baseline was not found.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-hairline hover:bg-transparent">
                  <TableHead className="w-[180px]">Name</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Credits/Cycle</TableHead>
                  <TableHead>Billing Defaults</TableHead>
                  <TableHead>Limits (Voice / Glossary / ACL)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayedPlans.map((plan) => (
                  <TableRow key={plan.id} className="border-hairline hover:bg-surface-2/20">
                    <TableCell className="font-medium">
                      <div>
                        <span className="text-sm">{plan.name}</span>
                        <div className="font-mono text-xs text-muted-foreground">{plan.slug}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="bg-surface-2">{plan.tier}</Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-semibold">
                        {plan.price === 0 ? "Free" : `${plan.price.toLocaleString()} ${plan.currency}`}
                      </span>
                      <div className="text-xs capitalize text-muted-foreground">{plan.billingCycle}</div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{plan.creditsPerCycle?.toLocaleString()}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                        <span>Extra usage: {(plan.overageCapCredits ?? 0).toLocaleString()} @ {plan.overagePricePerCredit ?? 0}/credit</span>
                        <span>Warn: {(plan.lowBalanceThresholdCredits ?? 0).toLocaleString()}</span>
                        <span>Rollover: {(plan.rolloverCapCredits ?? 0).toLocaleString()}</span>
                        <span>
                          Invoice: NET-{plan.invoiceTermsDays ?? BILLING_POLICY.defaultInvoiceTermsDays}, grace{" "}
                          {plan.invoiceGraceHours ?? BILLING_POLICY.defaultInvoiceGraceHours}h
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 text-xs">
                        <span className="flex items-center gap-1.5">
                          <CheckCircle2 className={`h-3.5 w-3.5 ${plan.voiceCloneEnabled ? "text-emerald-500" : "text-muted-foreground"}`} />
                          Voice Clone: {renderEnabled(plan.voiceCloneEnabled)}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <CheckCircle2 className={`h-3.5 w-3.5 ${plan.glossaryEnabled ? "text-emerald-500" : "text-muted-foreground"}`} />
                          Glossary Access: {renderEnabled(plan.glossaryEnabled)}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <CheckCircle2 className={`h-3.5 w-3.5 ${plan.aiAssistantEnabled ? "text-emerald-500" : "text-muted-foreground"}`} />
                          AI Service ACL: {renderEnabled(plan.aiAssistantEnabled)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={plan.isActive !== false ? "default" : "destructive"} className="rounded-full">
                        {plan.isActive !== false ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        onClick={() => openEnterpriseEditor(plan)}
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-md px-3 text-xs font-medium"
                      >
                        Edit baseline
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-xl border-hairline bg-surface-1 shadow-linear">
        <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base font-medium">
              <SlidersHorizontal className="h-4 w-4 text-primary" /> Invoice policy
            </CardTitle>
          </div>
          {billingPolicySavedAt && (
            <Badge variant="outline" className="w-fit rounded-md">Applied {billingPolicySavedAt}</Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">VAT rate</Label>
              <Input
                type="number"
                min={0}
                max={1}
                step="0.01"
                className="h-9 text-sm"
                value={vatRate}
                onChange={(e) => { setVatRateEdit(e.target.value); setBillingPolicySavedAt(null); }}
              />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">Yearly discount multiplier</Label>
              <Input
                type="number"
                min={0.01}
                max={1}
                step="0.01"
                className="h-9 text-sm"
                value={yearlyDiscountMultiplier}
                onChange={(e) => { setYearlyDiscountMultiplierEdit(e.target.value); setBillingPolicySavedAt(null); }}
              />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">Invoice multiplier preview</Label>
              <div className="flex h-9 items-center rounded-md border border-hairline bg-muted/40 px-3 text-sm font-medium">
                VAT {(Number(vatRate) * 100 || 0).toFixed(2)}% / yearly x{Number(yearlyDiscountMultiplier || 0).toFixed(2)}
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-md bg-surface-2"
              disabled={!canSaveBillingPolicy || updateBillingPolicyMutation.isPending}
              onClick={() => updateBillingPolicyMutation.mutate()}
            >
              {updateBillingPolicyMutation.isPending ? "Saving..." : "Save invoice policy"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-xl border-hairline bg-surface-1 shadow-linear">
        <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base font-medium">
              <SlidersHorizontal className="h-4 w-4 text-primary" /> Default service pricing
            </CardTitle>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-md bg-surface-2"
              disabled={!canSaveServicePricing || updatePricingConfigMutation.isPending || upsertUsageRateCardMutation.isPending}
              onClick={handleResetPricingDraftDefaults}
            >
              Reset defaults
            </Button>
            {pricingDraftSavedAt && (
              <Badge variant="outline" className="rounded-md">Applied {pricingDraftSavedAt}</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">USD/VND FX</Label>
              <Input
                type="number"
                min={1}
                className="h-9 text-sm"
                value={pricingFxRate}
                onChange={(e) => { setPricingFxRateEdit(e.target.value); setPricingDraftSavedAt(null); }}
              />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">Credit value VND</Label>
              <Input
                type="number"
                min={0.01}
                step="0.01"
                className="h-9 text-sm"
                value={pricingCreditValueVnd}
                onChange={(e) => { setPricingCreditValueVndEdit(e.target.value); setPricingDraftSavedAt(null); }}
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">Minimum VND / credit</Label>
              <Input
                type="number"
                min={0.01}
                step="0.01"
                className="h-9 text-sm"
                value={minimumPricePerCredit}
                onChange={(e) => { setMinimumPricePerCreditEdit(e.target.value); setPricingDraftSavedAt(null); }}
              />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">Minimum contract VND</Label>
              <Input
                type="number"
                min={1}
                className="h-9 text-sm"
                value={minimumContractPrice}
                onChange={(e) => { setMinimumContractPriceEdit(e.target.value); setPricingDraftSavedAt(null); }}
              />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">Default overage ratio</Label>
              <Input
                type="number"
                min={0}
                max={1}
                step="0.01"
                className="h-9 text-sm"
                value={defaultOverageCapRatio}
                onChange={(e) => { setDefaultOverageCapRatioEdit(e.target.value); setPricingDraftSavedAt(null); }}
              />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">Default invoice terms days</Label>
              <Input
                type="number"
                min={1}
                className="h-9 text-sm"
                value={defaultInvoiceTermsDays}
                onChange={(e) => { setDefaultInvoiceTermsDaysEdit(e.target.value); setPricingDraftSavedAt(null); }}
              />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">Default grace hours</Label>
              <Input
                type="number"
                min={1}
                className="h-9 text-sm"
                value={defaultInvoiceGraceHours}
                onChange={(e) => { setDefaultInvoiceGraceHoursEdit(e.target.value); setPricingDraftSavedAt(null); }}
              />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">Sales weight total</Label>
              <div className="flex h-9 items-center rounded-md border border-hairline bg-muted/40 px-3 text-sm font-medium">
                {Number.isFinite(salesWeightTotal) ? salesWeightTotal.toFixed(2) : "Invalid"}
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">Usage weight</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                className="h-9 text-sm"
                value={salesUsageWeight}
                onChange={(e) => { setSalesUsageWeightEdit(e.target.value); setPricingDraftSavedAt(null); }}
              />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">Members weight</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                className="h-9 text-sm"
                value={salesMembersWeight}
                onChange={(e) => { setSalesMembersWeightEdit(e.target.value); setPricingDraftSavedAt(null); }}
              />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">Languages weight</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                className="h-9 text-sm"
                value={salesLanguagesWeight}
                onChange={(e) => { setSalesLanguagesWeightEdit(e.target.value); setPricingDraftSavedAt(null); }}
              />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">AI services weight</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                className="h-9 text-sm"
                value={salesAiServicesWeight}
                onChange={(e) => { setSalesAiServicesWeightEdit(e.target.value); setPricingDraftSavedAt(null); }}
              />
            </div>
          </div>

          <div className="overflow-hidden rounded-md border border-hairline">
            <Table>
              <TableHeader className="bg-surface-2">
                <TableRow className="h-12">
                  <TableHead className="w-[88px] align-middle">Active</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead className="text-right">Provider cost (USD)</TableHead>
                  <TableHead className="text-right">Markup</TableHead>
                  <TableHead className="text-right">Unit price</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pricingDraftRows.map((row) => {
                  const fxRate = Number(pricingFxRate) || 0;
                  const creditValue = Number(pricingCreditValueVnd) || 0;
                  const unitPrice = calculateDraftUnitPrice(row, fxRate, creditValue);
                  return (
                    <TableRow key={row.id} className="h-[72px] align-middle">
                      <TableCell className="py-3 align-middle">
                        <Switch
                          checked={row.enabled}
                          onCheckedChange={(checked) => updatePricingDraftRow(row.id, "enabled", checked)}
                        />
                      </TableCell>
                      <TableCell className="py-3 align-middle">
                        <div className="flex h-12 min-w-[210px] items-center rounded-md border border-hairline bg-muted/40 px-3">
                          <p className="text-xs font-semibold text-foreground">{SERVICE_LABELS[row.chargeType] ?? row.chargeType}</p>
                        </div>
                      </TableCell>
                      <TableCell className="py-3 align-middle">
                        <div className="flex h-12 min-w-[130px] items-center rounded-md border border-hairline bg-muted/40 px-3 text-xs font-medium text-muted-foreground">
                          {row.unit}
                        </div>
                      </TableCell>
                      <TableCell className="py-3 align-middle">
                        <div className="flex h-12 min-w-[120px] items-center rounded-md border border-hairline bg-muted/40 px-3 text-xs font-medium text-muted-foreground">
                          {row.provider}
                        </div>
                      </TableCell>
                      <TableCell className="py-3 align-middle">
                        <div className="flex h-12 min-w-[190px] items-center rounded-md border border-hairline bg-muted/40 px-3 text-xs font-medium text-muted-foreground">
                          {row.model}
                        </div>
                      </TableCell>
                      <TableCell className="py-3 align-middle">
                        <Input
                          type="text"
                          inputMode="decimal"
                          className="h-12 min-w-[120px] text-right font-mono text-xs"
                          value={formatProviderCostUsd(row.providerUnitCostUsd)}
                          onChange={(e) => updatePricingDraftRow(row.id, "providerUnitCostUsd", Number(e.target.value) || 0)}
                        />
                      </TableCell>
                      <TableCell className="py-3 align-middle">
                        <Input
                          type="number"
                          min={0}
                          step="0.1"
                          className="h-12 min-w-[86px] text-right font-mono text-xs"
                          value={row.markupMultiplier}
                          onChange={(e) => updatePricingDraftRow(row.id, "markupMultiplier", Number(e.target.value) || 0)}
                        />
                      </TableCell>
                      <TableCell className="py-3 align-middle">
                        <div className="flex h-12 min-w-[100px] items-center justify-end rounded-md border border-transparent px-3 text-right font-mono text-xs font-semibold">
                          {unitPrice.toFixed(6)}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-3 rounded-lg border border-hairline bg-surface-2/50 p-3 md:flex-row md:items-center md:justify-between">
            <p className="text-xs text-muted-foreground">
              Formula:{" "}
              <span className="font-mono text-foreground">
                {pricingFormula || "Loaded from billing pricing config"}
              </span>
              {pricingResolverKey && (
                <>
                  {" "}Resolver: <span className="font-mono text-foreground">{pricingResolverKey}</span>
                </>
              )}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-md bg-surface-1"
              disabled={!canSaveServicePricing || updatePricingConfigMutation.isPending || upsertUsageRateCardMutation.isPending}
              onClick={handleSavePricingDraft}
            >
              {updatePricingConfigMutation.isPending || upsertUsageRateCardMutation.isPending ? "Saving..." : "Save service baseline"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!editingPlan} onOpenChange={(open) => !open && setEditingPlan(null)}>
        <DialogContent style={{ maxWidth: "860px", width: "95vw" }} className="max-h-[90vh] overflow-y-auto rounded-lg border-hairline bg-surface-1 text-ink shadow-linear">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Edit Enterprise baseline
            </DialogTitle>
          </DialogHeader>

          {errorMsg && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
              {errorMsg}
            </div>
          )}

          <div className="grid gap-5 py-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="grid gap-2">
                <Label>Price</Label>
                <Input className="h-11" type="number" min={Number(minimumContractPrice) || BILLING_POLICY.minimumContractPriceVnd} step="1000" value={formState.price} onChange={(e) => updateFormField("price", e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>Credits/Cycle</Label>
                <Input className="h-11" type="number" min={1} step="1" value={formState.creditsPerCycle} onChange={(e) => updateFormField("creditsPerCycle", e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>Warning credits</Label>
                <Input className="h-11" type="number" min={0} step="1" value={formState.lowBalanceThresholdCredits} onChange={(e) => updateFormField("lowBalanceThresholdCredits", e.target.value)} />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="grid gap-2">
                <Label>Extra usage cap</Label>
                <Input className="h-11" type="number" min={0} step="1" value={formState.overageCapCredits} onChange={(e) => updateFormField("overageCapCredits", e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>Extra usage price/credit</Label>
                <Input className="h-11" type="number" min={0} step="0.01" value={formState.overagePricePerCredit} onChange={(e) => updateFormField("overagePricePerCredit", e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>Rollover cap</Label>
                <Input className="h-11" type="number" min={0} step="1" value={formState.rolloverCapCredits} onChange={(e) => updateFormField("rolloverCapCredits", e.target.value)} />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
              <div className="grid gap-2">
                <Label>Invoice terms days</Label>
                <Input className="h-11" type="number" min={1} step="1" value={formState.invoiceTermsDays} onChange={(e) => updateFormField("invoiceTermsDays", e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>Invoice grace hours</Label>
                <Input className="h-11" type="number" min={1} step="1" value={formState.invoiceGraceHours} onChange={(e) => updateFormField("invoiceGraceHours", e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>Max participants</Label>
                <Input className="h-11" type="number" min={2} step="1" value={formState.maxParticipants} onChange={(e) => updateFormField("maxParticipants", e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>Max languages</Label>
                <Input className="h-11" type="number" min={1} max={3} step="1" value={formState.maxLanguages} onChange={(e) => updateFormField("maxLanguages", e.target.value)} />
              </div>
            </div>

            <div className="grid gap-x-6 gap-y-4 rounded-lg border border-hairline bg-surface-2/40 p-5 md:grid-cols-2">
              <div className="grid min-h-10 grid-cols-[1fr_auto] items-center gap-4">
                <Label>Voice Clone</Label>
                <Switch checked={formState.voiceCloneEnabled} onCheckedChange={(checked) => updateFormField("voiceCloneEnabled", checked)} />
              </div>
              <div className="grid min-h-10 grid-cols-[1fr_auto] items-center gap-4">
                <Label>AI Service ACL</Label>
                <Switch checked={formState.aiAssistantEnabled} onCheckedChange={(checked) => updateFormField("aiAssistantEnabled", checked)} />
              </div>
              <div className="grid min-h-10 grid-cols-[1fr_auto] items-center gap-4">
                <Label>Glossary Access</Label>
                <Switch checked={formState.glossaryEnabled} onCheckedChange={(checked) => updateFormField("glossaryEnabled", checked)} />
              </div>
              <div className="grid min-h-10 grid-cols-[1fr_auto] items-center gap-4">
                <Label>Dedicated GPU</Label>
                <Switch checked={formState.dedicatedGpu} onCheckedChange={(checked) => updateFormField("dedicatedGpu", checked)} />
              </div>
              <div className="grid min-h-10 grid-cols-[1fr_auto] items-center gap-4 md:col-span-2">
                <div>
                  <Label>Active baseline</Label>
                  <p className="mt-1 text-xs text-muted-foreground">Use this template for new Enterprise contracts.</p>
                </div>
                <Switch checked={formState.isActive} onCheckedChange={(checked) => updateFormField("isActive", checked)} />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 border-t border-hairline pt-4">
            <Button variant="outline" onClick={() => setEditingPlan(null)} className="rounded-md">
              Cancel
            </Button>
            <Button
              onClick={handleSaveBaseline}
              className="rounded-md bg-primary text-primary-foreground hover:bg-primary-hover"
              disabled={updatePlanMutation.isPending}
            >
              {updatePlanMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" /> Save baseline
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
