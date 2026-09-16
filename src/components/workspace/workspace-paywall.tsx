"use client";

/**
 * The gate that stands between an unpaid workspace and the product. WT-515, WT-570.
 *
 * The decision itself is not here — see `lib/billing/workspace-paywall`, which is where the three
 * ways a paywall can be wrong are written down and tested. This file only carries the decision
 * out: hold the product back, and send the person to the activation landing.
 *
 * IT NO LONGER RENDERS A SCREEN OF ITS OWN, and that is the point of the change.
 *
 *   WT-570 sent buyers to `/{slug}/payment/plans` and showed everybody else a sentence. Both
 *   halves were wrong in the same way. The plans page lives inside the `(app)` route group, so
 *   "held on the payment page" drew the entire portal around it — sidebar, tabs, header — with
 *   every destination in it bouncing straight back here; and the sentence shown to members was a
 *   dead end that never named the workspace or what it would cost to open it.
 *
 *   There is one destination now, `/{slug}/activate`, and it is a page rather than a fragment: it
 *   names the workspace, lists the plans, and takes the payment. Who is looking at it — somebody
 *   who can buy, or somebody who can only ask — is a question that page answers, because it is
 *   the page that has the workspace's name and the plan grid to answer it with.
 */

import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { Spinner } from "@phosphor-icons/react";
import axios from "axios";

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

  const subscriptionQuery = useQuery<SubscriptionDto | null>({
    queryKey: ["subscription", workspaceId],
    queryFn: () => billingService.getActiveSubscription(workspaceId!),
    enabled: Boolean(workspaceId),
    // "This workspace has not paid" is not a transient failure and retrying it three times only
    // delays the answer by a few seconds on every page load. A real outage is handled by the
    // decision rule instead, which treats an unrecognised error as "unknown", not "unpaid".
    //
    // These options are repeated verbatim on the activation landing, deliberately: identical
    // observers share one cache entry, so the landing reads the answer this gate already has
    // instead of asking again with slightly different semantics.
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

  // Everybody goes to the same place, whatever their role.
  //
  // `replace`, not `push`: the gated route must not survive in history, or Back walks straight
  // into the paywall again and the user ping-pongs. And it is an effect rather than a redirect
  // during render because navigating while rendering is what produces React's
  // "Cannot update a component while rendering a different component" warning.
  const blocked = decision.kind === "blocked";
  useEffect(() => {
    if (blocked) router.replace(paywallRedirectPath(workspaceSlug));
  }, [blocked, router, workspaceSlug]);

  if (decision.kind === "open") return <>{children}</>;

  // The redirect above lands on the next tick; showing the product for that tick is exactly the
  // leak this gate exists to close, so the spinner covers both waits.
  return (
    <div className="flex h-dvh w-full items-center justify-center bg-canvas">
      <Spinner className="h-6 w-6 animate-spin text-ink-muted" />
    </div>
  );
}
