/**
 * WT-853 — one source of truth for what a plan card SAYS.
 *
 * Four pages sell the same plans: the landing Pricing section, the unpaid workspace's activation
 * page, Billing → Plans, and the Stripe-return copy of it. The first two built the benefit list
 * here; Billing → Plans had its own inline list ("Voice Cloning Enabled", "Web access for up to
 * 500 members") and printed the raw DB description, so the Enterprise card promised different
 * things depending on where you read it. Every plan page now takes its description from
 * `describePlan` and its benefits from `buildFeatureList`; check-plan-copy-single-source.mjs
 * fails the build if a page goes back to writing its own.
 *
 * Pure and dependency-free: node-run tests import it without a bundler.
 */
import type { PlanDto } from "../../types/billing";
import { planHighlights } from "./plan-features.ts";

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

/**
 * The sentence under a plan's name. The description an admin wrote for the plan wins; without one,
 * the tier's standard sentence. Every plan page calls this rather than choosing between the two
 * itself — that choice, made differently per page, was half of WT-853.
 */
export function describePlan(
  plan: Pick<PlanDto, "name" | "description">,
  t: PlanCopyTranslator = defaultPlanCopy,
): string {
  return plan.description?.trim() || getPlanDescription(plan.name, t);
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


  // The lines an admin ticked under "Shown on the pricing page" (features.highlights), or a legacy
  // array. The column is an object on every production plan, so before 3 Oct 2026 nothing in it was
  // ever listed here.
  features.push(...planHighlights(plan.features));

  // Add defaults if it's completely empty
  if (features.length === 0) {
    features.push(t("featureDefaultSupport"));
  }

  return features;
}
