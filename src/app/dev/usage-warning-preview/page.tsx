"use client";

/**
 * The usage warning, in every state it has. WT-557.
 *
 * Exists because the real thing only appears to a workspace that is nearly out of credits, which
 * is not a state anyone can get into on purpose to look at — and "ship it and wait for a customer
 * to run low" is not a way to check whether a bar renders. Same reasoning as
 * /dev/agent-steps-preview.
 *
 * Not linked from anywhere and not in any navigation. It renders the card directly, so nothing
 * here talks to billing.
 */

import { useState } from "react";

import { UsageWarningCard } from "@/components/billing/usage-warning-card";
import { decideUsageWarning } from "@/lib/billing/usage-warning";
import type { CreditBalanceDto } from "@/types/billing";

function balance(remaining: number, used: number, days = 7): CreditBalanceDto {
  const start = new Date("2026-08-21T13:16:00.000Z");
  const end = new Date(start.getTime() + days * 86_400_000);
  return {
    workspaceId: "019f0d00-0de0-7000-9000-0000000000aa",
    currentCredits: remaining,
    creditsUsedThisCycle: used,
    totalCredits: remaining + used,
    status: "active",
    currentPeriodStart: start.toISOString(),
    currentPeriodEnd: end.toISOString(),
  };
}

const CASES: { label: string; balance: CreditBalanceDto; canBuy: boolean }[] = [
  { label: "10% — the moment it first appears, weekly cycle", balance: balance(1_000, 9_000), canBuy: true },
  { label: "4% — the state on the ticket", balance: balance(400, 9_600), canBuy: true },
  { label: "1% — critical, turns red", balance: balance(100, 9_900), canBuy: true },
  { label: "0% — spent, bar empty", balance: balance(0, 10_000), canBuy: true },
  { label: "4% on a monthly cycle", balance: balance(400, 9_600, 30), canBuy: true },
  { label: "4% seen by a MEMBER — no buttons, told who to ask", balance: balance(400, 9_600), canBuy: false },
];

export default function UsageWarningPreviewPage() {
  const [dismissed, setDismissed] = useState<number[]>([]);

  return (
    <div className="min-h-dvh bg-surface-1 p-8">
      <div className="mx-auto max-w-2xl space-y-8">
        <div>
          <h1 className="text-[18px] font-semibold text-ink">Usage warning — WT-557</h1>
          <p className="mt-1 text-[13px] text-ink-muted">
            Every state the card has. Dismiss is local to this page.
          </p>
        </div>

        {CASES.map((testCase, index) => {
          const warning = decideUsageWarning(testCase.balance);
          return (
            <section key={testCase.label} data-testid={`case-${index}`}>
              <p className="mb-1 px-4 text-[11px] font-medium uppercase tracking-wide text-ink-subtle">
                {testCase.label}
              </p>
              {!warning ? (
                <p className="px-4 text-[13px] text-ink-muted">(no warning — decided against)</p>
              ) : dismissed.includes(index) ? (
                <p className="px-4 text-[13px] text-ink-muted">(dismissed)</p>
              ) : (
                <UsageWarningCard
                  warning={warning}
                  canBuy={testCase.canBuy}
                  onAddCredits={() => {}}
                  onUpgrade={() => {}}
                  onDismiss={() => setDismissed((current) => [...current, index])}
                />
              )}
            </section>
          );
        })}

        <section data-testid="case-healthy">
          <p className="mb-1 px-4 text-[11px] font-medium uppercase tracking-wide text-ink-subtle">
            50% — must render nothing at all
          </p>
          {decideUsageWarning(balance(5_000, 5_000)) ? (
            <p className="px-4 text-[13px] text-destructive">BUG: a healthy workspace was warned</p>
          ) : (
            <p className="px-4 text-[13px] text-ink-muted">(nothing, correctly)</p>
          )}
        </section>
      </div>
    </div>
  );
}
