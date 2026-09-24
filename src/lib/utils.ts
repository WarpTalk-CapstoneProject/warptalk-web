import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { PlanDto } from "@/types/billing";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Translator shape shared by `getPlanDescription`/`buildFeatureList`, matching
 * `useTranslations("landing.pricing")` from next-intl. Optional and defaulted
 * below so call sites that have not yet migrated onto the i18n catalog (see
 * `.agents/page-docs/i18n-localization.md`) keep compiling and keep their
 * existing English copy unchanged.
 */
type PlanCopyTranslator = (key: string, values?: Record<string, string | number>) => string;

const DEFAULT_PLAN_COPY: Record<string, string> = {
  descriptionStartup: "For growing global teams that need reliable AI summaries and history.",
  descriptionEnterprise: "For operators using voice cloning and native-feeling interpretation at scale.",
  descriptionDefault: "Flexible plan for customized workspace requirements and additional features.",
  featureCredits: "{count} credits per cycle",
  featureParticipants: "Up to {count} participants per meeting",
  featureLanguages: "Up to {count} languages simultaneously",
  featureDefaultSupport: "Standard email support",
};

function defaultPlanCopy(key: string, values?: Record<string, string | number>): string {
  let template = DEFAULT_PLAN_COPY[key] ?? key;
  if (values) {
    for (const [name, value] of Object.entries(values)) {
      template = template.replace(`{${name}}`, String(value));
    }
  }
  return template;
}

export function getPlanDescription(planName: string, t: PlanCopyTranslator = defaultPlanCopy): string {
  const name = (planName || "").toLowerCase();
  if (name.includes("startup")) {
    return t("descriptionStartup");
  }
  if (name.includes("enterprise")) {
    return t("descriptionEnterprise");
  }
  return t("descriptionDefault");
}

export function buildFeatureList(plan: PlanDto, t: PlanCopyTranslator = defaultPlanCopy): string[] {
  const features: string[] = [];

  if (plan.creditsPerCycle) {
    features.push(t("featureCredits", { count: plan.creditsPerCycle.toLocaleString() }));
  }
  if (plan.maxParticipants) {
    features.push(t("featureParticipants", { count: plan.maxParticipants }));
  }
  if (plan.maxLanguages) {
    features.push(t("featureLanguages", { count: plan.maxLanguages }));
  }


  try {
    const parsed = JSON.parse(plan.features || "[]");
    if (Array.isArray(parsed)) {
      features.push(...parsed);
    }
  } catch {}

  // Add defaults if it's completely empty
  if (features.length === 0) {
    features.push(t("featureDefaultSupport"));
  }

  return features;
}
