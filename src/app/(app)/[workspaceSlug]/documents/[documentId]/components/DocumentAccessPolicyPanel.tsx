"use client";

import { useMemo, useState } from "react";
import { Check, Lock, MagnifyingGlass, Users, X } from "@phosphor-icons/react";
import { toast } from "sonner";

import { Card, CardContent } from "@/components/ui/card";

interface WorkspaceMemberItem {
  userId: string;
  fullName: string;
  email: string;
  roleName: string;
  membershipType?: string;
}

interface PolicyItem {
  id: string;
  subjectType: string;
  subjectId?: string | null;
  effect: string;
}

interface DocumentAccessPolicyPanelProps {
  canManagePolicies: boolean;
  isExternalAllowed: boolean;
  isSubmitting: boolean;
  policiesList: PolicyItem[];
  membersList: WorkspaceMemberItem[];
  protectedUserIds?: Array<string | null | undefined>;
  toggleExternalAccess: (checked: boolean) => Promise<void>;
  allowUser: (
    userId: string,
    userName: string,
    options?: { silent?: boolean },
  ) => Promise<void>;
  blockUser: (
    userId: string,
    userName: string,
    options?: { silent?: boolean },
  ) => Promise<void>;
  removePolicy: (
    policyId: string,
    options?: { silent?: boolean },
  ) => Promise<void>;
}

type PolicyEffect = "ALLOW" | "DENY";
type BulkAction = {
  effect: PolicyEffect;
  mode: "add" | "clear";
};

