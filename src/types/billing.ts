export interface CreditBalanceDto {
  workspaceId: string;
  currentCredits: number;
  creditsUsedThisCycle: number;
  totalCredits: number;
  status: string;
  currentPeriodStart: string; // ISO datetime
  currentPeriodEnd: string;   // ISO datetime
}

export interface SubscriptionDto {
  id: string;
  userId: string;
  workspaceId: string | null;
  planId: string;
  planName: string;
  price: number;
  status: string;
  creditsRemaining: number;
  creditsUsedThisCycle: number;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  autoRenew: boolean;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
  cancelledAt: string | null;
  workspaceName?: string | null;
  creditsPerCycleOverride?: number | null;
  contractPriceVnd?: number | null;
  overageCapCreditsOverride?: number | null;
  overagePricePerCreditOverride?: number | null;
  invoiceTermsDaysOverride?: number | null;
  billingContactEmail?: string | null;
  effectiveCreditsPerCycle?: number;
  effectiveContractPriceVnd?: number;
  effectiveOverageCapCredits?: number;
  effectiveOveragePricePerCredit?: number;
  effectiveInvoiceTermsDays?: number;
  overageCreditsThisCycle?: number;
  overageStartedAt?: string | null;
  serviceState?: string | null;
  suspendedReason?: string | null;
  trialEndsAt?: string | null;
}

export interface UpdateSubscriptionContractTermsRequest {
  creditsPerCycleOverride?: number | null;
  contractPriceVnd?: number | null;
  overageCapCreditsOverride?: number | null;
  overagePricePerCreditOverride?: number | null;
  invoiceTermsDaysOverride?: number | null;
  billingContactEmail?: string | null;
}

export interface CreateWorkspaceContractSubscriptionRequest {
  workspaceId: string;
  planId: string;
  contractTerms: UpdateSubscriptionContractTermsRequest;
  userId?: string | null;
}

export interface TrialSubscriptionRequest {
  workspaceId: string;
  userId: string;
  ownerEmail: string;
}

export interface SalesPackagePricingEstimateDto {
  packageMode?: string | null;
  selectedVolume?: string | null;
  meetingHours?: number | null;
  estimatedCredits?: number | null;
  usagePercent?: number | null;
  creditsPerHour?: number | null;
  estimateBreakdown?: string[];
  targetLanguageCount?: number | null;
  billableTargetLanguageCount?: number | null;
  includesTranslatedAudio?: boolean;
  planName?: string | null;
  planPrice?: number | null;
  creditsPerCycle?: number | null;
}

export interface SalesInquiryDto {
  id: string;
  firstName: string;
  lastName: string;
  workEmail: string;
  company: string;
  requestType: string;
  featureInterests: string[];
  targetLanguages: string[];
  currentMonthlyMeetingVolume: string;
  expectedMonthlyMeetingVolumeInSixMonths?: string | null;
  useCaseNotes?: string | null;
  pricingEstimate?: SalesPackagePricingEstimateDto | Record<string, unknown> | null;
  consent: boolean;
  source: string;
  status: "new" | "reviewing" | "quoted" | "converted" | "closed" | string;
  workspaceId?: string | null;
  subscriptionId?: string | null;
  createdAt: string;
  updatedAt: string;
  convertedAt?: string | null;
  closedAt?: string | null;
}

export interface CreateSalesInquiryRequest {
  firstName: string;
  lastName: string;
  workEmail: string;
  company: string;
  requestType: string;
  featureInterests: string[];
  targetLanguages: string[];
  currentMonthlyMeetingVolume: string;
  expectedMonthlyMeetingVolumeInSixMonths?: string | null;
  useCaseNotes?: string | null;
  pricingEstimate?: SalesPackagePricingEstimateDto | Record<string, unknown> | null;
  consent: boolean;
  source?: string | null;
}

export interface CreateWorkspaceSalesInquiryRequest extends CreateSalesInquiryRequest {
  workspaceId: string;
}

export interface ConvertSalesInquiryToContractRequest {
  workspaceId: string;
  planId?: string | null;
  contractTerms: UpdateSubscriptionContractTermsRequest;
}

export interface LinkSalesInquiryWorkspaceRequest {
  workspaceId: string;
}

export interface PlanDto {
  id: string;
  name: string;
  slug: string;
  description: string;
  tier: string;
  price: number;
  currency: string;
  billingCycle: string;
  creditsPerCycle: number;
  overageCapCredits: number;
  overagePricePerCredit: number;
  lowBalanceThresholdCredits: number;
  rolloverCapCredits: number;
  invoiceTermsDays: number;
  invoiceGraceHours: number;
  features: string;
  sortOrder: number;
  isActive: boolean;
  maxParticipants: number;
  maxLanguages: number;
  voiceCloneEnabled: boolean;
  aiAssistantEnabled: boolean;
  glossaryEnabled: boolean;
  dedicatedGpu: boolean;
}

