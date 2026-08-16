/**
 * Turning a plan you read into the plan you write.
 *
 * This exists because `PUT /plans/{id}` is a REPLACEMENT, not a patch. `PlanService.UpdatePlanAsync`
 * calls `plan.UpdateFromRequest(request)`, which assigns all twenty-two columns from the body — so
 * a field the client omits is not left alone. It takes the default declared on the C# record and
 * overwrites whatever was stored:
 *
 *   OverageCapCredits            → 0
 *   OveragePricePerCredit        → 4.0000
 *   LowBalanceThresholdCredits   → 0
 *   RolloverCapCredits           → 0
 *   InvoiceTermsDays             → 15
 *   InvoiceGraceHours            → 360
 *
 * Those six are exactly the ones `PlanDto` did not declare on this side until now, which means an
 * edit form assembled from the old type would have quietly rewritten a plan's overage economics
 * every time an admin changed its name. Nothing on screen would have said so.
 *
 * So the request is built from the WHOLE plan and the edits are laid over it, rather than built
 * from the form's own fields. `planRequestFields` is checked against the request in a test, so a
 * column added to `PlanRequest` later fails there instead of silently going out as a default.
 *
 * Deliberately free of React so `node:test` can exercise it without a renderer.
 */

import type { PlanRequest } from "@/types/admin-pricing";
import type { PlanDto } from "@/types/billing";

/**
 * The only billing cycle `PUT /plans/{id}` accepts.
 *
 * `SubscriptionConstants.BillingCycles` also declares "yearly", and `ValidatePlanRequest` rejects
 * it anyway — `isInvalidCycle` compares against Monthly alone. Offering the other value in a form
 * would produce a 400 that reads as a server fault rather than a choice that was never available.
 */
export const PLAN_BILLING_CYCLE = "monthly";

/** The currencies `ValidatePlanRequest` accepts. Anything else is refused before it reaches a row. */
export const PLAN_CURRENCIES = ["VND", "USD"] as const;

export type PlanCurrency = (typeof PLAN_CURRENCIES)[number];

/**
 * Every key the request carries. Kept beside the builder so the test can assert the two agree —
 * the failure this guards is a NEW column being added to `PlanRequest` and forgotten here, which
 * would send it as a default and reset it on every save, exactly as the six above were.
 */
export const planRequestFields = [
  "name",
  "slug",
  "tier",
  "price",
  "currency",
  "billingCycle",
  "creditsPerCycle",
  "maxParticipants",
  "features",
  "sortOrder",
  "overageCapCredits",
  "overagePricePerCredit",
  "lowBalanceThresholdCredits",
  "rolloverCapCredits",
  "invoiceTermsDays",
  "invoiceGraceHours",
  "isActive",
  "maxLanguages",
  "voiceCloneEnabled",
  "aiAssistantEnabled",
  "glossaryEnabled",
  "dedicatedGpu",
] as const satisfies readonly (keyof PlanRequest)[];

/** The plan exactly as it stands, in the shape the write endpoint takes. Changes nothing. */
export function planRequestFromDto(plan: PlanDto): PlanRequest {
  return {
    name: plan.name,
    slug: plan.slug,
    tier: plan.tier,
    price: plan.price,
    currency: plan.currency,
    billingCycle: plan.billingCycle,
    creditsPerCycle: plan.creditsPerCycle,
    maxParticipants: plan.maxParticipants,
    features: plan.features,
    sortOrder: plan.sortOrder,
    overageCapCredits: plan.overageCapCredits,
    overagePricePerCredit: plan.overagePricePerCredit,
    lowBalanceThresholdCredits: plan.lowBalanceThresholdCredits,
    rolloverCapCredits: plan.rolloverCapCredits,
    invoiceTermsDays: plan.invoiceTermsDays,
    invoiceGraceHours: plan.invoiceGraceHours,
    isActive: plan.isActive,
    maxLanguages: plan.maxLanguages,
    voiceCloneEnabled: plan.voiceCloneEnabled,
    aiAssistantEnabled: plan.aiAssistantEnabled,
    glossaryEnabled: plan.glossaryEnabled,
    dedicatedGpu: plan.dedicatedGpu,
  };
}

/**
 * The plan with an admin's edits laid over it.
 *
 * The base is the stored plan, not an empty form — that ordering is the whole point. A field the
 * dialog does not offer stays as it was read instead of arriving at the server as an omission.
 */
export function applyPlanEdits(plan: PlanDto, edits: Partial<PlanRequest>): PlanRequest {
  return { ...planRequestFromDto(plan), ...edits };
}