export function DocumentAccessPolicyPanel({
  canManagePolicies,
  isExternalAllowed,
  isSubmitting,
  policiesList,
  membersList,
  protectedUserIds = [],
  toggleExternalAccess,
  allowUser,
  blockUser,
  removePolicy,
}: DocumentAccessPolicyPanelProps) {
  const [allowedSearch, setAllowedSearch] = useState("");
  const [blockedSearch, setBlockedSearch] = useState("");
  const [bulkAction, setBulkAction] = useState<BulkAction | null>(null);

  const userPolicies = useMemo(
    () => policiesList.filter((policy) => policy.subjectType === "User"),
    [policiesList],
  );

  const protectedUserIdSet = useMemo(
    () =>
      new Set(
        protectedUserIds
          .filter((userId): userId is string => Boolean(userId))
          .map((userId) => userId.toLowerCase()),
      ),
    [protectedUserIds],
  );

  const policyMembers = useMemo(
    () =>
      membersList.filter((member) => {
        const role = member.roleName.toLowerCase();
        const isSystemGoverned =
          role.includes("owner") || role.includes("admin");
        const isProtectedUser = protectedUserIdSet.has(
          member.userId.toLowerCase(),
        );

        return !isSystemGoverned && !isProtectedUser;
      }),
    [membersList, protectedUserIdSet],
  );

  const policyMemberIds = useMemo(
    () => new Set(policyMembers.map((member) => member.userId)),
    [policyMembers],
  );

  const allowedCount = userPolicies.filter(
    (policy) =>
      policy.effect === "ALLOW" &&
      Boolean(policy.subjectId && policyMemberIds.has(policy.subjectId)),
  ).length;
  const blockedCount = userPolicies.filter(
    (policy) =>
      policy.effect === "DENY" &&
      Boolean(policy.subjectId && policyMemberIds.has(policy.subjectId)),
  ).length;

  const findUserPolicy = (userId: string, effect: PolicyEffect) =>
    userPolicies.find(
      (policy) => policy.subjectId === userId && policy.effect === effect,
    );

  const handleToggleMember = async (
    member: WorkspaceMemberItem,
    effect: PolicyEffect,
  ) => {
    const existing = findUserPolicy(member.userId, effect);
    if (existing) {
      await removePolicy(existing.id);
      return;
    }

    const opposite = findUserPolicy(
      member.userId,
      effect === "ALLOW" ? "DENY" : "ALLOW",
    );
    if (opposite) {
      await removePolicy(opposite.id, { silent: true });
    }

    if (effect === "ALLOW") {
      await allowUser(member.userId, member.fullName);
    } else {
      await blockUser(member.userId, member.fullName);
    }
  };

  const handleAddWorkspace = async (effect: PolicyEffect) => {
    const targetMembers = policyMembers.filter(
      (member) => !findUserPolicy(member.userId, effect),
    );

    if (targetMembers.length === 0) {
      toast.info(
        effect === "ALLOW"
          ? "All eligible members are already allowed."
          : "All eligible members are already blocked.",
      );
      return;
    }

    setBulkAction({ effect, mode: "add" });
    try {
      for (const member of targetMembers) {
        const opposite = findUserPolicy(
          member.userId,
          effect === "ALLOW" ? "DENY" : "ALLOW",
        );
        if (opposite) {
          await removePolicy(opposite.id, { silent: true });
        }

        if (effect === "ALLOW") {
          await allowUser(member.userId, member.fullName, { silent: true });
        } else {
          await blockUser(member.userId, member.fullName, { silent: true });
        }
      }

      toast.success(
        effect === "ALLOW"
          ? `Allowed ${targetMembers.length} eligible members.`
          : `Blocked ${targetMembers.length} eligible members.`,
      );
    } finally {
      setBulkAction(null);
    }
  };

  const handleClearWorkspace = async (effect: PolicyEffect) => {
    const targetPolicies = userPolicies.filter(
      (policy) =>
        policy.effect === effect &&
        Boolean(policy.subjectId && policyMemberIds.has(policy.subjectId)),
    );

    if (targetPolicies.length === 0) {
      toast.info(
        effect === "ALLOW"
          ? "No explicit allowed members to clear."
          : "No explicit blocked members to clear.",
      );
      return;
    }

    setBulkAction({ effect, mode: "clear" });
    try {
      for (const policy of targetPolicies) {
        await removePolicy(policy.id, { silent: true });
      }

      toast.success(
        effect === "ALLOW"
          ? `Cleared ${targetPolicies.length} allowed rules.`
          : `Cleared ${targetPolicies.length} blocked rules.`,
      );
    } finally {
      setBulkAction(null);
    }
  };

  return (
    <Card className="flex h-full min-h-0 flex-col gap-0 overflow-hidden border-hairline bg-surface-1 p-0 shadow-sm">
      <div className="flex h-12 shrink-0 items-center border-b border-hairline/60 px-5">
        <h2 className="text-sm font-semibold">Access Policies & Rules</h2>
      </div>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-4 p-4">
        {canManagePolicies ? (
          <>
            <div className="flex shrink-0 items-center justify-between rounded-lg border border-hairline bg-surface-2 p-3">
              <div className="flex flex-col gap-0.5 pr-3">
                <span className="text-xs font-semibold">
                  External Member Access
                </span>
                <span className="text-[10px] leading-tight text-ink-muted">
                  Allow guest/external members to view this document
                </span>
              </div>
              <button
                type="button"
                aria-pressed={isExternalAllowed}
                disabled={isSubmitting}
                onClick={() => void toggleExternalAccess(!isExternalAllowed)}
                className={`flex h-6 w-11 items-center rounded-full border border-border/70 p-0.5 transition-colors disabled:opacity-50 ${
                  isExternalAllowed ? "bg-foreground" : "bg-surface-3"
                }`}
              >
                <span
                  className={`h-4.5 w-4.5 rounded-full bg-background transition-transform ${
                    isExternalAllowed ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
              <PolicyMemberPicker
                title="Allowed Users List"
                count={allowedCount}
                emptyLabel="Inherited workspace access only"
                searchValue={allowedSearch}
                onSearchChange={setAllowedSearch}
                membersList={policyMembers}
                policiesList={userPolicies}
                effect="ALLOW"
                isSubmitting={isSubmitting || bulkAction !== null}
                addLoading={
                  bulkAction?.effect === "ALLOW" && bulkAction.mode === "add"
                }
                clearLoading={
                  bulkAction?.effect === "ALLOW" && bulkAction.mode === "clear"
                }
                onToggleMember={handleToggleMember}
                onAddWorkspace={handleAddWorkspace}
                onClearWorkspace={handleClearWorkspace}
              />

              <PolicyMemberPicker
                title="Blocked Users List"
                count={blockedCount}
                emptyLabel="No blocks active"
                searchValue={blockedSearch}
                onSearchChange={setBlockedSearch}
                membersList={policyMembers}
                policiesList={userPolicies}
                effect="DENY"
                isSubmitting={isSubmitting || bulkAction !== null}
                addLoading={
                  bulkAction?.effect === "DENY" && bulkAction.mode === "add"
                }
                clearLoading={
                  bulkAction?.effect === "DENY" && bulkAction.mode === "clear"
                }
                onToggleMember={handleToggleMember}
                onAddWorkspace={handleAddWorkspace}
                onClearWorkspace={handleClearWorkspace}
              />
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-hairline p-4 text-center">
            <Lock className="h-5 w-5 text-ink-muted" />
            <span className="text-xs font-semibold text-ink-muted">
              Configuration locked
            </span>
            <p className="text-[10px] leading-relaxed text-ink-muted">
              Access overrides can only be set by Workspace Owners or Admins.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PolicyMemberPicker({
  title,
  count,
  emptyLabel,
  searchValue,
  onSearchChange,
  membersList,
  policiesList,
  effect,
  isSubmitting,
  addLoading,
  clearLoading,
  onToggleMember,
  onAddWorkspace,
  onClearWorkspace,
}: {
  title: string;
  count: number;
  emptyLabel: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  membersList: WorkspaceMemberItem[];
  policiesList: PolicyItem[];
  effect: PolicyEffect;
  isSubmitting: boolean;
  addLoading: boolean;
  clearLoading: boolean;
  onToggleMember: (
    member: WorkspaceMemberItem,
    effect: PolicyEffect,
  ) => Promise<void>;
  onAddWorkspace: (effect: PolicyEffect) => Promise<void>;
  onClearWorkspace: (effect: PolicyEffect) => Promise<void>;
}) {
  const normalizedSearch = searchValue.trim().toLowerCase();
  const filteredMembers = membersList.filter((member) => {
    if (!normalizedSearch) return true;
    return [member.fullName, member.email, member.roleName, member.membershipType]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(normalizedSearch));
  });

  const selectedPolicyIds = new Set(
    policiesList
      .filter((policy) => policy.effect === effect)
      .map((policy) => policy.subjectId),
  );

  return (
    <section className="flex min-h-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-xs font-semibold text-ink">{title}</h3>
          <p className="text-[10px] text-ink-muted">
            {count > 0 ? `${count} explicit rules` : emptyLabel}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => void onAddWorkspace(effect)}
            disabled={isSubmitting}
            className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-border/70 px-2.5 text-[11px] font-medium text-ink-muted transition hover:bg-surface-2 hover:text-ink disabled:opacity-50"
          >
            <Users size={12} weight="bold" />
            {addLoading ? "Applying..." : "Add workspace"}
          </button>
          <button
            type="button"
            onClick={() => void onClearWorkspace(effect)}
            disabled={isSubmitting || count === 0}
            aria-label={`Clear all ${title}`}
            title={`Clear all ${title}`}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/70 text-ink-muted transition hover:bg-surface-2 hover:text-ink disabled:opacity-40"
          >
            <X size={12} weight="bold" />
            <span className="sr-only">
              {clearLoading ? "Clearing" : `Clear all ${title}`}
            </span>
          </button>
        </div>
      </div>

      <div className="flex h-8 items-center gap-2 rounded-lg border border-hairline bg-surface-2 px-2.5">
        <MagnifyingGlass size={13} className="shrink-0 text-ink-muted" />
        <input
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search name, email, or role"
          className="h-full min-w-0 flex-1 bg-transparent text-xs text-ink outline-none placeholder:text-ink-muted"
        />
        {searchValue ? (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            className="text-ink-muted transition hover:text-ink"
            aria-label={`Clear ${title} search`}
          >
            <X size={12} weight="bold" />
          </button>
        ) : null}
      </div>

      <div className="max-h-[260px] overflow-y-auto rounded-lg border border-hairline bg-surface-1">
        {filteredMembers.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-ink-muted">
            No eligible members match this search.
          </div>
        ) : (
          filteredMembers.map((member) => {
            const selected = selectedPolicyIds.has(member.userId);
            const isExternal =
              member.membershipType?.toLowerCase() === "external";
            const roleLabel = isExternal
              ? "External"
              : member.roleName || "Member";

            return (
              <button
                key={member.userId}
                type="button"
                disabled={isSubmitting}
                onClick={() => void onToggleMember(member, effect)}
                className={`flex w-full items-center justify-between gap-3 border-b border-hairline/60 px-3 py-2 text-left text-xs transition last:border-b-0 disabled:opacity-50 ${
                  selected
                    ? "bg-surface-2 text-ink"
                    : "text-ink-muted hover:bg-surface-2 hover:text-ink"
                }`}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-semibold">
                    {member.fullName || member.email}
                  </span>
                  <span className="truncate text-[10px] text-ink-muted">
                    {member.email}
                    {member.email ? " / " : ""}
                    {roleLabel}
                  </span>
                </span>
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border/70">
                  {selected ? <Check size={12} weight="bold" /> : null}
                </span>
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}
