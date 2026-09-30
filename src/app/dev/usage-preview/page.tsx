"use client";

/**
 * The workspace Usage page, rendered against fixtures.
 *
 * The page needs a live billing service, a member directory and room history, none of which a
 * laptop can reach, so this is the only place its layout can be looked at before it deploys. It
 * renders the page's layout component (`UsageOverview`) — not its queries — in both themes, at a
 * width you can drag, in the two states the approved mock showed plus the one real production
 * shape that broke the old bar chart: nearly the whole cycle spent on one day.
 *
 * Fixtures only; /dev is 404 in production.
 */

import { useMemo, useState } from "react";

import { UsageOverview } from "@/app/(app)/[workspaceSlug]/settings/billing/components/usage-overview";
import type { MeetingWindowLike, UsageMemberLike } from "@/lib/billing/usage-overview";
import type { CreditBalanceDto, CreditTransactionDto, FeatureAdoptionDto } from "@/types/billing";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const START = new Date(2026, 7, 20, 0, 0, 0).getTime();
const END = new Date(2026, 8, 20, 0, 0, 0).getTime();
const NOW = new Date(2026, 8, 17, 15, 0, 0).getTime();

const MEMBERS: UsageMemberLike[] = [
  { userId: "u-tu", fullName: "Thai Tu Huynh", email: "tu@example.com" },
  { userId: "u-nhi", fullName: "Hanh Nhi Ngo", email: "nhi@example.com" },
  { userId: "u-tuan", fullName: "Manh Tuan Tran", email: "tuan@example.com" },
  { userId: "u-ky", fullName: "Ngoc Ky Huynh", email: "ky@example.com" },
];

type Scenario = "light" | "heavy" | "spike";

function rng(seed: number) {
  let value = seed;
  return () => (value = (value * 16807) % 2147483647) / 2147483647;
}

