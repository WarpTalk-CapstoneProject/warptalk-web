"use client";

/**
 * What an unpaid workspace gets instead of the product. WT-515, WT-570.
 *
 * The decision itself is not here — see `lib/billing/workspace-paywall`, which is where the three
 * ways a paywall can be wrong are written down and tested. This file is only what it looks like,
 * and who is being told.
 *
 * OWNER AND MEMBER GET DIFFERENT TREATMENT, on purpose, and WT-570 widened the gap.
 *
 *   The owner can pay, so they are not shown a screen ABOUT paying — they are put ON the payment
 *   page and kept there. Creating a workspace stays allowed (it has to be: Subscription.WorkspaceId
 *   is non-nullable, so the row must exist before checkout can attach to it); what is no longer
 *   allowed is wandering off unpaid. Every gated route bounces back to /payment/plans, so the only
 *   ways out of that page are buying a plan or leaving the workspace.
 *
 *   A member cannot buy anything. Redirecting them to a plan grid whose every button 403s would be
 *   a trap, so they still get the sentence that names who to ask.
 */

import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { CreditCard, Spinner } from "@phosphor-icons/react";
import axios from "axios";

import { Button } from "@/components/ui/button";
import { billingService } from "@/services/billing.service";
import { decidePaywall, paywallRedirectPath } from "@/lib/billing/workspace-paywall";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { SubscriptionDto } from "@/types/billing";

/** The server's error code, dug out of whatever axios wrapped it in. */
function errorCode(error: unknown): string | null {
  if (!axios.isAxiosError(error)) return null;
  const body = error.response?.data as { code?: string } | undefined;
  return body?.code ?? null;
}

export function WorkspacePaywall({
  workspaceSlug,
  children,
}: {
  workspaceSlug: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const workspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const role = useWorkspaceStore((state) => state.role);
  // Lowercase: the store normalises through normalizeWorkspaceRole before writing.
  const canBuy = role === "owner" || role === "admin";

  const subscriptionQuery = useQuery<SubscriptionDto | null>({
    queryKey: ["subscription", workspaceId],
    queryFn: () => billingService.getActiveSubscription(workspaceId!),
    enabled: Boolean(workspaceId),
    // "This workspace has not paid" is not a transient failure and retrying it three times only
    // delays the answer by a few seconds on every page load. A real outage is handled by the
    // decision rule instead, which treats an unrecognised error as "unknown", not "unpaid".
    retry: false,
    staleTime: 60_000,
  });

  const decision = useMemo(
    () =>
      decidePaywall({
        pathname,
        workspaceSlug,
        // A workspace we have not resolved yet cannot be judged. Without this the query is
        // `enabled: false` — never loading, never erroring, holding no data — which reads exactly
        // like a definitive "no subscription" and would paywall every workspace for a frame.
        isLoading: !workspaceId || subscriptionQuery.isPending,
        subscription: subscriptionQuery.data,
        error: subscriptionQuery.error ? { code: errorCode(subscriptionQuery.error) } : null,
      }),
    [pathname, workspaceSlug, workspaceId, subscriptionQuery.isPending, subscriptionQuery.data, subscriptionQuery.error],
  );

  // WT-570 — the buyer is HELD on the payment page rather than shown a screen about it.
  //
  // `replace`, not `push`: the gated route must not survive in history, or Back walks straight
  // into the paywall again and the user ping-pongs. And it is an effect rather than a redirect
  // during render because navigating while rendering is what produces React's
  // "Cannot update a component while rendering a different component" warning.
  const holdOnPaymentPage = decision.kind === "blocked" && canBuy;
  useEffect(() => {
    if (holdOnPaymentPage) router.replace(paywallRedirectPath(workspaceSlug));
  }, [holdOnPaymentPage, router, workspaceSlug]);

  if (decision.kind === "open") return <>{children}</>;

  // The redirect above lands on the next tick; showing the product for that tick is exactly the
  // leak this gate exists to close, so the spinner covers both waits.
  if (decision.kind === "checking" || holdOnPaymentPage) {
    return (
      <div className="flex h-dvh w-full items-center justify-center bg-canvas">
        <Spinner className="h-6 w-6 animate-spin text-ink-muted" />
      </div>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-4 text-ink">
      <div className="w-full max-w-[420px] text-center">
        <span className="mx-auto grid size-11 place-items-center rounded-full border border-border bg-surface-1 text-ink-muted">
          <CreditCard size={20} />
        </span>
        <h1 className="mt-4 text-[22px] font-semibold tracking-tight">
          This workspace has no plan yet
        </h1>
        {/* Only somebody who cannot buy reaches this screen — WT-570 sends everybody else to the
            checkout instead — so there is one sentence here, and no button that would 403. */}
        <p className="mt-2 text-[14px] leading-6 text-ink-muted">
          The owner of this workspace has not activated a plan yet. Ask them to finish setting it
          up, and everything here will open.
        </p>

        <div className="mt-6 flex flex-col gap-2">
          <Button
            variant="ghost"
            className="h-9 w-full text-[13px] text-ink-muted"
            onClick={() => router.push("/workspace")}
          >
            Switch workspace
          </Button>
        </div>
      </div>
    </main>
  );
}