export interface PlanRequest {
  name: string;
  slug: string;
  tier: string;
  price: number;
  currency: string;
  billingCycle: string;
  creditsPerCycle: number;
  maxParticipants: number;
  features: string;
  sortOrder: number;
  overageCapCredits: number;
  overagePricePerCredit: number;
  lowBalanceThresholdCredits: number;
  rolloverCapCredits: number;
  invoiceTermsDays: number;
  invoiceGraceHours: number;
  isActive: boolean;
  maxLanguages: number;
  voiceCloneEnabled: boolean;
  aiAssistantEnabled: boolean;
  glossaryEnabled: boolean;
  dedicatedGpu: boolean;
}

export interface CreditTransactionDto {
  id: string;
  workspaceId: string;
  workspaceName?: string | null;
  userId: string;
  userName?: string | null;
  amount: number; // negative = consumption, positive = top-up
  type: 'consumption' | 'top_up' | 'reserve' | 'refund' | 'adjustment';
  description?: string;
  referenceType?: string;
  referenceId?: string;
  balanceAfter: number;
  createdAt: string; // ISO datetime
}

export interface UsageSummaryDto {
  usageType: string;
  totalCreditsConsumed: number;
}

export interface BillingReportDto {
  workspaceId: string;
  month: number;
  year: number;
  startingBalance: number;
  endingBalance: number;
  totalTopUpCredits: number;
  totalConsumedCredits: number;
  usageBreakdown: UsageSummaryDto[];
  averageTranslationCostPerMinute: number;
  averageCostPerMeeting: number;
}

export interface PagedResult<T> {
  totalCount: number;
  items: T[];
}


export interface CreditHistoryFilters {
  workspaceId?: string;
  type?: string;
  fromDate?: string;
  toDate?: string;
  minAmount?: number;
  maxAmount?: number;
}

export interface GlobalBillingMetricsDto {
  totalBalance: number;
  monthlyUsage: number;
  auditEventsLast30Days: number;
  activeWorkspaces: number;
}

export interface MonthlyUsagePoint {
  month: number;
  monthName: string;
  consumedCredits: number;
  topUpCredits: number;
}

export interface UsageChartDto {
  year: number;
  monthlyData: MonthlyUsagePoint[];
}

export interface TopWorkspaceDto {
  workspaceId: string;
  workspaceName: string | null;
  totalCreditsConsumed: number;
}

export interface InvoiceDto {
  id: string;
  invoiceNumber?: string | null;
  subtotal?: number | null;
  tax?: number | null;
  total?: number | null;
  amount?: number | null;
  currency: string;
  status: string;
  pdfUrl?: string | null;
  invoicePdfUrl?: string | null;
  hostedInvoiceUrl?: string | null;
  stripeInvoiceId?: string | null;
  lineItems?: string | null;
  issuedAt?: string | null;
  dueAt?: string | null;
  paidAt?: string | null;
  createdAt: string;
  workspaceId?: string | null;
  subscriptionId?: string | null;
  paymentId?: string | null;
  workspaceName?: string | null;
}

export interface CheckoutSessionDto {
  id: string;
  amountTotal?: number | null;
  currency: string;
  metadata: Record<string, string>;
  paymentStatus: string;
  status: string;
  paymentIntentId?: string | null;
}

export interface UsageAlertDto {
  workspaceId: string;
  workspaceName: string;
  consumedCreditsIn24h: number;
  reason: string;
}

export interface MonthlyUsageDto {
  month: number;
  monthName: string;
  consumedCredits: number;
  topUpCredits: number;
}

export interface UsageChartDto {
  year: number;
  monthlyData: MonthlyUsageDto[];
}

export interface UsageRateCardDto {
  id: string;
  chargeType: string;
  unit: string;
  provider: string;
  model: string;
  unitPrice: number;
  currency: string;
  providerUnitCostUsd?: number | null;
  markupMultiplier?: number | null;
  effectiveFrom: string;
  effectiveTo?: string | null;
  isActive: boolean;
}

export interface UpsertUsageRateCardRequest {
  chargeType: string;
  unit: string;
  provider: string;
  model: string;
  unitPrice: number;
  currency: string;
  providerUnitCostUsd?: number | null;
  markupMultiplier?: number | null;
  isActive?: boolean;
}

export interface PricingConfigDto {
  fxRateUsdVnd: number;
  creditValueVnd: number;
  minimumPricePerCreditVnd: number;
  minimumContractPriceVnd: number;
  minimumContractPriceUsd: number;
  salesUsageWeight: number;
  salesMembersWeight: number;
  salesLanguagesWeight: number;
  salesAiServicesWeight: number;
  defaultOverageCapRatio: number;
  defaultInvoiceTermsDays: number;
  defaultInvoiceGraceHours: number;
  formula: string;
  resolverKey: string;
}

export interface UpdatePricingConfigRequest {
  fxRateUsdVnd: number;
  creditValueVnd: number;
  minimumPricePerCreditVnd: number;
  minimumContractPriceVnd: number;
  minimumContractPriceUsd: number;
  salesUsageWeight: number;
  salesMembersWeight: number;
  salesLanguagesWeight: number;
  salesAiServicesWeight: number;
  defaultOverageCapRatio: number;
  defaultInvoiceTermsDays: number;
  defaultInvoiceGraceHours: number;
}

export interface BillingPolicyDto {
  vatRate: number;
  yearlyDiscountMultiplier: number;
}

export interface UpdateBillingPolicyRequest {
  vatRate: number;
  yearlyDiscountMultiplier: number;
}
