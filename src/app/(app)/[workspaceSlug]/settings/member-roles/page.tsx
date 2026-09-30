"use client";

import { Spinner } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useLocale, useTranslations } from "next-intl";

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
  const t = useTranslations("settingsMemberRoles");
  const locale = useLocale();
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
  const reviewTitle = targetRole === "Admin" ? t("review.promoteTitle") : t("review.demoteTitle");
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
        throw new Error(t("toasts.invalidPreview"));
      }

      const promotionDeadline = nextRole === "Admin"
        ? getPromotionCooldownDeadline(result.coolingOffUntil)
        : 0;
      if (promotionDeadline === null) {
        throw new Error(t("toasts.invalidCooldown"));
      }

      setRoleChangeIntent(createMemberRoleChangeIntent(result, () => crypto.randomUUID()));
      setRemainingCooldownSeconds(nextRole === "Admin" ? 1 : 0);
      setCooldownDeadline(nextRole === "Admin" ? promotionDeadline : null);
    } catch (error) {
      if (previewRequestId.current !== requestId) return;
      toast.error(
        getErrorMessage(error, t("toasts.previewFailed")),
      );
      resetReviewState();
    }
  };

  const applyRoleChange = async () => {
    if (!selectedMember || !confirmationMatches) {
      toast.error(t("toasts.confirmationRequired"));
      return;
    }

    if (isCoolingOff) {
      toast.error(t("toasts.promotionLocked", { seconds: remainingCooldownSeconds }));
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
      toast.error(t("toasts.staleReview"));
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
      toast.success(t("toasts.applySuccess"));
      resetReviewState();
    } catch (error) {
      toast.error(
        getErrorMessage(error, t("toasts.applyFailed")),
      );
    }
  };

  if (!workspaceId || !roleLoaded) {
    return (
      <div className="flex h-[80vh] items-center justify-center gap-2 text-xs text-ink-muted">
        <Spinner className="size-4 animate-spin" />
        {t("loadingAccess")}
      </div>
    );
  }

  if (role !== "owner") {
    return (
      <div className="flex h-[80vh] items-center justify-center px-4">
        <div className="max-w-md rounded-lg border border-hairline bg-surface-1 p-6 text-center">
          <h1 className="text-lg font-bold text-ink">{t("ownerRequired.title")}</h1>
          <p className="mt-2 text-xs text-ink-muted">
            {t("ownerRequired.description")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-8 text-ink">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold tracking-tight">{t("heading")}</h1>
        <p className="text-xs text-ink-muted">{t("subheading")}</p>
      </div>

      {receipt && (
        <section className="flex flex-col gap-3" aria-labelledby="latest-role-change">
          <h2
            id="latest-role-change"
            className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle"
          >
            {t("latestRoleChange.heading")}
          </h2>
          <div className="rounded-lg border border-hairline bg-surface-1 px-4 py-3 text-xs text-ink-muted">
            <p className="font-semibold text-ink">
              {t("latestRoleChange.roleChangeSummary", { oldRole: receipt.oldRole, newRole: receipt.newRole })}
            </p>
            <p className="mt-1">
              {t("latestRoleChange.effectiveAt", {
                date: new Date(receipt.effectiveAt).toLocaleString(locale),
              })}
            </p>
            <p className="mt-1 font-mono text-[11px]">{t("latestRoleChange.auditId", { id: receipt.auditId })}</p>
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3" aria-labelledby="internal-members-heading">
        <h2
          id="internal-members-heading"
          className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle"
        >
          {t("internalMembers.heading")}
        </h2>
        <div className="overflow-hidden rounded-lg border border-hairline bg-surface-1 divide-y divide-hairline">
          {membersQuery.isPending && (
            <div className="flex items-center justify-center gap-2 px-4 py-8 text-xs text-ink-muted">
              <Spinner className="size-4 animate-spin" />
              {t("internalMembers.loading")}
            </div>
          )}

          {membersQuery.isError && (
            <div className="flex flex-col items-start gap-3 px-4 py-5">
              <p className="text-xs text-ink-muted">
                {getErrorMessage(membersQuery.error, t("internalMembers.loadFailed"))}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={membersQuery.isFetching}
                onClick={() => void membersQuery.refetch()}
              >
                {membersQuery.isFetching ? t("internalMembers.retrying") : t("internalMembers.retry")}
              </Button>
            </div>
          )}

          {membersQuery.isSuccess && internalMembers.length === 0 && (
            <p className="px-4 py-8 text-center text-xs text-ink-muted">
              {t("internalMembers.empty")}
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
                    aria-label={t("internalMembers.changeRoleAria", { name: member.fullName })}
                    onClick={() => void openRoleReview(member.userId, nextRole)}
                  >
                    {isLoadingThisMember ? t("internalMembers.loadingButton") : t("internalMembers.changeRole")}
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
                {t("review.loading")}
              </div>
            ) : (
              roleChangeIntent && (
                <div className="flex flex-col gap-4">
                  <div>
                    <p className="text-xs font-semibold text-ink">{selectedMember.fullName}</p>
                    <p className="text-[11px] text-ink-muted">
                      {t("review.memberSummary", {
                        email: selectedMember.email,
                        role: selectedMember.roleName,
                        targetRole,
                      })}
                    </p>
                  </div>

                  <p className="text-xs text-ink-muted">
                    {targetRole === "Admin"
                      ? t("review.promoteHint")
                      : t("review.demoteHint")}
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
                      {t("review.confirmLabel")}
                    </Label>
                    <Input
                      id="member-role-confirmation"
                      value={confirmation}
                      autoComplete="off"
                      onChange={(event) => setConfirmation(event.target.value)}
                      placeholder={t("review.confirmPlaceholder", { value: confirmationValue })}
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
                        ? t("review.applying")
                        : isCoolingOff
                          ? remainingCooldownSeconds > 0
                            ? t("review.waitSeconds", { seconds: remainingCooldownSeconds })
                            : t("review.checkingCooldown")
                          : reviewTitle}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={changeMutation.isPending}
                      onClick={resetReviewState}
                    >
                      {t("review.cancel")}
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
