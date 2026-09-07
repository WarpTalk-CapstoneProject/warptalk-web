"use client";

/**
 * What the usage warning LOOKS like. WT-557.
 *
 * Split from the banner that feeds it so this file has no data source, no store and no router:
 * hand it a decision and three callbacks and it renders. That is what makes it previewable at
 * /dev/usage-warning-preview without an authenticated workspace whose credits happen to be
 * nearly gone — which is otherwise a state you cannot get into on purpose to look at.
 */

import { WarningCircle, X } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { formatResetMoment, type UsageWarning } from "@/lib/billing/usage-warning";
import { cn } from "@/lib/utils";

export function UsageWarningCard({
  warning,
  canBuy,
  onAddCredits,
  onUpgrade,
  onDismiss,
}: {
  warning: UsageWarning;
  /** Members cannot buy or upgrade; offering them buttons that 403 is worse than saying so. */
  canBuy: boolean;
  onAddCredits: () => void;
  onUpgrade: () => void;
  onDismiss: () => void;
}) {
  const resetMoment = warning.resetsAt ? formatResetMoment(warning.resetsAt) : null;
  // The bar shows what is LEFT, so it empties as the cycle is spent — the direction people
  // expect from a fuel gauge. Floored at 1% while any credit remains, because a sliver of colour
  // is the difference between "nearly out" and "the bar is broken".
  const barWidth = warning.creditsRemaining > 0 ? Math.max(1, warning.percentRemaining) : 0;

  return (
    <div
      role="status"
      data-testid="usage-warning-card"
      // Amber, not a token: this codebase has no --warning variable, and every other caution
      // surface (AdjustCreditModal, WorkspaceStatusBadge) is amber-500 utilities. Matching them
      // is what keeps one warning colour in the product rather than two.
      className="mx-4 mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3"
    >
      <div className="flex items-start gap-3">
        <WarningCircle
          weight="fill"
          size={18}
          className={cn(
            "mt-0.5 shrink-0",
            warning.isCritical ? "text-destructive" : "text-amber-600 dark:text-amber-400",
          )}
        />

        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-ink">
            {warning.percentRemaining}% usage remaining
          </p>

          {warning.cadence || resetMoment ? (
            <p className="mt-0.5 text-[12px] text-ink-muted">
              {warning.cadence ? `Resets ${warning.cadence}` : null}
              {warning.cadence && resetMoment ? " · " : null}
              {resetMoment ? `Next reset is on ${resetMoment}` : null}
            </p>
          ) : null}

          <div
            className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
            role="progressbar"
            aria-valuenow={warning.percentRemaining}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Credits remaining this cycle"
          >
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-500",
                warning.isCritical ? "bg-destructive" : "bg-amber-500",
              )}
              style={{ width: `${barWidth}%` }}
            />
          </div>

          {canBuy ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={onAddCredits}>
                Add credits
              </Button>
              <Button size="sm" variant="outline" onClick={onUpgrade}>
                Upgrade
              </Button>
            </div>
          ) : (
            <p className="mt-2 text-[12px] text-ink-muted">
              Ask a workspace owner to add credits or upgrade the plan.
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss usage warning"
          className="-mr-1 -mt-1 shrink-0 cursor-pointer rounded-md p-1 text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