function build(scenario: Scenario) {
  const random = rng(scenario === "light" ? 3 : scenario === "heavy" ? 7 : 11);
  const titles = ["Weekly product sync", "Customer onboarding — Tokyo", "Capstone defense rehearsal", "Design review", "Standup"];
  const speakers = ["u-tu", "u-nhi", "u-tuan", scenario === "light" ? "u-tu" : "u-ky", "u-gone"];
  const rooms: MeetingWindowLike[] = [];
  const txs: CreditTransactionDto[] = [];
  let balance = 2_087_377;
  let seq = 0;

  const push = (tx: Omit<CreditTransactionDto, "id" | "workspaceId" | "balanceAfter">) => {
    balance += tx.amount;
    seq += 1;
    txs.push({ id: `tx-${seq}`, workspaceId: "w1", balanceAfter: balance, ...tx });
  };

  const days = Math.floor((NOW - START) / DAY) + 1;
  for (let day = 0; day < days; day += 1) {
    const active = scenario === "heavy" ? random() > 0.2 : random() > 0.72;
    const spikeDay = scenario === "spike" && day === 12;
    if (!active && !spikeDay) continue;
    const meetingsToday = spikeDay ? 1 : 1 + Math.floor(random() * (scenario === "heavy" ? 3 : 1.5));
    for (let m = 0; m < meetingsToday; m += 1) {
      const startAt = START + day * DAY + (9 + m * 2) * HOUR + Math.floor(random() * 30) * 60_000;
      const minutes = spikeDay ? 110 : 15 + Math.floor(random() * 70);
      const id = `room-${day}-${m}`;
      rooms.push({
        id,
        title: day === 3 && m === 0 ? null : titles[Math.floor(random() * titles.length)],
        startedAt: new Date(startAt).toISOString(),
        endedAt: new Date(startAt + minutes * 60_000).toISOString(),
      });
      const perMinute = spikeDay ? 90 : scenario === "heavy" ? 6 : 2;
      for (let minute = 0; minute < minutes; minute += 1) {
        const at = startAt + minute * 60_000 + 20_000;
        const userId = speakers[Math.floor(random() * speakers.length)];
        for (let i = 0; i < perMinute; i += 1) {
          const roll = random();
          const chargeType =
            roll < 0.55 ? "TRANSLATION" : roll < 0.85 ? "AUDIO_DUBBING_STANDARD" : roll < 0.97 ? "AUDIO_DUBBING_VOICE_CLONE" : "STT";
          const amount = -(spikeDay ? 400 + Math.floor(random() * 400) : 1 + Math.floor(random() * 4));
          push({
            userId,
            amount,
            type: "consume",
            description: `Aggregated ${chargeType}`,
            referenceType: chargeType === "TRANSLATION" ? "translation_content" : "audio_dubbing",
            referenceId: `seg-${seq}`,
            createdAt: new Date(at + i * 1000).toISOString(),
          });
        }
      }
    }
    // A post-meeting backfill: billed after every meeting ended, so it matches none.
    if (day % 5 === 1) {
      push({
        userId: "u-nhi",
        amount: -3,
        type: "consume",
        description: "Aggregated TRANSLATION",
        referenceType: "translation_content",
        referenceId: `seg-${seq}`,
        createdAt: new Date(START + day * DAY + 22 * HOUR).toISOString(),
      });
    }
  }

  if (scenario !== "light") {
    push({ userId: "u-tu", amount: 500_000, type: "top_up", description: "Top-up via Stripe", referenceType: "stripe_payment", createdAt: new Date(START + 9 * DAY).toISOString() });
    push({ userId: null, amount: -1_200, type: "adjustment", description: "Manual correction", referenceType: "manual_adjustment", createdAt: new Date(START + 15 * DAY).toISOString() });
  }

  const spent = txs.filter((t) => t.amount < 0).reduce((sum, t) => sum - t.amount, 0);
  const balanceDto: CreditBalanceDto = {
    workspaceId: "w1",
    currentCredits: balance,
    creditsUsedThisCycle: spent,
    totalCredits: scenario === "heavy" ? 400_000 : 2_087_377,
    status: "active",
    currentPeriodStart: new Date(START).toISOString(),
    currentPeriodEnd: new Date(END).toISOString(),
  };

  const breakdown = new Map<string, FeatureAdoptionDto>();
  for (const t of txs) {
    if (t.type !== "consume") continue;
    const usageType = (t.description ?? "").replace("Aggregated ", "");
    const row = breakdown.get(usageType) ?? { usageType, usageCount: 0, totalCreditsConsumed: 0 };
    row.usageCount += 1;
    row.totalCreditsConsumed -= t.amount;
    breakdown.set(usageType, row);
  }

  return { txs: txs.reverse(), rooms, balance: balanceDto, breakdown: [...breakdown.values()] };
}

export default function UsagePreviewPage() {
  const [dark, setDark] = useState(false);
  const [scenario, setScenario] = useState<Scenario>("light");
  const [width, setWidth] = useState(1180);
  const data = useMemo(() => build(scenario), [scenario]);

  return (
    <div className={dark ? "dark" : ""}>
      <div className="min-h-screen bg-canvas px-4 py-4 text-ink">
        <div className="mb-4 flex flex-wrap items-center gap-2 text-[12px]">
          <button type="button" onClick={() => setDark((v) => !v)} className="rounded-full border border-border px-3 py-1">
            {dark ? "Light" : "Dark"}
          </button>
          {(["light", "heavy", "spike"] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={scenario === s}
              onClick={() => setScenario(s)}
              className={`rounded-full border border-border px-3 py-1 ${scenario === s ? "bg-surface-3" : ""}`}
            >
              {s === "light" ? "Light use" : s === "heavy" ? "Heavy, overage" : "One-day spike"}
            </button>
          ))}
          <label className="ml-2 inline-flex items-center gap-2 text-ink-muted">
            Width {width}px
            <input type="range" min={360} max={1400} value={width} onChange={(e) => setWidth(Number(e.target.value))} />
          </label>
        </div>

        <div
          className="overflow-hidden rounded-[12px] border border-hairline bg-panel"
          style={{ width, maxWidth: "100%" }}
        >
          <UsageOverview
            balance={data.balance}
            ledger={data.txs}
            serviceUsage={data.breakdown}
            members={MEMBERS}
            rooms={data.rooms}
            now={NOW}
            isLoading={false}
            workspaceSlug="demo"
            onRefresh={() => undefined}
          />
        </div>
      </div>
    </div>
  );
}
