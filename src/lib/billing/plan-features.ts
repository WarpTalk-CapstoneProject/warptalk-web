/**
 * The plan's `features` JSON, as controls an admin can read.
 *
 * WHAT THE COLUMN ACTUALLY HOLDS (production, 3 Oct 2026)
 *   An object, not a list: `{}` on most plans, and on the contract plans
 *     { voice_clone_limit_mins, billing_model: "contract_template", overage_policy:
 *       "invoice_after_cap", external_integrations: { google_meet }, supported_external_platforms }
 *   Plan.cs calls it "an opaque marketing bag that nothing validates", and nothing reads those keys.
 *   The editor showed it as a raw JSON textarea; the owner could not tell what to type.
 *
 * So each key it really carries becomes a control, plus `highlights` — the lines the pricing page
 * lists under a plan, which buildFeatureList now reads. A key this file does not know is carried
 * through untouched: the form must never delete what it does not show.
 *
 * A legacy ARRAY value (the pricing page's original shape) is read as highlights.
 */

export type PlanFeatures = {
  /** Google Meet bridge sold with the plan: external_integrations.google_meet + supported_external_platforms. */
  googleMeet: boolean;
  /** Billed by contract and invoiced after the cap: billing_model + overage_policy. */
  contractBilling: boolean;
  /** Voice-clone minutes per cycle; -1 unlimited; null when the plan does not say. */
  voiceCloneLimitMins: number | null;
  /** Lines shown under the plan on the pricing page. */
  highlights: string[];
  /** Every other key, kept as it was. */
  rest: Record<string, unknown>;
};

const KNOWN_KEYS = new Set([
  "external_integrations",
  "supported_external_platforms",
  "billing_model",
  "overage_policy",
  "voice_clone_limit_mins",
  "highlights",
]);

/** Suggestions for the highlights checklist. The admin can add their own lines. */
export const SUGGESTED_HIGHLIGHTS = [
  "Real-time speech translation",
  "Dubbing in your own cloned voice",
  "AI meeting summaries and minutes",
  "Custom glossary",
  "Google Meet bridge",
  "Priority support",
  "Dedicated account manager",
] as const;

function parse(json: string | null | undefined): unknown {
  if (!json || !json.trim()) return {};
  try {
    return JSON.parse(json);
  } catch {
    return {};
  }
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim() !== "")
    : [];
}

export function parsePlanFeatures(json: string | null | undefined): PlanFeatures {
  const value = parse(json);
  if (Array.isArray(value)) {
    return { googleMeet: false, contractBilling: false, voiceCloneLimitMins: null, highlights: strings(value), rest: {} };
  }
  const object = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const integrations =
    object.external_integrations && typeof object.external_integrations === "object"
      ? (object.external_integrations as Record<string, unknown>)
      : {};
  const rest: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(object)) {
    if (!KNOWN_KEYS.has(key)) rest[key] = item;
  }
  // Integrations other than Google Meet stay with the rest so they survive a save.
  const otherIntegrations = Object.fromEntries(
    Object.entries(integrations).filter(([key]) => key !== "google_meet"),
  );
  if (Object.keys(otherIntegrations).length > 0) rest.external_integrations = otherIntegrations;

  return {
    googleMeet: integrations.google_meet === true || strings(object.supported_external_platforms).includes("google_meet"),
    contractBilling: object.billing_model === "contract_template",
    voiceCloneLimitMins:
      typeof object.voice_clone_limit_mins === "number" ? object.voice_clone_limit_mins : null,
    highlights: strings(object.highlights),
    rest,
  };
}

export function serializePlanFeatures(features: PlanFeatures): string {
  const out: Record<string, unknown> = { ...features.rest };
  const otherIntegrations =
    out.external_integrations && typeof out.external_integrations === "object"
      ? (out.external_integrations as Record<string, unknown>)
      : {};
  delete out.external_integrations;

  if (features.voiceCloneLimitMins !== null) out.voice_clone_limit_mins = features.voiceCloneLimitMins;
  if (features.contractBilling) {
    out.billing_model = "contract_template";
    out.overage_policy = "invoice_after_cap";
  }
  const integrations = { ...otherIntegrations, ...(features.googleMeet ? { google_meet: true } : {}) };
  if (Object.keys(integrations).length > 0) out.external_integrations = integrations;
  if (features.googleMeet) out.supported_external_platforms = ["google_meet"];

  const highlights = [...new Set(features.highlights.map((line) => line.trim()).filter(Boolean))];
  if (highlights.length > 0) out.highlights = highlights;
  return JSON.stringify(out);
}

/** The pricing page's lines for a plan: highlights from the object, or the legacy array itself. */
export function planHighlights(json: string | null | undefined): string[] {
  return parsePlanFeatures(json).highlights;
}
