"use client";

/**
 * Whether a meeting keeps translating after the credits run out.
 *
 * The engine has been in the database since migration 041 — `settle_usage_charge` lets the
 * balance go negative, counts the overage, and suspends at a cap. Nothing ever exposed the
 * switch, so the answer was always no and a meeting stopped mid-sentence with nothing on any
 * screen explaining that it could have been otherwise.
 *
 * WHAT THIS CONTROL IS NOT
 *   It does not set the cap. That is a commercial term, written by WarpTalk through
 *   `PUT /contract-terms`, which is system-admin-only precisely because a customer choosing
 *   their own ceiling is a customer issuing themselves credit. This moves between OFF and the
 *   allowance the plan already grants, and says the figure out loud so nobody has to guess how
 *   far "keep going" goes.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Switch } from "@/components/ui/switch";
import { getErrorMessage } from "@/lib/api/errors";
import { billingService } from "@/services/billing.service";

import { Panel } from "./metric-grid";

export function OveragePanel({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["billing", "overage", workspaceId],
    queryFn: () => billingService.getOverageSetting(workspaceId),
    enabled: !!workspaceId,
    retry: 1,
  });

  const mutation = useMutation({
    mutationFn: (enabled: boolean) => billingService.setOverage(workspaceId, enabled),
    onSuccess: (next) => {
      queryClient.setQueryData(["billing", "overage", workspaceId], next);
      toast.success(
        next.enabled
          ? "Meetings will keep running past zero credits."
          : "Meetings will stop when credits reach zero.",
      );
    },
    // The server's own sentence. It refuses to enable this on a plan with no allowance, and
    // "Could not update" would leave the owner retrying a switch that can never move.
    onError: (error) =>
      toast.error(getErrorMessage(error, "Could not change the overage setting.")),
  });

  if (isLoading || !data) return null;

  // A plan with no allowance at all. Rendering a switch here would offer a choice that does not
  // exist — the honest answer is to say who can change that.
  if (data.planCapCredits <= 0) {
    return (
      <Panel title="Running out of credits" description="What happens at zero">
        <p className="text-[13px] text-ink-muted">
          Meetings stop translating when this workspace reaches zero credits. This plan has no
          overage allowance — contact WarpTalk to add one.
        </p>
      </Panel>
    );
  }

  const used = data.overageCreditsThisCycle;
  const cap = data.effectiveCapCredits || data.planCapCredits;

  return (
    <Panel
      title="Keep meetings running past zero"
      description="Instead of cutting translation off mid-sentence"
      actions={
        <Switch
          checked={data.enabled}
          disabled={mutation.isPending}
          onCheckedChange={(next) => mutation.mutate(next)}
          aria-label="Keep meetings running past zero credits"
        />
      }
    >
      <p className="text-[13px] text-ink-muted">
        {data.enabled ? (
          <>
            A meeting that runs out keeps translating on credit, up to{" "}
            <span className="font-medium text-ink">{cap.toLocaleString()}</span> credits this
            cycle. Past that it stops and the workspace is suspended until you top up.
          </>
        ) : (
          <>
            Translation stops the moment credits reach zero, mid-meeting. Your plan allows up to{" "}
            <span className="font-medium text-ink">{data.planCapCredits.toLocaleString()}</span>{" "}
            credits of overage if you turn this on.
          </>
        )}
      </p>

      {/* Only once it has actually been used. A "0 of 50,000" bar on a workspace that has never
          gone into overage is a debt meter for a debt nobody has. */}
      {used > 0 ? (
        <div className="mt-3">
          <div className="h-1 w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-amber-500"
              style={{ width: `${Math.min(100, (used / Math.max(cap, 1)) * 100)}%` }}
            />
          </div>
          <p className="mt-1.5 text-[12px] text-ink-subtle">
            {used.toLocaleString()} of {cap.toLocaleString()} overage credits used this cycle
          </p>
        </div>
      ) : null}
    </Panel>
  );
}
