"use client";

import { Download, Coins, CreditCard, ArrowUpRight, ArrowDownRight, Spinner, CaretLeft } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import React, { useEffect, useState, useMemo, use } from "react";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { billingService } from "@/services/billing.service";
import { WorkspaceService } from "@/services/workspace.service";
import type { UsageRateCardDto, InvoiceDto, SubscriptionDto, PlanDto, PlanRequest, SalesInquiryDto, CreditTransactionDto } from "@/types/billing";
import { AdjustCreditModal } from "@/components/admin/AdjustCreditModal";
import { toast } from "sonner";

type ContractTermsFormState = {
  creditsPerCycleOverride: string;
  contractPriceVnd: string;
  overageCapCreditsOverride: string;
  overagePricePerCreditOverride: string;
  invoiceTermsDaysOverride: string;
  billingContactEmail: string;
};

type CreditTransactionGroup = CreditTransactionDto & {
  originalTx: CreditTransactionDto[];
};

type ServiceBreakdown = {
  count: number;
  cost: number;
  rawType: string;
};

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null) {
    const response = (error as { response?: { data?: { message?: unknown; error?: unknown } } }).response;
    const message = response?.data?.message ?? response?.data?.error;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

const EMPTY_CONTRACT_TERMS_FORM: ContractTermsFormState = {
  creditsPerCycleOverride: "",
  contractPriceVnd: "",
  overageCapCreditsOverride: "",
  overagePricePerCreditOverride: "",
  invoiceTermsDaysOverride: "",
  billingContactEmail: "",
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

type PlanBaselineFormState = {
  price: string;
  creditsPerCycle: string;
  overagePricePerCredit: string;
  overageCapCredits: string;
  rolloverCapCredits: string;
  invoiceTermsDays: string;
};

const EMPTY_PLAN_BASELINE_FORM: PlanBaselineFormState = {
  price: "1900000",
  creditsPerCycle: "700000",
  overagePricePerCredit: "4",
  overageCapCredits: "105000",
  rolloverCapCredits: "2000000",
  invoiceTermsDays: "15",
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

const RATE_CARD_SERVICE_DEFINITIONS = [
  {
    value: "STT",
    label: "Speech to Text",
    description: "Transcribes live meeting audio.",
    provider: "openai",
    units: ["second"],
  },
  {
    value: "TRANSLATION",
    label: "Translation",
    description: "Translates meeting text with token billing.",
    provider: "openai",
    units: ["token_in", "token_in_cached", "token_out"],
  },
  {
    value: "AUDIO_DUBBING_STANDARD",
    label: "TTS standard",
    description: "Generates speech with standard voices.",
    provider: "cartesia",
    units: ["character"],
  },
  {
    value: "AUDIO_DUBBING_VOICE_CLONE",
    label: "TTS voice clone",
    description: "Generates speech with cloned voices.",
    provider: "cartesia",
    units: ["character"],
  },
  {
    value: "VOICE_CLONE_ENROLLMENT",
    label: "Voice enrollment",
    description: "One-time voice profile/localizing charge.",
    provider: "cartesia",
    units: ["profile"],
  },
  {
    value: "AI_ASSISTANT",
    label: "AI Assistant",
    description: "Workspace assistant and meeting Q&A.",
    provider: "openai",
    units: ["token_in", "token_in_cached", "token_out"],
  },
  {
    value: "AI_SUMMARY",
    label: "AI Summary",
    description: "Meeting summary and action-item generation.",
    provider: "openai",
    units: ["token_in", "token_in_cached", "token_out"],
  },
];

function getRateCardService(chargeType: string) {
  return RATE_CARD_SERVICE_DEFINITIONS.find((service) => service.value === chargeType) ?? RATE_CARD_SERVICE_DEFINITIONS[0];
}

const SALES_FEATURE_LABELS: Record<string, string> = {
  enterprise_contract: "Enterprise contract",
  workspace_trial: "Workspace trial",
  ai_meetings: "AI meetings",
  live_translation: "Real-time translation",
  ai_summary: "AI meeting summaries",
  translated_audio: "Voice translation / TTS",
  voice_clone: "Voice cloning",
  glossary_access: "Glossary access",
};

const LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  vi: "Vietnamese",
  ja: "Japanese",
};

function formatSalesLabels(values: string[], labels: Record<string, string>): string {
  if (!values.length) return "N/A";
  return values.map((value) => labels[value] ?? value).join(", ");
}

function getSalesRequestStatusLabel(inquiry: SalesInquiryDto, hasActiveBilling: boolean): string {
  if (hasActiveBilling && inquiry.status === "new") return "Under review";
  if (inquiry.status === "reviewing") return "Under review";
  if (inquiry.status === "quoted") return "Quoted";
  if (inquiry.status === "converted") return "Converted";
  if (inquiry.status === "closed") return "Closed";
  return "New";
}

function getWorkspaceServiceStateLabel(subscription?: SubscriptionDto | null): string {
  if (!subscription) return "Not active";
  const status = subscription.status?.toLowerCase();
  if (status === "cancelled") return "Cancelled";
  if (status === "expired") return "Expired";
  if (status === "pending") return "Pending";
  if (status === "suspended") return "Suspended";
  return subscription.serviceState ?? "Unknown";
}

function calculateDraftUnitPrice(row: PricingDraftRow, fxRate: number, creditValueVnd: number): number {
  if (!row.enabled || creditValueVnd <= 0) return 0;
  return (row.providerUnitCostUsd * fxRate * row.markupMultiplier) / creditValueVnd;
}

function formatProviderCostUsd(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  return value.toFixed(12).replace(/\.?0+$/, "");
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

function toContractTermsForm(subscription?: SubscriptionDto | null): ContractTermsFormState {
  if (!subscription) return EMPTY_CONTRACT_TERMS_FORM;

  return {
    creditsPerCycleOverride: subscription.creditsPerCycleOverride?.toString() ?? "",
    contractPriceVnd: subscription.contractPriceVnd?.toString() ?? "",
    overageCapCreditsOverride: subscription.overageCapCreditsOverride?.toString() ?? "",
    overagePricePerCreditOverride: subscription.overagePricePerCreditOverride?.toString() ?? "",
    invoiceTermsDaysOverride: subscription.invoiceTermsDaysOverride?.toString() ?? "",
    billingContactEmail: subscription.billingContactEmail ?? "",
  };
}

function toPlanBaselineForm(plan?: PlanDto | null): PlanBaselineFormState {
  if (!plan) return EMPTY_PLAN_BASELINE_FORM;

  return {
    price: plan.price?.toString() ?? "",
    creditsPerCycle: plan.creditsPerCycle?.toString() ?? "",
    overagePricePerCredit: plan.overagePricePerCredit?.toString() ?? "",
    overageCapCredits: plan.overageCapCredits?.toString() ?? "",
    rolloverCapCredits: plan.rolloverCapCredits?.toString() ?? "",
    invoiceTermsDays: plan.invoiceTermsDays?.toString() ?? "",
  };
}

function toPlanRequest(plan: PlanDto, form: PlanBaselineFormState): PlanRequest {
  return {
    name: plan.name,
    slug: plan.slug,
    tier: plan.tier,
    price: Number(form.price) || 0,
    currency: plan.currency || "VND",
    billingCycle: plan.billingCycle || "monthly",
    creditsPerCycle: Number(form.creditsPerCycle) || 0,
    maxParticipants: plan.maxParticipants ?? 0,
    maxLanguages: plan.maxLanguages ?? 0,
    voiceCloneEnabled: plan.voiceCloneEnabled ?? false,
    aiAssistantEnabled: plan.aiAssistantEnabled ?? false,
    glossaryEnabled: plan.glossaryEnabled ?? false,
    dedicatedGpu: plan.dedicatedGpu ?? false,
    features: plan.features || "{}",
    sortOrder: plan.sortOrder ?? 0,
    overageCapCredits: Number(form.overageCapCredits) || 0,
    overagePricePerCredit: Number(form.overagePricePerCredit) || 0,
    lowBalanceThresholdCredits: plan.lowBalanceThresholdCredits ?? 0,
    rolloverCapCredits: Number(form.rolloverCapCredits) || 0,
    invoiceTermsDays: Number(form.invoiceTermsDays) || 15,
    invoiceGraceHours: plan.invoiceGraceHours ?? 360,
    isActive: plan.isActive,
  };
}

function toOptionalNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function toOptionalOverrideNumber(value: string, inheritedValue: string): number | null {
  const parsed = toOptionalNumber(value);
  const inherited = toOptionalNumber(inheritedValue);
  if (parsed === null) return null;
  if (inherited !== null && parsed === inherited) return null;
  return parsed;
}

function formatContractValue(value: number | null | undefined, inheritedValue: string): string {
  if (value !== undefined && value !== null) return value.toLocaleString();
  const inherited = toOptionalNumber(inheritedValue);
  return inherited === null ? "N/A" : inherited.toLocaleString();
}

function getSalesEstimateNumber(inquiry: SalesInquiryDto | undefined, key: string): number | null {
  const estimate = inquiry?.pricingEstimate;
  if (!estimate || typeof estimate !== "object") return null;
  const value = (estimate as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getLabelForUsage(usageType: string) {
  if (usageType === "translation" || usageType === "voice_translation") return "Real-time Translation";
  if (usageType === "summary" || usageType === "meeting_summary") return "AI meeting insights";
  if (usageType === "chat") return "AI workspace chat";
  return usageType;
}

function getUnitSuffixForUsage(usageType: string): string {
  const t = usageType.toLowerCase();
  if (t === "translation" || t === "voice_translation") return "cr/min";
  if (t === "summary" || t === "meeting_summary") return "cr/req";
  if (t === "text_to_speech") return "cr/min";
  if (t === "voice_cloning") return "cr/min";
  return "cr";
}

function getInvoiceAmount(invoice: InvoiceDto): number {
  return invoice.total ?? invoice.amount ?? 0;
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

function isInvoicePaid(invoice: InvoiceDto): boolean {
  return invoice.status?.toLowerCase() === "paid";
}

function isInvoiceOpen(invoice: InvoiceDto): boolean {
  const status = invoice.status?.toLowerCase();
  return status === "open" || status === "issued" || status === "pending";
}

function getInvoiceDueStage(invoice: InvoiceDto): "paid" | "issued" | "due_soon" | "due_tomorrow" | "overdue" | "seven_days_overdue" | "grace_expiring" | "unknown" {
  if (isInvoicePaid(invoice)) return "paid";
  if (!isInvoiceOpen(invoice) || !invoice.dueAt) return "unknown";

  const now = Date.now();
  const dueAt = new Date(invoice.dueAt).getTime();
  const diffDays = (dueAt - now) / (24 * 60 * 60 * 1000);

  if (diffDays <= -15) return "grace_expiring";
  if (diffDays <= -7) return "seven_days_overdue";
  if (diffDays <= 0) return "overdue";
  if (diffDays <= 1) return "due_tomorrow";
  if (diffDays <= 7) return "due_soon";
  return "issued";
}

function getInvoiceStatusLabel(invoice: InvoiceDto): string {
  if (isInvoicePaid(invoice)) return "Paid";
  if (isInvoiceOpen(invoice)) {
    const dueStage = getInvoiceDueStage(invoice);
    if (dueStage === "issued") return "Issued";
    if (dueStage === "due_soon") return "Due in 7 days";
    if (dueStage === "due_tomorrow") return "Due tomorrow";
    if (dueStage === "overdue") return "Overdue";
    if (dueStage === "seven_days_overdue") return "7 days overdue";
    if (dueStage === "grace_expiring") return "Suspend window";
    return "Payment due";
  }
  return invoice.status || "Unknown";
}

function getInvoiceStatusClass(invoice: InvoiceDto): string {
  if (isInvoicePaid(invoice)) return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700";
  if (isInvoiceOpen(invoice)) {
    const dueStage = getInvoiceDueStage(invoice);
    if (dueStage === "issued") return "border-sky-500/30 bg-sky-500/10 text-sky-700";
    if (dueStage === "due_soon" || dueStage === "due_tomorrow") return "border-amber-500/30 bg-amber-500/10 text-amber-700";
    if (dueStage === "overdue" || dueStage === "seven_days_overdue") return "border-orange-500/30 bg-orange-500/10 text-orange-700";
    if (dueStage === "grace_expiring") return "border-red-500/30 bg-red-500/10 text-red-700";
    return "border-amber-500/30 bg-amber-500/10 text-amber-700";
  }
  return "border-hairline bg-surface-2 text-muted-foreground";
}

function getInvoiceDueLabel(invoice: InvoiceDto): string {
  if (!invoice.dueAt) return "No terms";
  return format(new Date(invoice.dueAt), "MMM dd, yyyy HH:mm");
}

export default function AdminWorkspaceBillingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const embedded = true;
  const queryClient = useQueryClient();
  const router = useRouter();
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [exportNote, setExportNote] = useState("");
  const [workspaceSearch, setWorkspaceSearch] = useState("");
  const [contractTermsEdits, setContractTermsEdits] = useState<Partial<ContractTermsFormState>>({});
  const [pricingDraftRows, setPricingDraftRows] = useState<PricingDraftRow[]>(DEFAULT_PRICING_DRAFT_ROWS);
  const [pricingFxRate, setPricingFxRate] = useState("26300");
  const [pricingCreditValueVnd, setPricingCreditValueVnd] = useState("4");
  const [pricingDraftSavedAt, setPricingDraftSavedAt] = useState<string | null>(null);
  const [planBaselineEdits, setPlanBaselineEdits] = useState<Partial<PlanBaselineFormState>>({});

  // In Next.js 15+, params is a Promise and must be unwrapped
  const resolvedParams = React.use(params);
  const workspaceId = resolvedParams.id;
  const isWorkspaceIdValid =
    /^[0-9a-fA-F-]{36}$/.test(workspaceId) &&
    workspaceId !== "00000000-0000-0000-0000-000000000000";

  const { data: balance, isLoading: isBalanceLoading } = useQuery({
    queryKey: ["billing", "balance", workspaceId],
    queryFn: () => billingService.getWorkspaceCredits(workspaceId),
    enabled: !!workspaceId && isWorkspaceIdValid,
    retry: 1,
  });

  const {
    data: workspaceInfo,
    isError: isWorkspaceInfoError,
    isLoading: isWorkspaceInfoLoading,
  } = useQuery({
    queryKey: ["workspace", workspaceId],
    queryFn: () => WorkspaceService.getById(workspaceId),
    enabled: !!workspaceId && isWorkspaceIdValid,
    retry: 1,
  });

  const { data: workspacePickerPage, isLoading: isWorkspacePickerLoading } = useQuery({
    queryKey: ["admin", "billing-workspace-picker", workspaceSearch],
    queryFn: () => WorkspaceService.list(1, 8, workspaceSearch.trim()),
    enabled: embedded,
    retry: 1,
  });

  const [invoicesPageNumber, setInvoicesPageNumber] = useState(1);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceDto | null>(null);
  const [selectedTxGroup, setSelectedTxGroup] = useState<CreditTransactionGroup | null>(null);

  const { data: subscription, isLoading: isSubscriptionLoading } = useQuery({
    queryKey: ["billing", "subscription", workspaceId],
    queryFn: () => billingService.getActiveSubscription(workspaceId),
    enabled: !!workspaceId && isWorkspaceIdValid,
    retry: 1,
  });

  const { data: salesInquiryPage } = useQuery({
    queryKey: ["sales-inquiries", "workspace", workspaceId],
    queryFn: () => billingService.getSalesInquiries(1, 5, { workspaceId }),
    enabled: embedded && !!workspaceId && isWorkspaceIdValid,
    retry: 1,
  });

  const latestSalesInquiry = salesInquiryPage?.items?.[0];

  const { data: plans = [], isError: isPlansLoadError } = useQuery({
    queryKey: ["billing", "plans"],
    queryFn: () => billingService.getPlans(),
    enabled: embedded,
    retry: 1,
  });

  const enterprisePlan = useMemo(
    () => plans.find((plan) =>
      plan.slug?.toLowerCase() === "enterprise" ||
      plan.tier?.toLowerCase() === "enterprise"
    ) ?? null,
    [plans]
  );

  const { data: pricingConfig } = useQuery({
    queryKey: ["billing", "pricing-config"],
    queryFn: () => billingService.getPricingConfig(),
    enabled: embedded,
    retry: 1,
  });

  const { data: activeRateCards = [], isError: isRateCardLoadError } = useQuery({
    queryKey: ["billing", "usage-rate-card"],
    queryFn: () => billingService.getUsageRateCard(),
    enabled: embedded,
    retry: 1,
  });

  const contractTermsForm = useMemo(
    () => ({ ...toContractTermsForm(subscription), ...contractTermsEdits }),
    [subscription, contractTermsEdits]
  );

  const planBaselineForm = useMemo(
    () => ({ ...toPlanBaselineForm(enterprisePlan), ...planBaselineEdits }),
    [enterprisePlan, planBaselineEdits]
  );

  const contractTermsDisplayForm = useMemo(
    () => ({
      creditsPerCycleOverride: contractTermsForm.creditsPerCycleOverride || planBaselineForm.creditsPerCycle,
      contractPriceVnd: contractTermsForm.contractPriceVnd || planBaselineForm.price,
      overageCapCreditsOverride: contractTermsForm.overageCapCreditsOverride || planBaselineForm.overageCapCredits,
      overagePricePerCreditOverride: contractTermsForm.overagePricePerCreditOverride || planBaselineForm.overagePricePerCredit,
      invoiceTermsDaysOverride: contractTermsForm.invoiceTermsDaysOverride || planBaselineForm.invoiceTermsDays,
      billingContactEmail: contractTermsForm.billingContactEmail,
    }),
    [contractTermsForm, planBaselineForm]
  );

  const updateEnterprisePlanMutation = useMutation({
    mutationFn: () => {
      if (!enterprisePlan) throw new Error("Enterprise baseline plan is unavailable");
      return billingService.updatePlan(enterprisePlan.id, toPlanRequest(enterprisePlan, planBaselineForm));
    },
    onSuccess: () => {
      toast.success("Enterprise baseline updated");
      setPlanBaselineEdits({});
      queryClient.invalidateQueries({ queryKey: ["billing", "plans"] });
      queryClient.invalidateQueries({ queryKey: ["billing", "subscription", workspaceId] });
    },
    onError: (err: unknown) => {
      toast.error(getErrorMessage(err, "Failed to update Enterprise baseline"));
    },
  });

  const updateContractTermsMutation = useMutation({
    mutationFn: () => billingService.updateSubscriptionContractTerms(workspaceId, {
      creditsPerCycleOverride: toOptionalOverrideNumber(contractTermsForm.creditsPerCycleOverride, planBaselineForm.creditsPerCycle),
      contractPriceVnd: toOptionalOverrideNumber(contractTermsForm.contractPriceVnd, planBaselineForm.price),
      overageCapCreditsOverride: toOptionalOverrideNumber(contractTermsForm.overageCapCreditsOverride, planBaselineForm.overageCapCredits),
      overagePricePerCreditOverride: toOptionalOverrideNumber(contractTermsForm.overagePricePerCreditOverride, planBaselineForm.overagePricePerCredit),
      invoiceTermsDaysOverride: toOptionalOverrideNumber(contractTermsForm.invoiceTermsDaysOverride, planBaselineForm.invoiceTermsDays),
      billingContactEmail: contractTermsForm.billingContactEmail.trim() || null,
    }),
    onSuccess: () => {
      toast.success("Contract terms updated");
      setContractTermsEdits({});
      queryClient.invalidateQueries({ queryKey: ["billing", "subscription", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["billing", "balance", workspaceId] });
    },
    onError: (err: unknown) => {
      toast.error(getErrorMessage(err, "Failed to update contract terms"));
    },
  });

  const createSubscriptionMutation = useMutation({
    mutationFn: async () => {
      const plansList = plans.length > 0 ? plans : await billingService.getPlans();
      const plan = plansList.find(
        (p) => p.slug?.toLowerCase() === "enterprise" || p.tier?.toLowerCase() === "enterprise"
      ) ?? plansList[0];
      if (!plan) throw new Error("Enterprise plan is unavailable");
      return billingService.createSubscription(workspaceId, plan.id);
    },
    onSuccess: () => {
      toast.success("Enterprise contract initialized for workspace");
      queryClient.invalidateQueries({ queryKey: ["billing", "subscription", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["billing", "balance", workspaceId] });
    },
    onError: (err: unknown) => {
      toast.error(getErrorMessage(err, "Failed to initialize contract"));
    },
  });

  const createTrialMutation = useMutation({
    mutationFn: async (ownerEmail: string) => {
      return billingService.createTrialSubscription({
        workspaceId,
        userId: "00000000-0000-0000-0000-000000000000",
        ownerEmail: ownerEmail || "admin@company.com",
      });
    },
    onSuccess: () => {
      toast.success("14-Day Enterprise Trial started for workspace");
      queryClient.invalidateQueries({ queryKey: ["billing", "subscription", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["billing", "balance", workspaceId] });
    },
    onError: (err: unknown) => {
      toast.error(getErrorMessage(err, "Failed to start trial"));
    },
  });

  const simulateCycleCloseMutation = useMutation({
    mutationFn: () => billingService.simulateCycleClose(workspaceId),
    onSuccess: () => {
      toast.success("Billing cycle closed and invoice generated for this workspace");
      queryClient.invalidateQueries({ queryKey: ["billing", "subscription", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["billing", "balance", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["billing", "invoices", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["billing", "history", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["billing", "report", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["global-invoices-list"] });
      queryClient.invalidateQueries({ queryKey: ["global-subscriptions-list"] });
      queryClient.invalidateQueries({ queryKey: ["global-billing-metrics"] });
    },
    onError: (err: unknown) => {
      toast.error(getErrorMessage(err, "Failed to simulate billing cycle close"));
    },
  });

  const markInvoicePaidMutation = useMutation({
    mutationFn: (invoice: InvoiceDto) => billingService.markInvoicePaid(invoice.id),
    onSuccess: () => {
      toast.success("Invoice payment recorded");
      queryClient.invalidateQueries({ queryKey: ["billing", "invoices", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["billing", "history", workspaceId] });
      queryClient.invalidateQueries({ queryKey: ["global-invoices-list"] });
      queryClient.invalidateQueries({ queryKey: ["global-billing-metrics"] });
    },
    onError: (err: unknown) => {
      toast.error(getErrorMessage(err, "Failed to record invoice payment"));
    },
  });

  const updatePricingConfigMutation = useMutation({
    mutationFn: () => billingService.updatePricingConfig({
      fxRateUsdVnd: Number(pricingFxRate) || 0,
      creditValueVnd: Number(pricingCreditValueVnd) || 0,
    }),
    onSuccess: (saved) => {
      setPricingFxRate(saved.fxRateUsdVnd.toString());
      setPricingCreditValueVnd(saved.creditValueVnd.toString());
      queryClient.invalidateQueries({ queryKey: ["billing", "pricing-config"] });
    },
  });

  const upsertUsageRateCardMutation = useMutation({
    mutationFn: (row: PricingDraftRow) => {
      const fxRate = Number(pricingFxRate) || 0;
      const creditValue = Number(pricingCreditValueVnd) || 0;
      return billingService.upsertUsageRateCard({
        chargeType: row.chargeType.trim(),
        unit: row.unit.trim(),
        provider: row.provider.trim(),
        model: row.model.trim(),
        providerUnitCostUsd: row.providerUnitCostUsd,
        markupMultiplier: row.markupMultiplier,
        unitPrice: calculateDraftUnitPrice(row, fxRate, creditValue),
        currency: "VND",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing", "usage-rate-card"] });
    },
  });

  useEffect(() => {
    if (!pricingConfig) return;
    setPricingFxRate(pricingConfig.fxRateUsdVnd.toString());
    setPricingCreditValueVnd(pricingConfig.creditValueVnd.toString());
  }, [pricingConfig]);

  useEffect(() => {
    if (activeRateCards.length === 0) return;
    setPricingDraftRows(activeRateCards.map(toPricingDraftRow));
  }, [activeRateCards]);

  const { data: invoicesPage, isLoading: isInvoicesLoading } = useQuery({
    queryKey: ["billing", "invoices", workspaceId, invoicesPageNumber],
    queryFn: () => billingService.getWorkspaceInvoices(workspaceId, invoicesPageNumber, 20),
    enabled: !!workspaceId && isWorkspaceIdValid,
    retry: 1,
  });

  const [historyPageNumber, setHistoryPageNumber] = useState(1);
  const [historyTypeFilter, setHistoryTypeFilter] = useState("ALL");
  const [filterFromDate, setFilterFromDate] = useState("");
  const [filterToDate, setFilterToDate] = useState("");
  const [filterMinAmount, setFilterMinAmount] = useState<number | "">("");
  const [filterMaxAmount, setFilterMaxAmount] = useState<number | "">("");
  const [renderNowMs] = useState(() => Date.now());

  const activeFiltersCount = [
    historyTypeFilter !== "ALL",
    filterFromDate !== "",
    filterToDate !== "",
    filterMinAmount !== "",
    filterMaxAmount !== "",
  ].filter(Boolean).length;

  const resetFilters = () => {
    setHistoryTypeFilter("ALL");
    setFilterFromDate("");
    setFilterToDate("");
    setFilterMinAmount("");
    setFilterMaxAmount("");
    setHistoryPageNumber(1);
  };

  const updatePricingDraftRow = <K extends keyof PricingDraftRow>(
    id: string,
    key: K,
    value: PricingDraftRow[K]
  ) => {
    setPricingDraftRows((rows) => rows.map((row) => row.id === id ? { ...row, [key]: value } : row));
    setPricingDraftSavedAt(null);
  };

  const updatePlanBaselineField = <K extends keyof PlanBaselineFormState>(
    key: K,
    value: PlanBaselineFormState[K]
  ) => {
    setPlanBaselineEdits((current) => ({ ...current, [key]: value }));
  };

  const handleSavePricingDraft = async () => {
    try {
      await updatePricingConfigMutation.mutateAsync();
      await Promise.all(pricingDraftRows.filter((row) => row.enabled).map((row) => upsertUsageRateCardMutation.mutateAsync(row)));
      setPricingDraftSavedAt(format(new Date(), "MMM dd, yyyy HH:mm"));
      toast.success("Pricing changes applied");
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, "Failed to apply pricing changes"));
    }
  };

  const handleResetPricingDraftDefaults = () => {
    setPricingFxRate("26300");
    setPricingCreditValueVnd("4");
    setPricingDraftRows(DEFAULT_PRICING_DRAFT_ROWS.map((row) => ({ ...row })));
    setPricingDraftSavedAt(null);
  };

  const { data: historyPage, isLoading: isHistoryLoading } = useQuery({
    queryKey: [
      "billing", "history", workspaceId, historyPageNumber, historyTypeFilter, 
      filterFromDate, filterToDate, filterMinAmount, filterMaxAmount
    ],
    queryFn: () => billingService.getCreditHistory(workspaceId, historyPageNumber, 100, {
      type: historyTypeFilter === "ALL" ? undefined : historyTypeFilter,
      fromDate: filterFromDate ? new Date(filterFromDate + "T00:00:00").toISOString() : undefined,
      toDate: filterToDate ? new Date(filterToDate + "T23:59:59.999").toISOString() : undefined,
      minAmount: filterMinAmount !== "" ? Number(filterMinAmount) : undefined,
      maxAmount: filterMaxAmount !== "" ? Number(filterMaxAmount) : undefined,
    }),
    enabled: !!workspaceId && isWorkspaceIdValid,
    retry: 1,
  });

  const totalPages = historyPage ? Math.ceil(historyPage.totalCount / 100) : 0;

  const groupedHistoryItems = useMemo(() => {
    if (!historyPage?.items) return [];
    const groups: CreditTransactionGroup[] = [];
    let currentGroup: CreditTransactionGroup | null = null;

    historyPage.items.forEach(tx => {
      if (!currentGroup) {
        currentGroup = { ...tx, originalTx: [tx] };
        return;
      }

      // Group ONLY if they have the exact same referenceId and it is NOT null or empty
      const isSameReference = currentGroup.referenceId && tx.referenceId && currentGroup.referenceId === tx.referenceId;
      const isSameType = currentGroup.type === tx.type;

      if (isSameReference && isSameType && currentGroup.referenceId !== "00000000-0000-0000-0000-000000000000") {
        currentGroup.amount += tx.amount;
        currentGroup.originalTx.push(tx);
      } else {
        groups.push(currentGroup);
        currentGroup = { ...tx, originalTx: [tx] };
      }
    });

    if (currentGroup) {
      groups.push(currentGroup);
    }
    return groups;
  }, [historyPage?.items]);

  const currentCredits = balance?.currentCredits ?? 0;
  const creditsUsed = balance?.creditsUsedThisCycle ?? 0;
  const totalCredits = currentCredits + creditsUsed;
  const renewsDate = balance?.currentPeriodEnd ? format(new Date(balance.currentPeriodEnd), "MMM dd, yyyy") : "N/A";
  const trialEndsAt = subscription?.trialEndsAt ? new Date(subscription.trialEndsAt) : null;
  const isTrialSubscription = !!trialEndsAt && trialEndsAt.getTime() > renderNowMs;
  const committedCredits = subscription?.effectiveCreditsPerCycle ?? toOptionalNumber(planBaselineForm.creditsPerCycle) ?? 0;
  const effectiveOveragePrice = subscription?.effectiveOveragePricePerCredit ?? toOptionalNumber(planBaselineForm.overagePricePerCredit) ?? 0;
  const effectiveInvoiceTerms = subscription?.effectiveInvoiceTermsDays ?? toOptionalNumber(planBaselineForm.invoiceTermsDays) ?? 15;
  const subscriptionStatusLabel = subscription?.status
    ? subscription.status.charAt(0).toUpperCase() + subscription.status.slice(1)
    : "No contract";
  
  const displayPlanName = subscription?.planName || "Free Plan";
  const displayPlanPrice = subscription
    ? subscription.price.toLocaleString("vi-VN") + (subscription.price > 1000 ? "đ" : " VND")
    : "0đ";
  const contractPriceBeforeVat = subscription?.effectiveContractPriceVnd ?? toOptionalNumber(planBaselineForm.price) ?? 0;
  const contractVatAmount = Math.round(contractPriceBeforeVat * 0.1);
  const contractTotalWithVat = contractPriceBeforeVat + contractVatAmount;
  const totalTopUp = historyPage?.items?.filter(t => t.type === 'top_up').reduce((s, t) => s + t.amount, 0) || 0;
  const totalConsumed = historyPage?.items?.filter(t => t.type !== 'top_up').reduce((s, t) => s + t.amount, 0) || 0;
  const netChange = totalTopUp + totalConsumed;

  const handleOpenExport = () => {
    if (!historyPage?.items || historyPage.items.length === 0) {
      alert("No data to export yet.");
      return;
    }
    setExportNote("");
    setIsExportOpen(true);
  };

  const confirmExportUsage = async () => {
    if (!historyPage?.items || historyPage.items.length === 0) return;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "WarpTalk";
    const worksheet = workbook.addWorksheet("Contract Transactions");

    worksheet.columns = [
      { key: "no", width: 8 },
      { key: "type", width: 15 },
      { key: "date", width: 22 },
      { key: "amount", width: 18 },
      { key: "balance", width: 15 }
    ];

    worksheet.addRow(["WarpTalk - Contract Billing Transaction Report"]);
    worksheet.getRow(1).font = { size: 16, bold: true };
    worksheet.mergeCells("A1:E1");
    
    worksheet.addRow([`Generated on: ${format(new Date(), "MMM dd, yyyy HH:mm:ss")}`]);
    worksheet.mergeCells("A2:E2");
    
    let currentRowOffset = 2;

    if (exportNote.trim()) {
      worksheet.addRow([]);
      worksheet.addRow(["Owner Note:"]);
      worksheet.getRow(4).font = { bold: true };
      worksheet.addRow([exportNote]);
      worksheet.getRow(5).font = { italic: true, color: { argb: "FF4B5563" } };
      worksheet.mergeCells("A5:E5");
      currentRowOffset = 5;
    }
    
    worksheet.addRow([]);
    currentRowOffset += 1;
    
    const headerRowIndex = currentRowOffset + 1;
    const headerRow = worksheet.getRow(headerRowIndex);
    headerRow.values = ["No.", "Type", "Date", "Amount (Credits)", "Balance After"];
    
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F172A" }
    };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };

    const borderStyle: Partial<ExcelJS.Borders> = {
      top: { style: "thin", color: { argb: "FFCBD5E1" } },
      left: { style: "thin", color: { argb: "FFCBD5E1" } },
      bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
      right: { style: "thin", color: { argb: "FFCBD5E1" } }
    };

    ["A", "B", "C", "D", "E"].forEach(col => {
      headerRow.getCell(col).border = borderStyle;
    });

    historyPage.items.forEach((tx, index) => {
      const row = worksheet.addRow({
        no: index + 1,
        type: tx.type === "top_up" ? "Contract Credits Added" : "Consumption",
        date: new Date(tx.createdAt),
        amount: tx.amount,
        balance: tx.balanceAfter
      });
      
      row.getCell("date").numFmt = "yyyy-mm-dd hh:mm:ss";
      row.getCell("amount").numFmt = "#,##0";
      row.getCell("balance").numFmt = "#,##0";
      
      const amountCell = row.getCell("amount");
      if (tx.amount > 0) {
        amountCell.font = { color: { argb: "FF16A34A" }, bold: true }; 
      } else if (tx.amount < 0) {
        amountCell.font = { color: { argb: "FFDC2626" }, bold: true }; 
      }

      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        if (colNumber <= 5) cell.border = borderStyle;
      });
    });

    // Add Sum Rows
    worksheet.addRow([]);
    const sumRow1 = worksheet.addRow(["", "", "Contract Credits Added:", totalTopUp]);
    sumRow1.getCell(3).font = { bold: true };
    sumRow1.getCell(4).numFmt = "#,##0";
    sumRow1.getCell(4).font = { color: { argb: "FF16A34A" }, bold: true };
    sumRow1.getCell(3).border = borderStyle;
    sumRow1.getCell(4).border = borderStyle;

    const sumRow2 = worksheet.addRow(["", "", "Total Consumed:", totalConsumed]);
    sumRow2.getCell(3).font = { bold: true };
    sumRow2.getCell(4).numFmt = "#,##0";
    sumRow2.getCell(4).font = { color: { argb: "FFDC2626" }, bold: true };
    sumRow2.getCell(3).border = borderStyle;
    sumRow2.getCell(4).border = borderStyle;

    const sumRow3 = worksheet.addRow(["", "", "Net Change:", netChange]);
    sumRow3.getCell(3).font = { bold: true };
    sumRow3.getCell(4).numFmt = "#,##0";
    sumRow3.getCell(4).font = { bold: true, color: { argb: netChange > 0 ? "FF16A34A" : "FFDC2626" } };
    sumRow3.getCell(3).border = borderStyle;
    sumRow3.getCell(4).border = borderStyle;

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    saveAs(blob, `WarpTalk_Contract_Billing_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
    setIsExportOpen(false);
  };

  const workspaceUnavailable =
    !isWorkspaceIdValid || (!isWorkspaceInfoLoading && isWorkspaceInfoError);

  if (isWorkspaceIdValid && isWorkspaceInfoLoading) {
    return (
      <div className="flex min-h-full items-center justify-center bg-surface-1 p-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="h-4 w-4 animate-spin" />
          Loading workspace contract
        </div>
      </div>
    );
  }

  if (workspaceUnavailable) {
    return (
      <div className="flex min-h-full items-center justify-center bg-surface-1 p-6">
        <Card className="w-full max-w-md rounded-xl border-hairline bg-surface-1 shadow-linear">
          <CardHeader>
            <CardTitle className="text-base">Workspace not found</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This workspace ID does not exist or your account does not have access to its billing contract.
            </p>
            {!embedded && (
              <Link href="/billing">
                <Button variant="outline" className="rounded-md">
                  Back to billing
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (embedded) {
    const isFreeOrMissingPlan = !subscription || displayPlanName.toLowerCase().includes("free");
    const contractLabel = isFreeOrMissingPlan ? "No Enterprise contract" : displayPlanName;
    const recentTransactions = groupedHistoryItems.slice(0, 5);
    const recentInvoices = invoicesPage?.items?.slice(0, 5) ?? [];
    const hasActiveBilling = Boolean(subscription);

    return (
      <div className="flex min-h-full flex-col gap-5 p-6">
        <Card className="rounded-xl border-hairline bg-surface-1 shadow-linear">
          <CardHeader>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <Badge variant="outline" className="mb-2 rounded-md bg-primary/10 text-primary">
                  Workspace overview
                </Badge>
                <CardTitle className="text-xl font-semibold">{workspaceInfo?.name || workspaceId}</CardTitle>
                <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                  View the workspace billing state, sales request, recent usage, and invoices.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" className="h-9 rounded-md" onClick={() => router.push("/billing")}>
                  Back to billing
                </Button>
                {!subscription && (
                  <Button
                    className="h-9 rounded-md"
                    disabled={createTrialMutation.isPending}
                    onClick={() => createTrialMutation.mutate(latestSalesInquiry?.workEmail || "admin@company.com")}
                  >
                    Start trial
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-lg border border-hairline bg-surface-2 p-3">
                <p className="text-xs text-muted-foreground">Contract</p>
                <p className="mt-1 font-semibold">{isSubscriptionLoading ? "Loading..." : contractLabel}</p>
              </div>
              <div className="rounded-lg border border-hairline bg-surface-2 p-3">
                <p className="text-xs text-muted-foreground">Trial ends</p>
                <p className="mt-1 font-semibold">
                  {trialEndsAt ? format(trialEndsAt, "MMM d, yyyy") : "Not on trial"}
                </p>
              </div>
              <div className="rounded-lg border border-hairline bg-surface-2 p-3">
                <p className="text-xs text-muted-foreground">Remaining credits</p>
                <p className="mt-1 font-semibold">{isBalanceLoading ? "..." : currentCredits.toLocaleString()} cr</p>
              </div>
              <div className="rounded-lg border border-hairline bg-surface-2 p-3">
                <p className="text-xs text-muted-foreground">Service state</p>
                <p className="mt-1 font-semibold">{getWorkspaceServiceStateLabel(subscription)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {!subscription && (
          <Card className="rounded-xl border-hairline bg-surface-1 shadow-linear">
            <CardContent className="p-5">
              <p className="text-sm font-semibold text-foreground">No active Enterprise billing yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                This workspace exists, but the owner has not started a trial or completed a contract request yet.
              </p>
            </CardContent>
          </Card>
        )}

        {latestSalesInquiry && (
          <Card className="rounded-xl border-hairline bg-surface-1 shadow-linear">
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <Badge variant="outline" className="mb-2 rounded-md bg-primary/10 text-primary">
                    Sales request
                  </Badge>
                  <CardTitle className="text-base font-semibold">{latestSalesInquiry.company}</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {latestSalesInquiry.firstName} {latestSalesInquiry.lastName} - {latestSalesInquiry.workEmail}
                  </p>
                </div>
                <Badge variant="outline" className="w-fit rounded-md capitalize">
                  {getSalesRequestStatusLabel(latestSalesInquiry, hasActiveBilling)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm md:grid-cols-3">
              <div className="rounded-lg border border-hairline bg-surface-2 p-3">
                <p className="text-xs text-muted-foreground">Requested credits</p>
                <p className="mt-1 font-semibold text-foreground">{latestSalesInquiry.currentMonthlyMeetingVolume}</p>
              </div>
              <div className="rounded-lg border border-hairline bg-surface-2 p-3">
                <p className="text-xs text-muted-foreground">Features</p>
                <p className="mt-1 truncate font-semibold text-foreground">{formatSalesLabels(latestSalesInquiry.featureInterests, SALES_FEATURE_LABELS)}</p>
              </div>
              <div className="rounded-lg border border-hairline bg-surface-2 p-3">
                <p className="text-xs text-muted-foreground">Languages</p>
                <p className="mt-1 truncate font-semibold text-foreground">{formatSalesLabels(latestSalesInquiry.targetLanguages, LANGUAGE_LABELS)}</p>
              </div>
            </CardContent>
          </Card>
        )}

        <section className="grid gap-4 xl:grid-cols-2">
          <Card className="rounded-xl border-hairline bg-surface-1 shadow-linear">
            <CardHeader>
              <CardTitle className="text-base font-medium">Recent usage</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border border-hairline overflow-hidden">
                <Table>
                  <TableHeader className="bg-surface-2">
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isHistoryLoading ? (
                      <TableRow><TableCell colSpan={3} className="py-6 text-center text-muted-foreground">Loading...</TableCell></TableRow>
                    ) : recentTransactions.length === 0 ? (
                      <TableRow><TableCell colSpan={3} className="py-6 text-center text-muted-foreground">No usage yet.</TableCell></TableRow>
                    ) : (
                      recentTransactions.map((tx) => (
                        <TableRow key={tx.id}>
                          <TableCell className="capitalize">{tx.type.replace("_", " ")}</TableCell>
                          <TableCell className="text-muted-foreground">{format(new Date(tx.createdAt), "MMM dd, yyyy HH:mm")}</TableCell>
                          <TableCell className="text-right font-medium">{tx.amount.toLocaleString()} cr</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-xl border-hairline bg-surface-1 shadow-linear">
            <CardHeader>
              <CardTitle className="text-base font-medium">Recent invoices</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border border-hairline overflow-hidden">
                <Table>
                  <TableHeader className="bg-surface-2">
                    <TableRow>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isInvoicesLoading ? (
                      <TableRow><TableCell colSpan={3} className="py-6 text-center text-muted-foreground">Loading...</TableCell></TableRow>
                    ) : recentInvoices.length === 0 ? (
                      <TableRow><TableCell colSpan={3} className="py-6 text-center text-muted-foreground">No invoices yet.</TableCell></TableRow>
                    ) : (
                      recentInvoices.map((invoice) => (
                        <TableRow key={invoice.id}>
                          <TableCell className="font-medium">{getInvoiceNumber(invoice)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`rounded-md text-[11px] ${getInvoiceStatusClass(invoice)}`}>
                              {getInvoiceStatusLabel(invoice)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {getInvoiceAmount(invoice).toLocaleString("vi-VN")} VND
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3 mb-1">
            {!embedded && (
              <Link href="/billing">
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-full text-muted-foreground hover:text-ink">
                  <CaretLeft className="h-4 w-4" />
                </Button>
              </Link>
            )}
            <Badge variant="outline" className="bg-surface-2 text-ink border-hairline">
              {embedded ? "System Admin Contract" : "Workspace Contract"}
            </Badge>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {workspaceInfo?.name || workspaceId}
            </h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Manage Enterprise contract terms, trial status, extra usage, invoices, and AI usage for this workspace.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="rounded-md h-9 px-4" onClick={handleOpenExport}>
            <Download className="mr-2 h-4 w-4" weight="light" /> Export usage
          </Button>
        </div>
      </div>

      {subscription?.status === "active" && subscription?.serviceState && subscription.serviceState !== "healthy" && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 inline-flex h-2 w-2 rounded-full bg-amber-500" />
            <div>
              <p className="font-semibold">AI service state: {subscription.serviceState}</p>
              <p className="text-xs opacity-80">
                {subscription.suspendedReason || "Workspace AI usage may be blocked until billing is resolved."}
              </p>
            </div>
          </div>
        </div>
      )}

      <section className="grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-hairline bg-surface-1 p-4 shadow-linear">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {isTrialSubscription ? "Trial" : "Contract status"}
          </p>
          <p className="mt-1 text-lg font-semibold text-foreground">
            {isSubscriptionLoading ? "..." : isTrialSubscription ? "14 days" : subscriptionStatusLabel}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {isTrialSubscription
              ? "20,000 credits, no extra usage during trial."
              : subscription
                ? `${displayPlanName} contract is assigned to this workspace.`
                : "Create an Enterprise contract before billing this workspace."}
          </p>
        </div>
        <div className="rounded-xl border border-hairline bg-surface-1 p-4 shadow-linear">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Committed credits</p>
          <p className="mt-1 text-lg font-semibold text-foreground">{committedCredits.toLocaleString()} credits</p>
          <p className="mt-1 text-xs text-muted-foreground">Credits committed for each billing cycle.</p>
        </div>
        <div className="rounded-xl border border-hairline bg-surface-1 p-4 shadow-linear">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Extra usage</p>
          <p className="mt-1 text-lg font-semibold text-foreground">{effectiveOveragePrice.toLocaleString("vi-VN")} VND / credit</p>
          <p className="mt-1 text-xs text-muted-foreground">Charged on the next invoice, up to the agreed cap.</p>
        </div>
        <div className="rounded-xl border border-hairline bg-surface-1 p-4 shadow-linear">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Invoice terms</p>
          <p className="mt-1 text-lg font-semibold text-foreground">Net {effectiveInvoiceTerms}</p>
          <p className="mt-1 text-xs text-muted-foreground">Default due date, adjustable per customer.</p>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <BillingMetric 
          icon={Coins} 
          label="AI credits remaining" 
          value={isBalanceLoading ? "..." : currentCredits.toLocaleString()} 
          detail={isBalanceLoading ? "Loading..." : `${creditsUsed.toLocaleString()} of ${totalCredits.toLocaleString()} used. Renews ${renewsDate}`} 
          dark 
        />
        
        <Card className="rounded-xl border border-hairline bg-surface-1 shadow-linear">
          <CardContent className="flex items-center justify-between gap-4 p-5 h-full">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-surface-2 text-primary border border-hairline shrink-0">
                <CreditCard className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Current subscription plan</p>
                <div className="flex items-center gap-2">
                  <p className="text-2xl font-bold tracking-tight">
                    {isSubscriptionLoading ? "..." : displayPlanName}
                  </p>
                  {subscription && (
                    <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-none rounded-md text-[11px] px-1.5 py-0.5 font-semibold">
                      Active
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {isSubscriptionLoading 
                    ? "Loading plan details..." 
                    : subscription 
                      ? `${displayPlanPrice} / month` 
                      : "No active plan."}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <Tabs defaultValue="contract" className="w-full mt-2">
        <TabsList className="bg-surface-2 p-1 rounded-lg">
          <TabsTrigger value="contract" className="rounded-md text-sm px-4 data-[state=active]:bg-surface-1 data-[state=active]:text-ink data-[state=active]:shadow-sm">Contract Terms</TabsTrigger>
          <TabsTrigger value="history" className="rounded-md text-sm px-4 data-[state=active]:bg-surface-1 data-[state=active]:text-ink data-[state=active]:shadow-sm">Transaction History</TabsTrigger>
          <TabsTrigger value="invoices" className="rounded-md text-sm px-4 data-[state=active]:bg-surface-1 data-[state=active]:text-ink data-[state=active]:shadow-sm">Billing History</TabsTrigger>
        </TabsList>

        <TabsContent value="contract" className="mt-6 outline-none">
          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
            <Card className="rounded-xl border-hairline bg-surface-1 shadow-linear">
              <CardHeader>
                <CardTitle className="text-base font-medium">Enterprise contract terms</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">Baseline values are pre-filled. Contract prices are before 10% VAT; invoices include VAT.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Monthly credits</span>
                    <strong>{formatContractValue(subscription?.effectiveCreditsPerCycle, planBaselineForm.creditsPerCycle)}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Effective contract price before VAT</span>
                    <strong>{formatContractValue(subscription?.effectiveContractPriceVnd, planBaselineForm.price)} VND</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Effective extra usage cap</span>
                    <strong>{formatContractValue(subscription?.effectiveOverageCapCredits, planBaselineForm.overageCapCredits)} cr</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Extra usage this cycle</span>
                    <strong>{(subscription?.overageCreditsThisCycle ?? 0).toLocaleString()} cr</strong>
                  </div>
                </div>

                <div className="grid gap-3">
                  <div className="grid gap-1">
                    <Label className="text-xs text-muted-foreground">Monthly credits</Label>
                    <Input
                      type="number"
                      min={0}
                      className="h-8 text-sm"
                      value={contractTermsDisplayForm.creditsPerCycleOverride}
                      onChange={(e) => setContractTermsEdits((current) => ({ ...current, creditsPerCycleOverride: e.target.value }))}
                      placeholder={planBaselineForm.creditsPerCycle}
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs text-muted-foreground">Contract price before VAT (VND)</Label>
                    <Input
                      type="number"
                      min={0}
                      className="h-8 text-sm"
                      value={contractTermsDisplayForm.contractPriceVnd}
                      onChange={(e) => setContractTermsEdits((current) => ({ ...current, contractPriceVnd: e.target.value }))}
                      placeholder={planBaselineForm.price}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-1">
                      <Label className="text-xs text-muted-foreground">Extra usage cap</Label>
                      <Input
                        type="number"
                        min={0}
                        className="h-8 text-sm"
                        value={contractTermsDisplayForm.overageCapCreditsOverride}
                        onChange={(e) => setContractTermsEdits((current) => ({ ...current, overageCapCreditsOverride: e.target.value }))}
                        placeholder={planBaselineForm.overageCapCredits}
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-xs text-muted-foreground">Extra usage price/credit</Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        className="h-8 text-sm"
                        value={contractTermsDisplayForm.overagePricePerCreditOverride}
                        onChange={(e) => setContractTermsEdits((current) => ({ ...current, overagePricePerCreditOverride: e.target.value }))}
                        placeholder={planBaselineForm.overagePricePerCredit}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-1">
                      <Label className="text-xs text-muted-foreground">Invoice terms days</Label>
                      <Input
                        type="number"
                        min={1}
                        className="h-8 text-sm"
                        value={contractTermsDisplayForm.invoiceTermsDaysOverride}
                        onChange={(e) => setContractTermsEdits((current) => ({ ...current, invoiceTermsDaysOverride: e.target.value }))}
                        placeholder={planBaselineForm.invoiceTermsDays}
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-xs text-muted-foreground">Billing contact</Label>
                      <Input
                        type="email"
                        className="h-8 text-sm"
                        value={contractTermsForm.billingContactEmail}
                        onChange={(e) => setContractTermsEdits((current) => ({ ...current, billingContactEmail: e.target.value }))}
                        placeholder="billing@example.com"
                      />
                    </div>
                  </div>
                </div>

                <Button
                  className="w-full rounded-md"
                  disabled={updateContractTermsMutation.isPending || !subscription}
                  onClick={() => updateContractTermsMutation.mutate()}
                >
                  {updateContractTermsMutation.isPending ? "Saving..." : "Save contract terms"}
                </Button>
              </CardContent>
            </Card>

            <div className="grid gap-4 content-start">
              <Card className="rounded-xl border-hairline bg-surface-1 shadow-linear">
                <CardHeader>
                  <CardTitle className="text-base font-medium">Billing snapshot</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">Current cycle and invoice-facing amounts for this contract.</p>
                </CardHeader>
                <CardContent className="grid gap-3 text-xs">
                  <div className="flex items-center justify-between rounded-lg border border-hairline bg-surface-2 p-3">
                    <span className="text-muted-foreground">Credits remaining</span>
                    <strong>{currentCredits.toLocaleString()} cr</strong>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-hairline bg-surface-2 p-3">
                    <span className="text-muted-foreground">Used this cycle</span>
                    <strong>{creditsUsed.toLocaleString()} cr</strong>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-hairline bg-surface-2 p-3">
                    <span className="text-muted-foreground">Cycle renewal</span>
                    <strong>{renewsDate}</strong>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-hairline bg-surface-2 p-3">
                    <span className="text-muted-foreground">Service state</span>
                    <Badge variant="outline" className="rounded-md">
                      {getWorkspaceServiceStateLabel(subscription)}
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-xl border-hairline bg-surface-1 shadow-linear">
                <CardHeader>
                  <CardTitle className="text-base font-medium">Invoice estimate</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">Contract price is stored before VAT; invoices include VAT.</p>
                </CardHeader>
                <CardContent className="space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Contract price before VAT</span>
                    <strong>{contractPriceBeforeVat.toLocaleString("vi-VN")} VND</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">VAT 10%</span>
                    <strong>{contractVatAmount.toLocaleString("vi-VN")} VND</strong>
                  </div>
                  <div className="flex items-center justify-between border-t border-hairline pt-3 text-sm">
                    <span className="font-medium text-foreground">Estimated invoice total</span>
                    <strong>{contractTotalWithVat.toLocaleString("vi-VN")} VND</strong>
                  </div>
                  <p className="rounded-md bg-surface-2 px-3 py-2 text-muted-foreground">
                    Extra usage is added at cycle close if this workspace exceeds committed credits.
                  </p>
                </CardContent>
              </Card>
            </div>
          </section>
        </TabsContent>

        <TabsContent value="history" className="mt-6 outline-none">
          <Card className="rounded-xl border-hairline bg-surface-1 shadow-linear">
              <CardHeader className="flex flex-col items-start gap-4 pb-4">
                <div className="flex w-full items-center justify-between">
                  <CardTitle className="text-base font-medium">Transaction History</CardTitle>
                </div>
                
                {/* Advanced Filters */}
                <div className="space-y-3 w-full">
                  <div className="flex flex-wrap items-end gap-3">
                    {/* Type */}
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs text-muted-foreground">Type</Label>
                      <Select value={historyTypeFilter} onValueChange={(v) => { setHistoryTypeFilter(v || "ALL"); setHistoryPageNumber(1); }}>
                        <SelectTrigger className="h-8 text-sm w-[140px]">
                          <SelectValue placeholder="All types">
                            {historyTypeFilter === "ALL" && "All types"}
                            {historyTypeFilter === "top_up" && "Credits Added"}
                            {historyTypeFilter === "consumption" && "Consumption"}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ALL">All types</SelectItem>
                          <SelectItem value="top_up">Credits Added</SelectItem>
                          <SelectItem value="consumption">Consumption</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Date range */}
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs text-muted-foreground">From date</Label>
                      <Input type="date" className="h-8 text-sm w-[140px]" value={filterFromDate}
                        onChange={(e) => { setFilterFromDate(e.target.value); setHistoryPageNumber(1); }} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs text-muted-foreground">To date</Label>
                      <Input type="date" className="h-8 text-sm w-[140px]" value={filterToDate}
                        onChange={(e) => { setFilterToDate(e.target.value); setHistoryPageNumber(1); }} />
                    </div>

                    {/* Amount range */}
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs text-muted-foreground">Min amount (cr)</Label>
                      <Input type="number" min={0} placeholder="e.g. 10" className="h-8 text-sm w-[110px]"
                        value={filterMinAmount}
                        onChange={(e) => { setFilterMinAmount(e.target.value ? Number(e.target.value) : ""); setHistoryPageNumber(1); }} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs text-muted-foreground">Max amount (cr)</Label>
                      <Input type="number" min={0} placeholder="e.g. 1000" className="h-8 text-sm w-[110px]"
                        value={filterMaxAmount}
                        onChange={(e) => { setFilterMaxAmount(e.target.value ? Number(e.target.value) : ""); setHistoryPageNumber(1); }} />
                    </div>

                    {/* Reset button */}
                    {activeFiltersCount > 0 && (
                      <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground gap-1.5 self-end" onClick={resetFilters}>
                        <span>Clear</span>
                        <Badge className="h-4 px-1 text-[10px] font-semibold rounded-full">{activeFiltersCount}</Badge>
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
            <CardContent>
              <div className="rounded-md border border-hairline overflow-hidden">
                <Table>
                  <TableHeader className="bg-surface-2">
                    <TableRow className="border-hairline hover:bg-transparent">
                      <TableHead className="w-[80px]">No.</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Balance After</TableHead>
                      <TableHead className="text-right pr-6">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isHistoryLoading ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Loading history...</TableCell>
                      </TableRow>
                    ) : !groupedHistoryItems.length ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No transactions found.</TableCell>
                      </TableRow>
                    ) : (
                      groupedHistoryItems.map((tx, index) => {
                        const isPositive = tx.amount > 0;
                        const sign = isPositive ? "+" : "";
                        const rowIndex = index + 1;
                        const isGrouped = tx.originalTx && tx.originalTx.length > 1;
                        
                        return (
                           <TableRow key={tx.id} className="border-hairline hover:bg-surface-2">
                            <TableCell className="font-mono text-sm text-muted-foreground">
                              {rowIndex}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {tx.amount > 0
                                  ? <ArrowUpRight className="h-4 w-4 text-emerald-500" />
                                  : <ArrowDownRight className="h-4 w-4 text-rose-500" />}
                                <span className="capitalize">{tx.type.replace('_', '-')}</span>
                                {isGrouped && (
                                  <Badge variant="outline" className="text-[10px] font-normal font-mono ml-2">
                                    {tx.originalTx.length} items
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">{format(new Date(tx.createdAt), "MMM dd, yyyy HH:mm")}</TableCell>
                            <TableCell className={`text-right text-sm font-medium ${isPositive ? 'text-semantic-success' : 'text-ink'}`}>
                              {sign}{tx.amount} cr
                            </TableCell>
                            <TableCell className="text-right text-sm">{tx.balanceAfter} cr</TableCell>
                            <TableCell className="text-right pr-6">
                              {isGrouped && (
                                <button 
                                  onClick={() => setSelectedTxGroup(tx)}
                                  className="text-primary hover:underline font-semibold cursor-pointer bg-transparent border-none p-0 text-xs"
                                >
                                  View Details
                                </button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
              {/* Pagination */}
              <div className={`items-center justify-between mt-4 ${groupedHistoryItems.length === 0 ? "hidden" : "flex"}`}>
                <p className="text-xs text-muted-foreground">
                  {historyPage ? (
                    <>Showing <strong>{groupedHistoryItems.length}</strong> grouped sessions from <strong>{historyPage.items.length}</strong> transactions</>
                  ) : "Loading..."}
                </p>
                {totalPages > 1 && (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline" size="sm" className="h-7 w-7 p-0 rounded-md"
                      disabled={historyPageNumber <= 1}
                      onClick={() => setHistoryPageNumber(p => Math.max(1, p - 1))}
                    >‹</Button>

                    {/* Page number buttons */}
                    {(() => {
                      const pages: (number | "...")[] = [];
                      const delta = 2;
                      for (let i = 1; i <= totalPages; i++) {
                        if (i === 1 || i === totalPages || (i >= historyPageNumber - delta && i <= historyPageNumber + delta)) {
                          pages.push(i);
                        } else if (pages[pages.length - 1] !== "...") {
                          pages.push("...");
                        }
                      }
                      return pages.map((p, i) =>
                        p === "..." ? (
                          <span key={`ellipsis-${i}`} className="h-7 w-7 flex items-center justify-center text-xs text-muted-foreground">…</span>
                        ) : (
                          <Button
                            key={p}
                            variant={p === historyPageNumber ? "default" : "outline"}
                            size="sm"
                            className={`h-7 w-7 p-0 rounded-md text-xs ${p === historyPageNumber ? "" : ""}`}
                            onClick={() => setHistoryPageNumber(p as number)}
                          >{p}</Button>
                        )
                      );
                    })()}

                    <Button
                      variant="outline" size="sm" className="h-7 w-7 p-0 rounded-md"
                      disabled={historyPageNumber >= totalPages}
                      onClick={() => setHistoryPageNumber(p => Math.min(totalPages, p + 1))}
                    >›</Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invoices" className="mt-6 outline-none">
          <Card className="rounded-xl border border-hairline bg-surface-1 shadow-linear">
            <CardHeader className="flex-row items-center justify-between gap-3 border-b border-hairline px-5 pb-4 pt-5">
              <div>
                <CardTitle className="text-base font-semibold">Billing History</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Cycle close issues an open NET invoice. Admins record payment only after finance confirms settlement.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-md text-xs"
                disabled={!subscription || subscription.status !== "active" || simulateCycleCloseMutation.isPending}
                onClick={() => simulateCycleCloseMutation.mutate()}
              >
                {simulateCycleCloseMutation.isPending ? "Closing..." : "Simulate Cycle Close"}
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-surface-2">
                    <TableRow className="border-hairline hover:bg-transparent">
                      <TableHead className="w-[60px] text-[11px] font-semibold text-muted-foreground uppercase tracking-wider pl-5 py-2.5">No.</TableHead>
                      <TableHead className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider py-2.5">Invoice ID</TableHead>
                      <TableHead className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider py-2.5">Issued</TableHead>
                      <TableHead className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider py-2.5">Due date</TableHead>
                      <TableHead className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider py-2.5">Status</TableHead>
                      <TableHead className="text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-wider py-2.5">Amount</TableHead>
                      <TableHead className="text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-wider pr-5 py-2.5">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-hairline">
                    {isInvoicesLoading ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-xs text-muted-foreground">
                          <Spinner className="h-4 w-4 animate-spin inline mr-2 text-primary" />
                          Loading invoices...
                        </TableCell>
                      </TableRow>
                    ) : !invoicesPage?.items?.length ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-xs text-muted-foreground">No invoices found.</TableCell>
                      </TableRow>
                    ) : (
                      invoicesPage.items.map((invoice: InvoiceDto, index: number) => {
                        const rowIndex = (invoicesPageNumber - 1) * 20 + index + 1;
                        const pdfUrl = getInvoicePdfUrl(invoice);
                        return (
                          <TableRow key={invoice.id} className="border-hairline hover:bg-surface-2/20">
                            <TableCell className="font-mono text-xs text-muted-foreground pl-5 py-3">
                              {rowIndex}
                            </TableCell>
                            <TableCell className="text-xs font-mono text-ink py-3">
                              {getInvoiceNumber(invoice)}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground py-3">
                              {format(new Date(invoice.createdAt), "MMM dd, yyyy HH:mm")}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground py-3">
                              {getInvoiceDueLabel(invoice)}
                            </TableCell>
                            <TableCell className="py-3">
                              <Badge variant="outline" className={`rounded-md text-[11px] ${getInvoiceStatusClass(invoice)}`}>
                                {getInvoiceStatusLabel(invoice)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right text-xs font-semibold text-ink py-3">
                              {getInvoiceAmount(invoice).toLocaleString("vi-VN")}{invoice.currency.toLowerCase() === "vnd" ? "đ" : ` ${invoice.currency.toUpperCase()}`}
                            </TableCell>
                            <TableCell className="text-right text-xs pr-5 py-3 space-x-3">
                              {isInvoiceOpen(invoice) ? (
                                <button
                                  onClick={() => markInvoicePaidMutation.mutate(invoice)}
                                  disabled={markInvoicePaidMutation.isPending}
                                  className="text-primary hover:underline font-semibold cursor-pointer bg-transparent border-none p-0 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {markInvoicePaidMutation.isPending ? "Recording..." : "Mark paid"}
                                </button>
                              ) : invoice.hostedInvoiceUrl && invoice.hostedInvoiceUrl.startsWith("http") ? (
                                <a href={invoice.hostedInvoiceUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-semibold">
                                  View Stripe Receipt
                                </a>
                              ) : (
                                <button 
                                  onClick={() => setSelectedInvoice(invoice)}
                                  className="text-primary hover:underline font-semibold cursor-pointer bg-transparent border-none p-0"
                                >
                                  View Details
                                </button>
                              )}
                              {pdfUrl && pdfUrl.startsWith("http") && (
                                <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-semibold">
                                  Download PDF
                                </a>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!selectedInvoice} onOpenChange={(open) => !open && setSelectedInvoice(null)}>
        <DialogContent id="invoice-print-area" className="sm:max-w-[420px] border-hairline bg-surface-1 shadow-lg rounded-xl overflow-hidden p-0 print:hidden">
          <div className="bg-gradient-to-br from-primary/10 via-canvas to-canvas px-6 pt-6 pb-4 text-center border-b border-hairline/30 relative">
            <div className="absolute top-4 right-4 text-[9px] uppercase font-mono tracking-widest text-ink-muted no-print">
              {selectedInvoice && isInvoicePaid(selectedInvoice) ? "Receipt" : "Invoice"}
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500 text-white mx-auto mb-2 shadow-md shadow-emerald-500/25">
              <span className="text-lg font-bold">✓</span>
            </div>
            <h3 className="text-base font-extrabold text-ink tracking-tight">
              {selectedInvoice && isInvoicePaid(selectedInvoice) ? "Payment Successful" : "Invoice Awaiting Payment"}
            </h3>
            <p className="text-[11px] text-ink-muted mt-0.5">
              {selectedInvoice && isInvoicePaid(selectedInvoice)
                ? "Thank you for your subscription payment"
                : "Await online checkout payment or offline settlement under the agreed invoice terms"}
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
                  <span className="text-ink-muted">Workspace ID</span>
                  <span className="text-ink font-mono font-semibold">{selectedInvoice.workspaceId ?? "unknown"}</span>
                </div>

                <div className="flex justify-between items-center text-xs">
                  <span className="text-ink-muted">Payment Method</span>
                  <span className="text-ink font-semibold">
                    {isInvoicePaid(selectedInvoice) ? "Recorded settlement" : "Online or offline settlement"}
                  </span>
                </div>

                <div className="border-t border-dashed border-hairline/60 my-4 pt-4 flex justify-between items-center">
                  <div>
                    <span className="text-xs text-ink-muted font-medium block">
                      {isInvoicePaid(selectedInvoice) ? "Amount Paid" : "Amount Due"}
                    </span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase mt-0.5 inline-block ${isInvoicePaid(selectedInvoice) ? "text-emerald-600 bg-emerald-100 dark:bg-emerald-950/40" : "text-amber-700 bg-amber-100 dark:bg-amber-950/40"}`}>
                      Status: {getInvoiceStatusLabel(selectedInvoice)}
                    </span>
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
              {selectedInvoice && isInvoicePaid(selectedInvoice) ? "Print Receipt" : "Print Invoice"}
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
            <h2 className="text-lg font-bold text-gray-800 uppercase tracking-wide">
              {selectedInvoice && isInvoicePaid(selectedInvoice) ? "Official Receipt" : "Official Invoice"}
            </h2>
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
            <p className="font-bold text-gray-900 text-xs font-mono mt-1">Workspace ID: {selectedInvoice?.workspaceId}</p>
            <p className="text-gray-600 mt-1">
              Status: <span className={`${selectedInvoice && isInvoicePaid(selectedInvoice) ? "text-emerald-600" : "text-amber-600"} font-extrabold uppercase`}>
                {selectedInvoice ? getInvoiceStatusLabel(selectedInvoice) : "Unknown"}
              </span>
            </p>
            <p className="text-gray-600">
              Payment Gateway: {selectedInvoice && isInvoicePaid(selectedInvoice) ? "Recorded settlement" : "Online or offline settlement"}
            </p>
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
                  {getInvoiceAmount(selectedInvoice).toLocaleString("vi-VN")}{selectedInvoice.currency.toLowerCase() === "vnd" ? "đ" : ` ${selectedInvoice.currency.toUpperCase()}`}
                </td>
                <td className="py-4 px-3 text-right text-gray-900 font-bold font-mono pr-4">
                  {getInvoiceAmount(selectedInvoice).toLocaleString("vi-VN")}{selectedInvoice.currency.toLowerCase() === "vnd" ? "đ" : ` ${selectedInvoice.currency.toUpperCase()}`}
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
                {selectedInvoice && getInvoiceAmount(selectedInvoice).toLocaleString("vi-VN")}{selectedInvoice && (selectedInvoice.currency.toLowerCase() === "vnd" ? "đ" : ` ${selectedInvoice.currency.toUpperCase()}`)}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Tax (0%):</span>
              <span className="text-gray-900 font-mono">0đ</span>
            </div>
            <div className="flex justify-between text-xs border-t border-gray-800 pt-3.5 font-black text-sm">
              <span className="text-gray-900">{selectedInvoice && isInvoicePaid(selectedInvoice) ? "Total Paid:" : "Total Due:"}</span>
              <span className="text-gray-950 font-mono text-base">
                {selectedInvoice && getInvoiceAmount(selectedInvoice).toLocaleString("vi-VN")}{selectedInvoice && (selectedInvoice.currency.toLowerCase() === "vnd" ? "đ" : ` ${selectedInvoice.currency.toUpperCase()}`)}
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
          <p>
            {selectedInvoice && isInvoicePaid(selectedInvoice)
              ? "This is a system-generated electronic receipt. No physical signature or stamp is required."
              : "This is a system-generated invoice awaiting payment. No physical signature or stamp is required."}
          </p>
          <p>For support, please contact billing@warptalk.com or visit our Help Center.</p>
        </div>
      </div>
      
      {/* Export Preview Dialog */}
      <Dialog open={isExportOpen} onOpenChange={setIsExportOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Export Usage Preview</DialogTitle>
            <DialogDescription>
              Review your transaction summary before generating the Excel file.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="rounded-md border p-4 bg-muted/20">
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium text-muted-foreground">Transactions Found:</span>
                <span className="text-sm font-semibold">{historyPage?.items?.length || 0}</span>
              </div>
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium text-muted-foreground">Contract Credits Added:</span>
                <span className="text-sm font-semibold text-green-600">+{totalTopUp.toLocaleString()}</span>
              </div>
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium text-muted-foreground">Total Consumed:</span>
                <span className="text-sm font-semibold text-red-600">{totalConsumed.toLocaleString()}</span>
              </div>
              <div className="pt-2 mt-2 border-t flex justify-between">
                <span className="text-sm font-bold">Net Balance Change:</span>
                <span className={`text-sm font-bold ${netChange > 0 ? 'text-green-600' : (netChange < 0 ? 'text-red-600' : '')}`}>
                  {netChange > 0 ? '+' : ''}{netChange.toLocaleString()}
                </span>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="exportNote">Add an explanatory note (optional)</Label>
              <Textarea 
                id="exportNote" 
                placeholder="e.g., Final report for Q2 2026..." 
                value={exportNote}
                onChange={(e) => setExportNote(e.target.value)}
                className="resize-none h-24"
              />
              <p className="text-[13px] text-muted-foreground">This note will be printed at the top of the exported Excel sheet to provide context for stakeholders.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsExportOpen(false)}>Cancel</Button>
            <Button onClick={confirmExportUsage}>Confirm & Export</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transaction Details Dialog */}
      <Dialog open={!!selectedTxGroup} onOpenChange={(open) => !open && setSelectedTxGroup(null)}>
        <DialogContent className="sm:max-w-[760px] w-[95vw] border border-hairline bg-surface-1 shadow-lg rounded-xl overflow-hidden p-0 text-ink">
          <div className="bg-gradient-to-br from-primary/10 via-canvas to-canvas px-6 pt-6 pb-4 border-b border-hairline relative">
            <h3 className="text-base font-extrabold text-ink tracking-tight flex items-center gap-2">
              <span>📊 Transaction Details</span>
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Breakdown of variable AI service spend for this session
            </p>
          </div>
          
          <div className="px-6 py-5 space-y-5">
            {selectedTxGroup && (
              <div className="space-y-5">
                {/* Session General Info */}
                <div className="grid grid-cols-2 gap-4 bg-surface-2 p-4 rounded-lg border border-hairline text-xs text-ink">
                  <div>
                    <span className="text-[10px] text-muted-foreground block uppercase font-mono tracking-wider">Date</span>
                    <span className="font-bold mt-1 block text-sm">{format(new Date(selectedTxGroup.createdAt), "MMMM dd, yyyy")}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block uppercase font-mono tracking-wider">Total Deducted</span>
                    <span className="text-rose-600 dark:text-rose-400 font-extrabold mt-1 block text-sm">{Math.abs(selectedTxGroup.amount).toLocaleString()} cr</span>
                  </div>
                </div>

                {/* Two-Column Responsive Layout */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Left Column: Service Breakdown Summary */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-ink uppercase tracking-wider">Service Breakdown</h4>
                    <div className="divide-y divide-hairline border border-hairline rounded-lg bg-surface-2/40 overflow-hidden">
                      {Object.entries(
                        selectedTxGroup.originalTx.reduce<Record<string, ServiceBreakdown>>((acc, item) => {
                          const type = getLabelForUsage(item.referenceType || "Other");
                          const rawType = item.referenceType || "Other";
                          if (!acc[type]) {
                            acc[type] = { count: 0, cost: 0, rawType };
                          }
                          acc[type].count += 1;
                          acc[type].cost += item.amount;
                          return acc;
                        }, {})
                      ).map(([service, data]) => {
                        const unitPriceVal = Math.round(Math.abs(data.cost) / data.count);
                        const suffix = getUnitSuffixForUsage(data.rawType);
                        return (
                          <div key={service} className="flex justify-between items-center px-4 py-3.5 text-xs text-ink hover:bg-surface-2/30 transition-colors">
                            <div>
                              <span className="font-semibold block">{service}</span>
                              <span className="text-[10px] text-muted-foreground mt-1 block">
                                {data.count} {data.count === 1 ? 'call' : 'calls'} × {unitPriceVal} {suffix}
                              </span>
                            </div>
                            <span className="font-extrabold text-rose-600 dark:text-rose-400">{Math.abs(data.cost).toLocaleString()} cr</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Right Column: Itemized Events List */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-ink uppercase tracking-wider">Activity Log Feed</h4>
                    <div className="h-[268px] overflow-y-auto border border-hairline rounded-lg divide-y divide-hairline text-xs bg-surface-1 text-ink font-sans p-3 space-y-0.5 select-text">
                      {selectedTxGroup.originalTx.map((item, idx) => (
                        <div key={item.id || idx} className="flex justify-between items-center py-2.5 px-3 rounded-md hover:bg-surface-2/60 transition-colors">
                          <div className="flex items-center gap-2.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary/70"></span>
                            <span className="text-ink font-medium flex items-center">
                              <span className="font-mono text-muted-foreground text-[10px] mr-2.5">{format(new Date(item.createdAt), "HH:mm:ss")}</span>
                              {getLabelForUsage(item.referenceType || "AI usage")}
                            </span>
                          </div>
                          <span className="text-rose-600 dark:text-rose-400 font-bold ml-2 shrink-0">{Math.abs(item.amount).toLocaleString()} cr</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          <div className="bg-surface-2 px-6 py-4 border-t border-hairline flex justify-end">
            <Button 
              onClick={() => setSelectedTxGroup(null)}
              className="bg-primary hover:bg-primary-hover text-white cursor-pointer px-4 text-xs font-semibold rounded-md h-9"
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BillingMetric({ icon: Icon, label, value, detail, dark }: { icon: typeof Coins; label: string; value: string; detail: string; dark?: boolean }) {
  return (
    <Card className={`rounded-xl border ${dark ? "border-hairline bg-surface-2 text-ink" : "border-hairline bg-surface-1"} shadow-linear`}>
      <CardContent className="flex items-center gap-4 p-5">
        <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${dark ? "bg-surface-3 text-primary" : "bg-surface-2 text-ink"} border border-hairline`}>
          <Icon className="h-6 w-6" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">{label}</p>
          <p className="text-2xl font-semibold tracking-tight">{value}</p>
          <p className="text-xs text-muted-foreground mt-1">{detail}</p>
        </div>
      </CardContent>
    </Card>
  );
}
