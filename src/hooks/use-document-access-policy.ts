import { useState } from "react";
import { toast } from "sonner";
import {
  isExternalViewPolicy,
  isUserPolicy,
  type DocumentPermission,
} from "@/lib/workspace/document-access-policy";
import type { WorkspaceDocumentAccessPolicyDto, WorkspaceMemberDto } from "@/types/workspace";
import {
  useWorkspaceDocumentAccessPolicies,
  useAddWorkspaceDocumentAccessPolicy,
  useRemoveWorkspaceDocumentAccessPolicy,
  useWorkspaceMembers,
} from "./use-workspace";

export interface DocumentAccessPolicyHookReturn {
  policiesList: WorkspaceDocumentAccessPolicyDto[];
  membersList: WorkspaceMemberDto[];
  isExternalAllowed: boolean;
  isLoading: boolean;
  isSubmitting: boolean;
  toggleExternalAccess: (checked: boolean) => Promise<void>;
  allowUser: (userId: string, userName?: string, permission?: DocumentPermission) => Promise<void>;
  blockUser: (userId: string, userName?: string, permission?: DocumentPermission) => Promise<void>;
  removePolicy: (policyId: string) => Promise<void>;
}

function errorMessage(err: unknown, fallback: string): string {
  return (
    (err as { response?: { data?: { error?: string } } })?.response?.data?.error || fallback
  );
}

export function useDocumentAccessPolicy(
  workspaceId: string,
  documentId: string
): DocumentAccessPolicyHookReturn {

  // Queries
  const policiesQuery = useWorkspaceDocumentAccessPolicies(workspaceId, documentId, 1, 100);
  const membersQuery = useWorkspaceMembers(workspaceId, 1, 100);

  // Mutations
  const addPolicyMutation = useAddWorkspaceDocumentAccessPolicy(workspaceId, documentId);
  const removePolicyMutation = useRemoveWorkspaceDocumentAccessPolicy(workspaceId, documentId);

  const policiesList: WorkspaceDocumentAccessPolicyDto[] = policiesQuery.data?.items || [];
  const membersList: WorkspaceMemberDto[] = membersQuery.data?.items || [];

  const serverExternalAllowed = policiesList.some(isExternalViewPolicy);
  const [pendingExternalAccess, setPendingExternalAccess] = useState<boolean | null>(null);
  const isExternalAllowed = pendingExternalAccess ?? serverExternalAllowed;

  const toggleExternalAccess = async (checked: boolean) => {
    if (checked === serverExternalAllowed && pendingExternalAccess === null) return;

    const extPolicy = policiesList.find(isExternalViewPolicy);
    setPendingExternalAccess(checked);

    if (checked) {
      try {
        await addPolicyMutation.mutateAsync({
          subjectType: "MembershipType",
          subjectKey: "External",
          subjectId: null,
          permission: "view",
          effect: "ALLOW",
        });
        setPendingExternalAccess(null);
        toast.success("External member access enabled.");
      } catch (err: unknown) {
        setPendingExternalAccess(null);
        toast.error(errorMessage(err, "Failed to enable external access."));
      }
    } else if (extPolicy) {
      try {
        await removePolicyMutation.mutateAsync(extPolicy.id);
        setPendingExternalAccess(null);
        toast.success("External member access disabled.");
      } catch (err: unknown) {
        setPendingExternalAccess(null);
        toast.error(errorMessage(err, "Failed to disable external access."));
      }
    } else {
      setPendingExternalAccess(null);
    }
  };

  const removePolicy = async (policyId: string) => {
    try {
      await removePolicyMutation.mutateAsync(policyId);
      toast.success("Access policy rule removed.");
    } catch (err: unknown) {
      toast.error(errorMessage(err, "Failed to remove policy rule."));
    }
  };

  /**
   * Add a rule for one user, or take it away again if the same one is already there.
   *
   * TWO THINGS THIS DOES THAT THE OLD PAIR OF FUNCTIONS DID NOT
   *
   *   It asks WHICH permission. Both callers used to hardcode `View`, so `download` and
   *   `ai_retrieval` — which the server has implemented all along — were unreachable from any
   *   screen. Defaulted to `view` so nothing that has not been updated changes behaviour.
   *
   *   It clears the opposite effect first. The server refuses a second policy for the same
   *   (subject, permission) pair with a 409 and the message "A policy already exists for this
   *   subject and permission. Remove it before changing the effect." So blocking somebody who was
   *   explicitly allowed used to fail outright, and the toast said so in the server's words while
   *   the panel still showed them in the Allowed list. Flipping a person from one list to the
   *   other is the ordinary thing to want here, so it is done in one gesture.
   */
  const writeUserPolicy = async (
    userId: string,
    userName: string | undefined,
    permission: DocumentPermission,
    effect: "ALLOW" | "DENY",
  ) => {
    const same = policiesList.find(
      (p) =>
        p.subjectId === userId &&
        isUserPolicy(p, permission, effect === "ALLOW" ? "allow" : "deny"),
    );
    if (same) {
      await removePolicy(same.id);
      return;
    }

    const opposite = policiesList.find(
      (p) =>
        p.subjectId === userId &&
        isUserPolicy(p, permission, effect === "ALLOW" ? "deny" : "allow"),
    );

    try {
      if (opposite) {
        await removePolicyMutation.mutateAsync(opposite.id);
      }
      await addPolicyMutation.mutateAsync({
        subjectType: "User",
        subjectId: userId,
        subjectKey: null,
        permission,
        effect,
      });
      toast.success(
        effect === "ALLOW"
          ? `Allowed access for ${userName || "user"}.`
          : `Blocked access for ${userName || "user"}.`,
      );
    } catch (err: unknown) {
      toast.error(
        errorMessage(
          err,
          effect === "ALLOW"
            ? "Failed to allow user access."
            : "Failed to block user access.",
        ),
      );
    }
  };

  const allowUser = (
    userId: string,
    userName?: string,
    permission: DocumentPermission = "view",
  ) => writeUserPolicy(userId, userName, permission, "ALLOW");

  const blockUser = (
    userId: string,
    userName?: string,
    permission: DocumentPermission = "view",
  ) => writeUserPolicy(userId, userName, permission, "DENY");

  const isSubmitting = addPolicyMutation.isPending || removePolicyMutation.isPending;
  const isLoading = policiesQuery.isLoading || membersQuery.isLoading;

  return {
    policiesList,
    membersList,
    isExternalAllowed,
    isLoading,
    isSubmitting,
    toggleExternalAccess,
    allowUser,
    blockUser,
    removePolicy,
  };
}
