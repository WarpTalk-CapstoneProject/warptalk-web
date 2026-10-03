"use client";

/**
 * Admin → Plans & pricing → Preview, against fixtures.
 *
 * The real tab needs a platform-admin session and the live plans API. This renders the same
 * component with a ladder shaped like production's (three active USD plans and two hidden ones),
 * so the overlay controls can be looked at in both themes and at phone width. Toggle and reorder
 * act on local state; the pencil opens the real editor (its save only reports the request).
 */

import { useState } from "react";

import { PlanStorefrontPreview } from "@/components/admin/plan-storefront-preview";
import { PlanEditDialog } from "@/components/admin/pricing-editors";
import type { PlanDto } from "@/types/billing";

const plan = (over: Partial<PlanDto>): PlanDto =>
  ({
    id: over.slug,
    tier: "standard",
    currency: "USD",
    billingCycle: "monthly",
    maxParticipants: 50,
    maxLanguages: 3,
    isActive: true,
    voiceCloneEnabled: false,
    aiAssistantEnabled: false,
    glossaryEnabled: false,
    dedicatedGpu: false,
    ...over,
  }) as PlanDto;

const PLANS: PlanDto[] = [
  plan({ slug: "starter", name: "Starter", price: 29, creditsPerCycle: 30_000, sortOrder: 1 }),
  plan({
    slug: "team",
    name: "Team",
    price: 99,
    creditsPerCycle: 150_000,
    sortOrder: 2,
    maxParticipants: 200,
    voiceCloneEnabled: true,
    aiAssistantEnabled: true,
  }),
  plan({
    slug: "enterprise",
    name: "Enterprise",
    price: 299,
    creditsPerCycle: 700_000,
    sortOrder: 3,
    maxParticipants: 500,
    overageCapCredits: 70_000,
    overagePricePerCredit: 0.000427143,
    lowBalanceThresholdCredits: 140_000,
    rolloverCapCredits: 0,
    invoiceTermsDays: 15,
    invoiceGraceHours: 360,
    // Production's contract-plan object, verbatim in shape.
    features: JSON.stringify({
      billing_model: "contract_template",
      overage_policy: "invoice_after_cap",
      external_integrations: { google_meet: true },
      voice_clone_limit_mins: -1,
      supported_external_platforms: ["google_meet"],
    }),
    voiceCloneEnabled: true,
    aiAssistantEnabled: true,
    glossaryEnabled: true,
    dedicatedGpu: true,
  }),
  plan({ slug: "legacy-vnd", name: "Startup (VND)", price: 290_000, currency: "VND", creditsPerCycle: 30_000, sortOrder: 2, isActive: false }),
  plan({ slug: "testplan", name: "TestCreditExhaustePlna", price: 4, creditsPerCycle: 100, sortOrder: 0, isActive: false }),
];

export default function AdminPlansPreviewDev() {
  const [last, setLast] = useState("nothing yet");
  const [plans, setPlans] = useState(PLANS);
  const [editing, setEditing] = useState<PlanDto | null>(null);
  return (
    <div className="mx-auto max-w-[1200px] bg-panel p-6 text-ink">
      <p className="text-[12px] text-ink-muted">Last action: {last}</p>
      <PlanStorefrontPreview
        plans={plans}
        isPending={false}
        isError={false}
        onRetry={() => setLast("retry")}
        onEdit={(p) => {
          setLast(`edit ${p.slug}`);
          setEditing(p);
        }}
        onCreate={() => setLast("create")}
        onToggleActive={async (p, isActive) => {
          setPlans((current) => current.map((x) => (x.id === p.id ? { ...x, isActive } : x)));
          setLast(`${p.slug} ${isActive ? "shown" : "hidden"}`);
        }}
        onReorder={async (updates) => {
          const next = new Map(updates.map(({ plan, sortOrder }) => [plan.id, sortOrder]));
          setPlans((current) => current.map((x) => (next.has(x.id) ? { ...x, sortOrder: next.get(x.id)! } : x)));
          setLast(`reordered: ${updates.map(({ plan, sortOrder }) => `${plan.slug}=${sortOrder}`).join(", ")}`);
        }}
      />
      <PlanEditDialog
        plan={editing}
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        onSubmit={async (request) => setLast(`save ${JSON.stringify(request)}`)}
        isSaving={false}
      />
    </div>
  );
}
