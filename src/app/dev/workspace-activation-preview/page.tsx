"use client";

/**
 * The activation landing, in every state it has.
 *
 * Exists because the real thing only appears to a workspace that has been created and never paid
 * for — a state you can only reach by starting a checkout and abandoning it, twice, once as an
 * owner and once as a member. That is not a way to check whether a page reads well. Same
 * reasoning as /dev/usage-warning-preview.
 *
 * Not linked from anywhere and not in any navigation. It renders the component directly, so
 * nothing here talks to billing and no button charges anything.
 */

import { useState } from "react";

import { WorkspaceActivationLanding } from "@/components/workspace/workspace-activation-landing";
import type { BillingInterval } from "@/lib/billing/plan-pricing";
import type { PlanDto } from "@/types/billing";

function plan(overrides: Partial<PlanDto> & Pick<PlanDto, "id" | "name" | "slug">): PlanDto {
  return {
    tier: "standard",
    price: 0,
    currency: "vnd",
    billingCycle: "monthly",
    creditsPerCycle: 0,
    maxParticipants: 10,
    maxLanguages: 3,
    isActive: true,
    sortOrder: 0,
    features: "[]",
    ...overrides,
  } as PlanDto;
}

const PLANS: PlanDto[] = [
  plan({
    id: "p1",
    name: "Starter",
    slug: "starter",
    description: "For a small team trying live translation on real meetings.",
    price: 490_000,
    creditsPerCycle: 5_000,
    maxParticipants: 10,
    maxLanguages: 3,
    sortOrder: 1,
  }),
  plan({
    id: "p2",
    name: "Startup",
    slug: "startup",
    price: 1_290_000,
    creditsPerCycle: 20_000,
    maxParticipants: 30,
    maxLanguages: 6,
    sortOrder: 2,
  }),
  plan({
    id: "p3",
    name: "Enterprise",
    slug: "enterprise",
    description: "Voice cloning and native-feeling interpretation at scale.",
    price: 200,
    currency: "usd",
    creditsPerCycle: 100_000,
    maxParticipants: 100,
    maxLanguages: 12,
    sortOrder: 3,
    features: JSON.stringify(["Voice cloning", "Dedicated GPU capacity", "Priority support"]),
  }),
];

type Case = {
  label: string;
  props: Partial<React.ComponentProps<typeof WorkspaceActivationLanding>>;
};

const CASES: Case[] = [
  {
    label: "Owner, never paid — the state after pressing Back on Stripe",
    props: { canBuy: true },
  },
  {
    label: "Member — same page, prices visible, no buttons that would 403",
    props: { canBuy: false },
  },
  {
    label: "Owner, plan lapsed — a returning customer is not told they never had one",
    props: {
      canBuy: true,
      lapsed: { planName: "Enterprise", endedOn: new Date("2026-08-14T00:00:00Z") },
    },
  },
  {
    label: "Plans still loading",
    props: { canBuy: true, plans: [], plansLoading: true },
  },
  {
    label: "No plans published — a platform fault, and it must not read as the viewer's",
    props: { canBuy: true, plans: [], plansLoading: false },
  },
  {
    label: "Checkout opening — every button locked while Stripe loads",
    props: { canBuy: true, pendingPlanSlug: "startup" },
  },
  {
    label: "Arrived mid-purchase — the plan they picked before the workspace existed is marked",
    props: { canBuy: true, preselectedPlanSlug: "startup" },
  },
];

export default function WorkspaceActivationPreviewPage() {
  const [interval, setInterval] = useState<BillingInterval>("monthly");

  return (
    <div className="min-h-dvh bg-surface-2 py-8">
      <div className="mx-auto max-w-5xl px-6">
        <h1 className="text-[18px] font-semibold text-ink">Workspace activation landing</h1>
        <p className="mt-1 text-[13px] text-ink-muted">
          Every state the page has. Nothing here charges anything — the buttons are inert.
        </p>
      </div>

      <div className="mt-8 space-y-10">
        {CASES.map((testCase, index) => (
          <section key={testCase.label} data-testid={`case-${index}`}>
            <p className="mx-auto max-w-5xl px-6 pb-2 text-[12px] font-medium uppercase tracking-wide text-ink-muted">
              {testCase.label}
            </p>
            <div className="overflow-hidden rounded-xl border border-border">
              <WorkspaceActivationLanding
                workspaceName="Acme Corp"
                canBuy
                plans={PLANS}
                plansLoading={false}
                interval={interval}
                onIntervalChange={setInterval}
                pendingPlanSlug={null}
                onChoosePlan={() => {}}
                onSwitchWorkspace={() => {}}
                onSignOut={() => {}}
                {...testCase.props}
              />
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
