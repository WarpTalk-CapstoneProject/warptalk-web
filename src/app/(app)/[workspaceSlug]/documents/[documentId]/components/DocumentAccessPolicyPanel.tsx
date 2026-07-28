"use client";

import { Plus, Check, X, Lock } from "@phosphor-icons/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

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
  showAllowedDropdown: boolean;
  showBlockedDropdown: boolean;
  setShowAllowedDropdown: (show: boolean) => void;
  setShowBlockedDropdown: (show: boolean) => void;
  toggleExternalAccess: (checked: boolean) => Promise<void>;
  allowUser: (userId: string, userName: string) => Promise<void>;
  blockUser: (userId: string, userName: string) => Promise<void>;
  removePolicy: (policyId: string) => Promise<void>;
}

export function DocumentAccessPolicyPanel({
  canManagePolicies,
  isExternalAllowed,
  isSubmitting,
  policiesList,
  membersList,
  showAllowedDropdown,
  showBlockedDropdown,
  setShowAllowedDropdown,
  setShowBlockedDropdown,
  toggleExternalAccess,
  allowUser,
  blockUser,
  removePolicy,
}: DocumentAccessPolicyPanelProps) {
  return (
    <Card className="border-hairline bg-surface-1 shadow-sm">
      <CardHeader className="border-b border-hairline px-5 py-4">
        <CardTitle className="text-sm font-semibold">Access Policies & Rules</CardTitle>
      </CardHeader>
      <CardContent className="p-4 flex flex-col gap-4">
        {canManagePolicies ? (
          <>
            {/* External Access Toggle */}
            <div className="flex items-center justify-between bg-surface-2 border border-hairline rounded-lg p-3">
              <div className="flex flex-col gap-0.5 pr-2">
                <span className="text-xs font-semibold">External Users Access</span>
                <span className="text-[9px] text-ink-muted leading-tight">
                  Allow guest/external members to view this document
                </span>
              </div>
              <Switch
                checked={isExternalAllowed}
                disabled={isSubmitting}
                onCheckedChange={(checked: boolean) => void toggleExternalAccess(checked)}
              />
            </div>

            {/* Allowed Users Dropdown */}
            <div className="flex flex-col gap-1.5 relative">
              <label className="text-xs font-semibold text-ink-muted">Allowed Users List</label>
              <div className="flex flex-wrap gap-1 border border-hairline rounded-md bg-surface-2 p-1.5 min-h-9 items-center">
                {policiesList.filter((p) => p.subjectType === "User" && p.effect === "ALLOW").length === 0 ? (
                  <span className="text-[10px] text-ink-muted pl-1">Inherited only</span>
                ) : (
                  policiesList
                    .filter((p) => p.subjectType === "User" && p.effect === "ALLOW")
                    .map((p) => {
                      const m = membersList.find((member) => member.userId === p.subjectId);
                      return (
                        <Badge key={p.id} className="bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 gap-1 px-1.5 py-0.5 rounded text-[9px]">
                          <span>{m ? m.fullName : "User"}</span>
                          <X className="h-2.5 w-2.5 cursor-pointer hover:text-destructive" onClick={() => removePolicy(p.id)} />
                        </Badge>
                      );
                    })
                )}
                <button
                  onClick={() => {
                    setShowAllowedDropdown(!showAllowedDropdown);
                    setShowBlockedDropdown(false);
                  }}
                  className="ml-auto inline-flex h-5 w-5 items-center justify-center rounded border border-hairline text-ink-muted hover:bg-surface-3 transition cursor-pointer"
                  title="Add Allowed User"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>

              {showAllowedDropdown && (
                <div className="absolute right-0 top-full mt-1.5 w-full bg-surface-1 border border-hairline rounded-lg shadow-lg max-h-48 overflow-y-auto z-50 divide-y divide-hairline">
                  {membersList.length === 0 ? (
                    <div className="p-3 text-center text-xs text-ink-muted">No members found</div>
                  ) : (
                    membersList.map((m) => {
                      const isAllowed = policiesList.some(
                        (p) => p.subjectType === "User" && p.subjectId === m.userId && p.effect === "ALLOW"
                      );
                      const isExternal = m.membershipType?.toLowerCase() === "external";
                      const roleOrLabel = isExternal ? "External" : m.roleName || "Member";
                      return (
                        <div
                          key={m.userId}
                          onClick={() => allowUser(m.userId, m.fullName)}
                          className="flex items-center justify-between px-3 py-2 text-xs hover:bg-surface-2 cursor-pointer transition-colors"
                        >
                          <div className="flex flex-col min-w-0">
                            <span className="font-semibold text-ink truncate">{m.fullName}</span>
                            <div className="flex items-center gap-1.5 text-[9px] text-ink-muted truncate">
                              <span className="truncate">{m.email}</span>
                              {m.email && <span>•</span>}
                              <span className={isExternal ? "text-amber-600 font-semibold" : "font-medium"}>
                                {roleOrLabel}
                              </span>
                            </div>
                          </div>
                          {isAllowed && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* Blocked Users Dropdown */}
            <div className="flex flex-col gap-1.5 relative mt-1.5">
              <label className="text-xs font-semibold text-ink-muted">Blocked Users List</label>
              <div className="flex flex-wrap gap-1 border border-hairline rounded-md bg-surface-2 p-1.5 min-h-9 items-center">
                {policiesList.filter((p) => p.subjectType === "User" && p.effect === "DENY").length === 0 ? (
                  <span className="text-[10px] text-ink-muted pl-1">No blocks active</span>
                ) : (
                  policiesList
                    .filter((p) => p.subjectType === "User" && p.effect === "DENY")
                    .map((p) => {
                      const m = membersList.find((member) => member.userId === p.subjectId);
                      return (
                        <Badge key={p.id} className="bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/20 gap-1 px-1.5 py-0.5 rounded text-[9px]">
                          <span>{m ? m.fullName : "User"}</span>
                          <X className="h-2.5 w-2.5 cursor-pointer hover:text-destructive" onClick={() => removePolicy(p.id)} />
                        </Badge>
                      );
                    })
                )}
                <button
                  onClick={() => {
                    setShowBlockedDropdown(!showBlockedDropdown);
                    setShowAllowedDropdown(false);
                  }}
                  className="ml-auto inline-flex h-5 w-5 items-center justify-center rounded border border-hairline text-ink-muted hover:bg-surface-3 transition cursor-pointer"
                  title="Add Blocked User"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>

              {showBlockedDropdown && (
                <div className="absolute right-0 top-full mt-1.5 w-full bg-surface-1 border border-hairline rounded-lg shadow-lg max-h-48 overflow-y-auto z-50 divide-y divide-hairline">
                  {membersList.length === 0 ? (
                    <div className="p-3 text-center text-xs text-ink-muted">No members found</div>
                  ) : (
                    membersList.map((m) => {
                      const isBlocked = policiesList.some(
                        (p) => p.subjectType === "User" && p.subjectId === m.userId && p.effect === "DENY"
                      );
                      const isExternal = m.membershipType?.toLowerCase() === "external";
                      const roleOrLabel = isExternal ? "External" : m.roleName || "Member";
                      return (
                        <div
                          key={m.userId}
                          onClick={() => blockUser(m.userId, m.fullName)}
                          className="flex items-center justify-between px-3 py-2 text-xs hover:bg-surface-2 cursor-pointer transition-colors"
                        >
                          <div className="flex flex-col min-w-0">
                            <span className="font-semibold text-ink truncate">{m.fullName}</span>
                            <div className="flex items-center gap-1.5 text-[9px] text-ink-muted truncate">
                              <span className="truncate">{m.email}</span>
                              {m.email && <span>•</span>}
                              <span className={isExternal ? "text-amber-600 font-semibold" : "font-medium"}>
                                {roleOrLabel}
                              </span>
                            </div>
                          </div>
                          {isBlocked && <Check className="h-3.5 w-3.5 text-destructive shrink-0" />}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center p-4 text-center gap-2 border border-dashed border-hairline rounded-lg">
            <Lock className="h-5 w-5 text-ink-muted" />
            <span className="text-xs font-semibold text-ink-muted">Configuration locked</span>
            <p className="text-[9px] text-ink-muted leading-relaxed">
              Access overrides can only be set by Workspace Owners or Admins.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
