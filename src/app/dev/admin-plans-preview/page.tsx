"use client";

/**
 * Admin → Plans & pricing → Preview, against fixtures.
 *
 * The real tab needs a platform-admin session and the live plans API. This renders the same
 * component with a ladder shaped like production's (three active USD plans and two hidden ones),
 * so the overlay controls can be looked at in both themes and at phone width. The two callbacks
 * only report what was pressed: the dialogs they open belong to the page.
 */

import { useState } from "react";

import { PlanStorefrontPreview } from "@/components/admin/plan-storefront-preview";
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
  return (
    <div className="mx-auto max-w-[1200px] bg-panel p-6 text-ink">
      <p className="text-[12px] text-ink-muted">Last action: {last}</p>
      <PlanStorefrontPreview
        plans={PLANS}
        isPending={false}
        isError={false}
        onRetry={() => setLast("retry")}
        onEdit={(p) => setLast(`edit ${p.slug}`)}
        onCreate={() => setLast("create")}
      />
    </div>
  );
}
