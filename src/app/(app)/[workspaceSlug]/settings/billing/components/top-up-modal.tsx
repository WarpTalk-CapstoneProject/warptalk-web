"use client";

/**
 * Buying credits, as a modal.
 *
 * It used to be a panel stacked under the plan cards on `/payment/plans`, so the page asked two
 * unrelated questions at once — "which plan do you want" and "how many credits do you want to
 * buy" — and the second one scrolled past most readers. Top-up is an errand, not a page: it is
 * reached from wherever the balance is shown, does one thing, and closes.
 *
 * WHAT THIS COMPONENT MUST NOT DO: price the purchase. The request carries the CREDIT COUNT and
 * the server prices it against billing_pricing_config, overwriting whatever amount we send. The
 * rate below is for the on-screen estimate only. A previous version of this UI quoted a
 * 10/9/8.5/8 VND volume ladder that existed nowhere else in the system and overcharged by 2–2.5×;
 * keeping the number display-only is what stops that recurring.
 */

import { Spinner } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatAmount, formatMoney } from "@/lib/format/currency";
import { billingService } from "@/services/billing.service";
import { useAuthStore } from "@/stores/auth-store";
import { cn } from "@/lib/utils";

import { BillingButton, Row, RowGroup, Section } from "./billing-primitives";

/** Stripe refuses a charge under 15,000 VND, which is 1,500 credits at the documented rate. */
const TOP_UP_MINIMUM_CREDITS = 1500;

/** Retail rate from docs/credit-economics.md §4.2. Display only — the server sets the price. */
const DOCUMENTED_VND_PER_CREDIT = 4;

/** Round numbers a person recognises, not a ladder of discounts we do not give. */
const TOP_UP_PACKAGES = [10_000, 25_000, 50_000, 100_000] as const;

export function TopUpModal({
  open,
  onOpenChange,
  workspaceId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
}) {
  const user = useAuthStore((state) => state.user);
  const [credits, setCredits] = useState<number>(TOP_UP_PACKAGES[0]);
  const [isProcessing, setIsProcessing] = useState(false);

  const belowMinimum = credits > 0 && credits < TOP_UP_MINIMUM_CREDITS;
  const estimate = credits * DOCUMENTED_VND_PER_CREDIT;

  const startCheckout = async () => {
    if (!user) return;

    // WT-370 — never bill a USER ID as a workspace. A plan and a credit balance both belong to a
    // workspace; without one there is nothing to charge, and saying so beats sending an id that
    // passes every validation and then fails on a foreign key inside the webhook.
    if (!workspaceId) {
      toast.error("Open a workspace before buying credits — credits belong to a workspace.");
      return;
    }

    try {
      setIsProcessing(true);
      const url = await billingService.createCheckoutSession({
        userId: user.id,
        workspaceId,
        amount: estimate,
        currency: "vnd",
        paymentType: "CreditTopUp",
        credits,
      });
      if (url) window.location.assign(url);
    } catch {
      toast.error("Failed to start checkout. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[460px] rounded-[14px] border-border bg-surface-1 p-0 shadow-none">
        <DialogHeader className="px-5 pt-5">
          <DialogTitle className="text-[16px] font-semibold text-ink">Buy credits</DialogTitle>
          <DialogDescription className="text-[12px] text-ink-muted">
            Credits are added to this workspace as soon as the payment clears.
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 pb-5">
          <div className="grid grid-cols-2 gap-2">
            {TOP_UP_PACKAGES.map((amount) => {
              const selected = credits === amount;
              return (
                <button
                  key={amount}
                  type="button"
                  onClick={() => setCredits(amount)}
                  className={cn(
                    "rounded-[10px] border px-3 py-2.5 text-left shadow-none transition-colors",
                    selected
                      ? "border-primary bg-primary/5"
                      : "border-border bg-surface-1 hover:bg-surface-2",
                  )}
                >
                  <p className="text-[13px] font-medium tabular-nums text-ink">
                    {formatAmount(amount)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-ink-muted">
                    ≈ {formatMoney(amount * DOCUMENTED_VND_PER_CREDIT, "VND")}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="mt-3">
            <label
              htmlFor="topup-credits"
              className="text-[12px] font-medium text-ink-muted"
            >
              Or enter an amount
            </label>
            <Input
              id="topup-credits"
              type="number"
              min={0}
              value={credits || ""}
              onChange={(event) =>
                setCredits(Math.max(0, parseInt(event.target.value, 10) || 0))
              }
              placeholder={`${TOP_UP_MINIMUM_CREDITS.toLocaleString()} minimum`}
              className="mt-1.5 h-9 rounded-[8px] border-border bg-surface-1 text-[13px] shadow-none"
            />
          </div>

          <Section className="mt-4 bg-surface-2/40">
            <RowGroup>
              <Row label="Credits" value={formatAmount(credits)} />
              <Row
                label="Estimated total"
                value={formatMoney(estimate, "VND")}
                hint="The final amount is priced by the server at checkout."
              />
            </RowGroup>
          </Section>

          {belowMinimum ? (
            <p className="mt-3 text-[12px] text-amber-500">
              The minimum is {formatAmount(TOP_UP_MINIMUM_CREDITS)} credits — Stripe refuses a
              charge below {formatMoney(TOP_UP_MINIMUM_CREDITS * DOCUMENTED_VND_PER_CREDIT, "VND")}.
            </p>
          ) : null}

          <BillingButton
            tone="primary"
            className="mt-4 h-[36px]"
            disabled={isProcessing || credits < TOP_UP_MINIMUM_CREDITS}
            onClick={() => void startCheckout()}
          >
            {isProcessing ? (
              <>
                <Spinner className="h-3.5 w-3.5 animate-spin" />
                Starting checkout…
              </>
            ) : (
              "Continue to payment"
            )}
          </BillingButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
