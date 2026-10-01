"use client";

/**
 * The Billing overview's new pieces, rendered against fixtures (WT-878).
 *
 * The real page needs a live billing API and a signed-in owner; none of that is reachable from a
 * laptop. This renders the credit meter, the stat cells and the plan ladder from fixtures shaped
 * to reach each level on purpose, so they can be looked at in light and dark and at phone width.
 * It is not the page: it cannot catch a wrong query key, only what the components look like.
 */

import { useState } from "react";

import type { BillingInterval } from "@/lib/billing/plan-pricing";
import type { CreditBalanceDto, PlanDto } from "@/types/billing";
import { Wallet } from "@phosphor-icons/react";
import {
  BillingButton,
  StatCell,
} from "@/app/(app)/[workspaceSlug]/settings/billing/components/billing-primitives";
import {
  CreditLevelPill,
  CreditMeter,
  creditLook,
} from "@/app/(app)/[workspaceSlug]/settings/billing/components/credit-meter";
import { PlanGrid } from "@/app/(app)/[workspaceSlug]/settings/billing/components/plan-grid";

const DAY = 24 * 60 * 60 * 1000;
const TOTAL = 2_087_377;

function balance(used: number, total: number, day: number): CreditBalanceDto {
  const now = Date.now();
  return {
    workspaceId: "preview",
    currentCredits: total - used,
    creditsUsedThisCycle: used,
    totalCredits: total,
    status: "active",
    currentPeriodStart: new Date(now - (day - 0.5) * DAY).toISOString(),
    currentPeriodEnd: new Date(now + (30 - day + 0.5) * DAY).toISOString(),
  };
}

const STATES: Record<string, { label: string; balance: CreditBalanceDto; overage: boolean }> = {
  prod: { label: "Production today", balance: balance(863, TOTAL, 14), overage: true },
  mid: { label: "Mid-cycle 60%", balance: balance(1_250_000, TOTAL, 14), overage: true },
  low: { label: "Low 92%", balance: balance(1_921_000, TOTAL, 14), overage: true },
  crit: { label: "Critical 99.5%", balance: balance(2_076_000, TOTAL, 20), overage: true },
  over: { label: "Overage 104%", balance: balance(2_170_000, TOTAL, 22), overage: true },
  zero: { label: "No allowance", balance: balance(0, 0, 14), overage: false },
  early: { label: "Day 0 (no projection)", balance: balance(40_000, TOTAL, 0.4), overage: false },
};

const PLAN: PlanDto = {
  id: "p1",
  name: "Enterprise",
  slug: "enterprise",
  tier: "enterprise",
  price: 1_900_000,
  currency: "VND",
  billingCycle: "monthly",
  creditsPerCycle: 700_000,
  maxParticipants: 500,
  maxLanguages: 3,
  isActive: true,
  sortOrder: 1,
  voiceCloneEnabled: true,
  aiAssistantEnabled: true,
  glossaryEnabled: true,
  dedicatedGpu: true,
} as PlanDto;

export default function BillingOverviewPreview() {
  const [key, setKey] = useState("mid");
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const state = STATES[key];
  const { level, look } = creditLook(state.balance);

  return (
    <div className="mx-auto max-w-[1100px] bg-panel text-ink">
      <div className="flex flex-wrap gap-1.5 border-b border-hairline px-4 py-3">
        {Object.entries(STATES).map(([k, s]) => (
          <button
            key={k}
            type="button"
            aria-pressed={k === key}
            onClick={() => setKey(k)}
            className="h-7 rounded-full border border-hairline px-3 text-[12px] aria-pressed:bg-ink aria-pressed:text-panel"
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="grid sm:grid-cols-2">
        <StatCell
          label="Credits Remaining"
          className="sm:border-r"
          value={Math.max(0, state.balance.currentCredits).toLocaleString()}
          badge={<CreditLevelPill level={level} />}
          valueTone={look.valueTone}
          meter={
            <CreditMeter balance={state.balance} overage={null} overagesOn={state.overage} />
          }
          lines={[`${state.balance.creditsUsedThisCycle.toLocaleString()} spent since the cycle began.`]}
        />
        <StatCell
          label="Current Plan"
          value="Enterprise"
          lines={["1,900,000 VND per cycle.", "Billed monthly.", "500 participants · 3 languages per meeting."]}
          actions={
            <>
              <BillingButton tone="outline" className="w-auto px-3.5">
                <Wallet className="h-3.5 w-3.5" />
                Buy credits
              </BillingButton>
              <BillingButton tone="outline" className="w-auto px-3.5">
                Manage subscription
              </BillingButton>
            </>
          }
        />
      </div>
      <PlanGrid
        plans={[PLAN]}
        currentPlanId="p1"
        onSelect={() => undefined}
        interval={interval}
        onIntervalChange={setInterval}
      />
    </div>
  );
}
