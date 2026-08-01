export const BILLING_POLICY = {
  minimumPricePerCreditVnd: 2.6,
  minimumContractPriceVnd: 15000,
  minimumContractPriceUsd: 0.5,
  supportedLanguageCount: 3,
  supportedAiServiceCount: 6,
  suggestionWeights: {
    usage: 0.45,
    members: 0.15,
    languages: 0.15,
    aiServices: 0.25,
  },
  defaultOverageCapRatio: 0.15,
  defaultFxRateUsdVnd: 26300,
  defaultCreditValueVnd: 4,
  defaultInvoiceTermsDays: 15,
  defaultInvoiceGraceHours: 360,
  allowedInvoiceTermsDays: [15, 30] as const,
} as const;