/**
 * The rules a form can check before spending a request, phrased the way the server phrases them.
 *
 * Deliberately NOT the whole of `ValidatePlanRequest`. The server owns validation and its messages
 * are surfaced verbatim when it refuses; duplicating all twenty-eight rules here would be a second
 * copy to drift. What is here are the ones whose violation is a mistake the form itself can make
 * — a cleared number field, a slug typed with spaces, a cycle no longer on offer — where a
 * round-trip would only report back what the reader can already see.
 */
export function validatePlanRequest(request: PlanRequest): string | null {
  const name = request.name.trim();
  if (!name) return "Name is required.";
  if (name.length > 100) return "Name must be 100 characters or fewer.";

  const slug = request.slug.trim();
  if (!slug) return "Slug is required.";
  if (slug.length > 50) return "Slug must be 50 characters or fewer.";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
    return "Slug must be lowercase letters, digits and single hyphens — for example 'growth-tier'.";

  const tier = request.tier.trim();
  if (!tier) return "Tier is required.";
  if (tier.length > 20) return "Tier must be 20 characters or fewer.";

  if (!PLAN_CURRENCIES.includes(request.currency as PlanCurrency))
    return "Currency must be VND or USD.";

  if (request.billingCycle !== PLAN_BILLING_CYCLE)
    return "Billing cycle must be monthly — the update endpoint accepts no other value.";

  /**
   * Every number, before any comparison against one.
   *
   * A cleared input parses to NaN, and NaN loses every comparison silently: `NaN > credits` and
   * `NaN < 0` are both false, so an emptied overage cap would sail past the range rules below and
   * reach the server as `null`. Named per field so the reader is told which box is empty.
   */
  const numbers: [number, string][] = [
    [request.price, "Price"],
    [request.creditsPerCycle, "Credits per cycle"],
    [request.overageCapCredits, "Overage cap"],
    [request.overagePricePerCredit, "Overage price per credit"],
    [request.lowBalanceThresholdCredits, "Low-balance threshold"],
    [request.rolloverCapCredits, "Rollover cap"],
    [request.invoiceTermsDays, "Invoice terms"],
    [request.invoiceGraceHours, "Invoice grace"],
    [request.maxParticipants, "Max participants"],
    [request.maxLanguages, "Max languages"],
    [request.sortOrder, "Sort order"],
  ];
  for (const [value, label] of numbers) {
    if (!Number.isFinite(value)) return `${label} must be a number.`;
  }

  if (request.price < 0) return "Price must be a positive amount.";
  if (!Number.isInteger(request.creditsPerCycle) || request.creditsPerCycle <= 0)
    return "Credits per cycle must be a whole number above zero.";

  // The three that are bounded BY the commitment. Each has a server rule behind it; stating them
  // here is what stops a reader from having to guess which of the four numbers was the wrong one.
  if (request.overageCapCredits < 0) return "Overage cap cannot be negative.";
  if (request.overageCapCredits > request.creditsPerCycle)
    return "Overage cap cannot exceed the credits the plan commits to.";
  if (request.rolloverCapCredits < 0) return "Rollover cap cannot be negative.";
  if (request.rolloverCapCredits > request.creditsPerCycle)
    return "Rollover cap cannot exceed the credits the plan commits to.";
  if (request.lowBalanceThresholdCredits >= request.creditsPerCycle)
    return "Low-balance threshold must be below the credits the plan commits to.";

  // A warning that fires only once the customer is already paying overage is not a warning.
  if (request.overageCapCredits > 0 && request.lowBalanceThresholdCredits <= request.overageCapCredits)
    return "Low-balance threshold must be above the overage cap, or the warning arrives too late to act on.";
  if (request.overageCapCredits > 0 && request.overagePricePerCredit <= 0)
    return "A plan that allows overage needs an overage price.";

  if (request.invoiceTermsDays <= 0) return "Invoice terms must be at least one day.";
  if (request.invoiceGraceHours <= 0) return "Invoice grace must be at least one hour.";
  if (request.maxParticipants < 2) return "A meeting plan needs room for at least two people.";
  if (request.maxLanguages < 1 || request.maxLanguages > 3)
    return "Max languages must be between 1 and 3.";
  if (request.sortOrder < 0) return "Sort order cannot be negative.";

  const features = request.features.trim();
  if (features && !isJsonContainer(features))
    return "Features must be a JSON array or object.";

  return null;
}

/**
 * The same shape test the server applies — start and end brackets, not a parse.
 *
 * Matching its looseness on purpose: a stricter check here would reject bodies the server accepts
 * and stop an admin from saving a plan whose features column was already stored that way.
 */
function isJsonContainer(value: string): boolean {
  return (
    (value.startsWith("{") && value.endsWith("}")) ||
    (value.startsWith("[") && value.endsWith("]"))
  );
}
