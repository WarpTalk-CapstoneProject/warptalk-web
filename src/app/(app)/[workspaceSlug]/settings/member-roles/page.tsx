"use client";

import { Spinner } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useApplyWorkspaceMemberRoleChange,
  usePreviewWorkspaceMemberRoleChange,
  useWorkspaceMembers,
} from "@/hooks/use-workspace";
import { useWorkspaceRole, useWorkspaceRoleLoaded } from "@/hooks/use-workspace-role";
import { getErrorMessage } from "@/lib/api/errors";
import {
  buildMemberRoleChangeRequest,
  createMemberRoleChangeIntent,
  getMemberRoleConfirmationValue,
  getPromotionCooldownDeadline,
  isRoleChangePreviewForTarget,
  matchesMemberRoleConfirmation,
  type EditableWorkspaceRole,
  type MemberRoleChangeIntent,
} from "@/lib/workspace/member-role-change";
import { normalizeWorkspaceRole } from "@/lib/workspace/workspace-role";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { WorkspaceRoleChangeResult } from "@/types/workspace";

type RoleChangeReceipt = Pick<
  WorkspaceRoleChangeResult,
  "auditId" | "oldRole" | "newRole" | "effectiveAt"
>;

export default function MemberRolesPage() {
  const workspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const role = useWorkspaceRole();
  const roleLoaded = useWorkspaceRoleLoaded();
  const membersQuery = useWorkspaceMembers(
    roleLoaded && role === "owner" ? (workspaceId ?? undefined) : undefined,
    1,
    100,
  );
  const previewMutation = usePreviewWorkspaceMemberRoleChange(workspaceId ?? "");
  const changeMutation = useApplyWorkspaceMemberRoleChange(workspaceId ?? "");
  const previewRequestId = useRef(0);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [targetRole, setTargetRole] = useState<EditableWorkspaceRole>("Admin");
  const [confirmation, setConfirmation] = useState("");
  const [cooldownDeadline, setCooldownDeadline] = useState<number | null>(null);
  const [remainingCooldownSeconds, setRemainingCooldownSeconds] = useState(0);
  const [roleChangeIntent, setRoleChangeIntent] = useState<MemberRoleChangeIntent | null>(null);
  const [receipt, setReceipt] = useState<RoleChangeReceipt | null>(null);

  useEffect(() => {
    if (cooldownDeadline === null) return;

    const updateRemainingTime = () => {
      const seconds = Math.max(0, Math.ceil((cooldownDeadline - Date.now()) / 1000));
      setRemainingCooldownSeconds(seconds);
      if (seconds === 0) setCooldownDeadline(null);
    };

    updateRemainingTime();
    const timer = window.setInterval(updateRemainingTime, 250);
    return () => window.clearInterval(timer);
  }, [cooldownDeadline]);

  const members = useMemo(() => membersQuery.data?.items ?? [], [membersQuery.data]);
  const internalMembers = useMemo(
    () =>
      members.filter(
        (member) =>
          member.membershipType.toLowerCase() === "internal" &&
          normalizeWorkspaceRole(member.roleName) !== "owner",
      ),
    [members],
  );
  const selectedMember = useMemo(
    () => internalMembers.find((member) => member.userId === selectedUserId) ?? null,
    [internalMembers, selectedUserId],
  );
  const confirmationValue = selectedMember
    ? getMemberRoleConfirmationValue(selectedMember.email, selectedMember.fullName)
    : "";
  const confirmationMatches = selectedMember
    ? matchesMemberRoleConfirmation(
        confirmation,
        selectedMember.email,
        selectedMember.fullName,
      )
    : false;
  const reviewTitle = targetRole === "Admin" ? "Promote to Admin" : "Demote to Member";
  const isCoolingOff = targetRole === "Admin" && cooldownDeadline !== null;

  const resetReviewState = () => {
    previewRequestId.current += 1;
    previewMutation.reset();
    setSelectedUserId(null);
    setConfirmation("");
    setCooldownDeadline(null);
    setRemainingCooldownSeconds(0);
    setRoleChangeIntent(null);
  };

  const openRoleReview = async (userId: string, nextRole: EditableWorkspaceRole) => {
    const requestId = previewRequestId.current + 1;
    previewRequestId.current = requestId;
    previewMutation.reset();
    setSelectedUserId(userId);
    setTargetRole(nextRole);
    setConfirmation("");
    setReceipt(null);
    setCooldownDeadline(null);
    setRemainingCooldownSeconds(0);
    setRoleChangeIntent(null);

    try {
      const result = await previewMutation.mutateAsync({ userId, toRole: nextRole });
      if (previewRequestId.current !== requestId) return;

      if (!isRoleChangePreviewForTarget(result, userId, nextRole)) {
        throw new Error("The server returned an invalid role review. Reload members and try again.");
      }

      const promotionDeadline = nextRole === "Admin"
        ? getPromotionCooldownDeadline(result.coolingOffUntil)
        : 0;
      if (promotionDeadline === null) {
        throw new Error("The role review did not include a valid cooling-off period. Try again.");
      }

      setRoleChangeIntent(createMemberRoleChangeIntent(result, () => crypto.randomUUID()));
      setRemainingCooldownSeconds(nextRole === "Admin" ? 1 : 0);
      setCooldownDeadline(nextRole === "Admin" ? promotionDeadline : null);
    } catch (error) {
      if (previewRequestId.current !== requestId) return;
      toast.error(
        getErrorMessage(error, "Couldn't load the role review. Reload members and try again."),
      );
      resetReviewState();
    }
  };

  const applyRoleChange = async () => {
    if (!selectedMember || !confirmationMatches) {
      toast.error("Type the target email or full name exactly to confirm.");
      return;
    }

    if (isCoolingOff) {
      toast.error(`Promotion unlocks in ${remainingCooldownSeconds}s.`);
      return;
    }

    if (
      !roleChangeIntent ||
      !isRoleChangePreviewForTarget(
        roleChangeIntent.preview,
        selectedMember.userId,
        targetRole,
      )
    ) {
      toast.error("The role review is missing or stale. Reload members and try again.");
      resetReviewState();
      return;
    }

    try {
      const result = await changeMutation.mutateAsync({
        userId: selectedMember.userId,
        request: buildMemberRoleChangeRequest(roleChangeIntent, targetRole),
      });

      setReceipt({
        auditId: result.auditId,
        oldRole: result.oldRole,
        newRole: result.newRole,
        effectiveAt: result.effectiveAt,
      });
      toast.success("Role change applied for the next request or session.");
      resetReviewState();
    } catch (error) {
      toast.error(
        getErrorMessage(error, "Role change failed. Reload the role review and try again."),
      );
    }
  };

  if (!workspaceId || !roleLoaded) {
    return (
      <div className="flex h-[80vh] items-center justify-center gap-2 text-xs text-ink-muted">
        <Spinner className="size-4 animate-spin" />
        Loading workspace access...
      </div>
    );
  }

  if (role !== "owner") {
    return (
      <div className="flex h-[80vh] items-center justify-center px-4">
        <div className="max-w-md rounded-lg border border-hairline bg-surface-1 p-6 text-center">
          <h1 className="text-lg font-bold text-ink">Owner access required</h1>
          <p className="mt-2 text-xs text-ink-muted">
            Only the workspace owner can manage member roles.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-8 text-ink">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold tracking-tight">Member roles</h1>
        <p className="text-xs text-ink-muted">Change roles for active internal members.</p>
      </div>

      {receipt && (
        <section className="flex flex-col gap-3" aria-labelledby="latest-role-change">
          <h2
            id="latest-role-change"
            className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle"
          >
            Latest role change
          </h2>
          <div className="rounded-lg border border-hairline bg-surface-1 px-4 py-3 text-xs text-ink-muted">
            <p className="font-semibold text-ink">
              {receipt.oldRole} to {receipt.newRole}
            </p>
            <p className="mt-1">Effective at {new Date(receipt.effectiveAt).toLocaleString()}.</p>
            <p className="mt-1 font-mono text-[11px]">Audit ID: {receipt.auditId}</p>
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3" aria-labelledby="internal-members-heading">
        <h2
          id="internal-members-heading"
          className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle"
        >
          Internal members
        </h2>
        <div className="overflow-hidden rounded-lg border border-hairline bg-surface-1 divide-y divide-hairline">
          {membersQuery.isPending && (
            <div className="flex items-center justify-center gap-2 px-4 py-8 text-xs text-ink-muted">
              <Spinner className="size-4 animate-spin" />
              Loading members...
            </div>
          )}

          {membersQuery.isError && (
            <div className="flex flex-col items-start gap-3 px-4 py-5">
              <p className="text-xs text-ink-muted">
                {getErrorMessage(membersQuery.error, "Couldn't load workspace members.")}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={membersQuery.isFetching}
                onClick={() => void membersQuery.refetch()}
              >
                {membersQuery.isFetching ? "Retrying..." : "Retry"}
              </Button>
            </div>
          )}

          {membersQuery.isSuccess && internalMembers.length === 0 && (
            <p className="px-4 py-8 text-center text-xs text-ink-muted">
              No eligible internal members.
            </p>
          )}

          {membersQuery.isSuccess &&
            internalMembers.map((member) => {
              const memberRole = normalizeWorkspaceRole(member.roleName);
              const nextRole: EditableWorkspaceRole =
                memberRole === "member" ? "Admin" : "Member";
              const isLoadingThisMember =
                previewMutation.isPending && selectedUserId === member.userId;

              return (
                <div
                  key={member.userId}
                  className="flex flex-col items-start justify-between gap-3 px-4 py-3 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-ink">{member.fullName}</p>
                    <p className="truncate text-[11px] text-ink-muted">
                      {member.email} | {member.roleName}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full sm:w-auto"
                    disabled={previewMutation.isPending || changeMutation.isPending}
                    aria-label={`Change role for ${member.fullName}`}
                    onClick={() => void openRoleReview(member.userId, nextRole)}
                  >
                    {isLoadingThisMember ? "Loading..." : "Change role"}
                  </Button>
                </div>
              );
            })}
        </div>
      </section>

      {selectedMember && (
        <section className="flex flex-col gap-3" aria-labelledby="role-review-heading">
          <h2
            id="role-review-heading"
            className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle"
          >
            {reviewTitle}
          </h2>
          <div className="rounded-lg border border-hairline bg-surface-1 p-4">
            {previewMutation.isPending && !roleChangeIntent ? (
              <div className="flex items-center gap-2 py-4 text-xs text-ink-muted">
                <Spinner className="size-4 animate-spin" />
                Loading role review...
              </div>
            ) : (
              roleChangeIntent && (
                <div className="flex flex-col gap-4">
                  <div>
                    <p className="text-xs font-semibold text-ink">{selectedMember.fullName}</p>
                    <p className="text-[11px] text-ink-muted">
                      {selectedMember.email} | {selectedMember.roleName} to {targetRole}
                    </p>
                  </div>

                  <p className="text-xs text-ink-muted">
                    {targetRole === "Admin"
                      ? "Promotion unlocks after a 60-second cooling-off period."
                      : "Demotion applies to the next request or session."}
                  </p>

                  {(roleChangeIntent.preview.impact?.length ?? 0) > 0 && (
                    <ul className="list-disc space-y-1 pl-5 text-xs text-ink-muted">
                      {roleChangeIntent.preview.impact.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  )}

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="member-role-confirmation" className="text-xs font-semibold">
                      Confirm this change
                    </Label>
                    <Input
                      id="member-role-confirmation"
                      value={confirmation}
                      autoComplete="off"
                      onChange={(event) => setConfirmation(event.target.value)}
                      placeholder={`Type ${confirmationValue} to confirm`}
                    />
                  </div>

                  <div className="flex flex-col-reverse gap-2 sm:flex-row">
                    <Button
                      type="button"
                      disabled={
                        changeMutation.isPending ||
                        !confirmationMatches ||
                        isCoolingOff
                      }
                      onClick={() => void applyRoleChange()}
                    >
                      {changeMutation.isPending
                        ? "Applying..."
                        : isCoolingOff
                          ? remainingCooldownSeconds > 0
                            ? `Wait ${remainingCooldownSeconds}s`
                            : "Checking cooldown..."
                          : reviewTitle}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={changeMutation.isPending}
                      onClick={resetReviewState}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )
            )}
          </div>
        </section>
      )}
    </div>
  );
}
