"use client";

/**
 * The screen an unpaid workspace gets instead of the product. WT-515.
 *
 * The decision itself is not here — see `lib/billing/workspace-paywall`, which is where the three
 * ways a paywall can be wrong are written down and tested. This file is only what it looks like,
 * and who is being told.
 *
 * OWNER AND MEMBER GET DIFFERENT SENTENCES, on purpose. The owner is one click from fixing this
 * and should be given that click. A member cannot buy anything, and "Choose a plan" is a button
 * that would only ever fail for them — telling them who to ask is the actionable version.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { CreditCard, Spinner } from "@phosphor-icons/react";
import axios from "axios";

import { Button } from "@/components/ui/button";
import { billingService } from "@/services/billing.service";
import { decidePaywall } from "@/lib/billing/workspace-paywall";
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

  if (decision.kind === "open") return <>{children}</>;

  if (decision.kind === "checking") {
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
        <p className="mt-2 text-[14px] leading-6 text-ink-muted">
          {canBuy
            ? // Names the cause without accusing: the overwhelmingly common way to arrive here is
              // closing the Stripe tab, which does not feel like an action that left anything
              // half-done.
              "The checkout for this workspace was never completed, so nothing has been activated on it. Choose a plan to start using it."
            : "The owner of this workspace has not activated a plan yet. Ask them to finish setting it up, and everything here will open."}
        </p>

        <div className="mt-6 flex flex-col gap-2">
          {canBuy && (
            <Button
              className="h-10 w-full text-[14px]"
              onClick={() => router.push(`/${workspaceSlug}/settings/billing`)}
            >
              Choose a plan
            </Button>
          )}
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
