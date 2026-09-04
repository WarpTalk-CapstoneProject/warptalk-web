"use client";

/**
 * "4% usage remaining" — telling a workspace before its credits run out. WT-557.
 *
 * A live meeting that stops mid-sentence because the workspace ran dry is the worst possible way
 * to learn about a balance, and until now it was the only way: nothing anywhere told anyone they
 * were close.
 *
 * THIS FILE IS THE WIRING, NOT THE PICTURE. Three separations, each deliberate:
 *   - WHETHER to warn lives in `lib/billing/usage-warning`, where the rules are tested
 *   - WHAT IT LOOKS LIKE lives in `usage-warning-card`, so it can be previewed without an
 *     authenticated workspace that happens to be nearly out of credits
 *   - buying credits is the existing TopUpModal, never a second copy
 *
 * OWNER AND MEMBER GET DIFFERENT CARDS. A member cannot buy credits or change the plan, so
 * offering them two buttons that 403 would be worse than the silence this replaces; they are told
 * who to ask instead. Same reasoning as WorkspacePaywall, deliberately.
 */

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { UsageWarningCard } from "@/components/billing/usage-warning-card";
import { decideUsageWarning, dismissalKey } from "@/lib/billing/usage-warning";
import { billingService } from "@/services/billing.service";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { CreditBalanceDto } from "@/types/billing";

// Reached into the billing settings tree on purpose rather than copied. That file's own header
// records what a second copy cost last time: a duplicated credit price that overcharged by
// 2–2.5× because the server, not the client, sets the amount. One modal, one set of caveats.
import { TopUpModal } from "@/app/(app)/[workspaceSlug]/settings/billing/components/top-up-modal";

/**
 * How often the balance is re-read while somebody is working.
 *
 * Polling rather than a subscription because the billing hub carries no credit-spend event —
 * it is fully wired and silent on this particular fact, so there is nothing to subscribe to.
 * Two minutes is well inside the time it takes a meeting to burn a meaningful share of a cycle,
 * and cheap enough to run on every workspace page.
 */
const BALANCE_POLL_MS = 120_000;

/**
 * Which warnings this session has been told to stop showing.
 *
 * A store rather than component state read in an effect. sessionStorage cannot be touched during
 * render — the server has none, so reading it while rendering is a hydration mismatch on every
 * page that mounts this — and reading it in an effect means setState in an effect, which is a
 * cascading render on every navigation. `useSyncExternalStore` is the API for exactly this shape:
 * an external source of truth, a server snapshot that is always "not dismissed", and a
 * subscription so the dismiss button re-renders the one component that cares.
 */
const dismissalListeners = new Set<() => void>();

function subscribeToDismissals(onChange: () => void): () => void {
  dismissalListeners.add(onChange);
  return () => {
    dismissalListeners.delete(onChange);
  };
}

function isDismissed(key: string | null): boolean {
  if (!key) return false;
  try {
    return window.sessionStorage.getItem(key) !== null;
  } catch {
    // Private-mode Safari throws on sessionStorage access. A warning that cannot remember a
    // dismissal is a nuisance; a page that crashes is worse.
    return false;
  }
}

function rememberDismissal(key: string): void {
  try {
    window.sessionStorage.setItem(key, "1");
  } catch {
    // See above. The banner still hides for this render either way.
  }
  for (const listener of dismissalListeners) listener();
}

export function UsageWarningBanner({ workspaceSlug }: { workspaceSlug: string }) {
  const router = useRouter();
  const workspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const role = useWorkspaceStore((state) => state.role);
  const canBuy = role === "owner" || role === "admin";

  const [topUpOpen, setTopUpOpen] = useState(false);

  const { data: balance } = useQuery<CreditBalanceDto | null>({
    queryKey: ["credit-balance", workspaceId],
    queryFn: () => billingService.getWorkspaceCredits(workspaceId!),
    enabled: Boolean(workspaceId),
    // A workspace with no subscription answers 404 here, and that is not a transient failure.
    // The paywall is what handles that case; this banner simply stays quiet.
    retry: false,
    refetchInterval: BALANCE_POLL_MS,
    staleTime: BALANCE_POLL_MS,
  });

  const warning = useMemo(() => decideUsageWarning(balance), [balance]);

  // Computed before any early return, because it feeds a hook. Null whenever there is nothing to
  // dismiss, which the store reads as "not dismissed".
  const key = warning && workspaceId ? dismissalKey(workspaceId, warning.bucket) : null;

  const dismissed = useSyncExternalStore(
    subscribeToDismissals,
    useCallback(() => isDismissed(key), [key]),
    // Server snapshot: nothing is dismissed, so the markup the server produces matches the
    // client's first paint for anyone who has not pressed the button.
    () => false,
  );

  if (!warning || !workspaceId || !key || dismissed) return null;

  const dismiss = () => rememberDismissal(key);

  return (
    <>
      <UsageWarningCard
        warning={warning}
        canBuy={canBuy}
        onAddCredits={() => setTopUpOpen(true)}
        onUpgrade={() => router.push(`/${workspaceSlug}/settings/billing`)}
        onDismiss={dismiss}
      />

      {canBuy ? (
        <TopUpModal open={topUpOpen} onOpenChange={setTopUpOpen} workspaceId={workspaceId} />
      ) : null}
    </>
  );
}
