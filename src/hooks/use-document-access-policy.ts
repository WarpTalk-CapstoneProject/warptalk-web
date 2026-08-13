import { useState } from "react";
import { toast } from "sonner";
import { isExternalViewPolicy } from "@/lib/workspace/document-access-policy";
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
  showAllowedDropdown: boolean;
  showBlockedDropdown: boolean;
  setShowAllowedDropdown: (show: boolean) => void;
  setShowBlockedDropdown: (show: boolean) => void;
  toggleExternalAccess: (checked: boolean) => Promise<void>;
  /* These resolve to whether the write actually landed. They used to be Promise<void> and
     swallowed every failure into a toast, so a bulk caller looping over them could report
     "Allowed 200 members" after the 91st request 4xx'd. */
  allowUser: (userId: string, userName?: string, options?: { silent?: boolean }) => Promise<boolean>;
  blockUser: (userId: string, userName?: string, options?: { silent?: boolean }) => Promise<boolean>;
  removePolicy: (policyId: string, options?: { silent?: boolean }) => Promise<boolean>;
}

export function useDocumentAccessPolicy(
  workspaceId: string,
  documentId: string
): DocumentAccessPolicyHookReturn {
  const [showAllowedDropdown, setShowAllowedDropdown] = useState(false);
  const [showBlockedDropdown, setShowBlockedDropdown] = useState(false);

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
          permission: "View",
          effect: "ALLOW",
        });
        setPendingExternalAccess(null);
        toast.success("External member access enabled.");
      } catch (err: unknown) {
        setPendingExternalAccess(null);
        const errorMsg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Failed to enable external access.";
        toast.error(errorMsg);
      }
    } else if (extPolicy) {
      try {
        await removePolicyMutation.mutateAsync(extPolicy.id);
        setPendingExternalAccess(null);
        toast.success("External member access disabled.");
      } catch (err: unknown) {
        setPendingExternalAccess(null);
        const errorMsg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Failed to disable external access.";
        toast.error(errorMsg);
      }
    } else {
      setPendingExternalAccess(null);
    }
  };

  const removePolicy = async (policyId: string, options?: { silent?: boolean }) => {
    try {
      await removePolicyMutation.mutateAsync(policyId);
      if (!options?.silent) {
        toast.success("Access policy rule removed.");
      }
      return true;
    } catch (err: unknown) {
      const errorMsg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Failed to remove policy rule.";
      // A bulk caller reports the tally itself; one toast per failed row would bury the page.
      if (!options?.silent) toast.error(errorMsg);
      return false;
    }
  };

  const allowUser = async (userId: string, userName?: string, options?: { silent?: boolean }) => {
    const existingPolicy = policiesList.find(
      (p) => p.subjectType === "User" && p.subjectId === userId && p.effect === "ALLOW"
    );

    if (existingPolicy) {
      return removePolicy(existingPolicy.id, options);
    } else {
      try {
        await addPolicyMutation.mutateAsync({
          subjectType: "User",
          subjectId: userId,
          subjectKey: null,
          permission: "View",
          effect: "ALLOW",
        });
        if (!options?.silent) {
          toast.success(`Allowed access for ${userName || "user"}.`);
        }
        return true;
      } catch (err: unknown) {
        const errorMsg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Failed to allow user access.";
        if (!options?.silent) toast.error(errorMsg);
        return false;
      }
    }
  };

  const blockUser = async (userId: string, userName?: string, options?: { silent?: boolean }) => {
    const existingPolicy = policiesList.find(
      (p) => p.subjectType === "User" && p.subjectId === userId && p.effect === "DENY"
    );

    if (existingPolicy) {
      return removePolicy(existingPolicy.id, options);
    } else {
      try {
        await addPolicyMutation.mutateAsync({
          subjectType: "User",
          subjectId: userId,
          subjectKey: null,
          permission: "View",
          effect: "DENY",
        });
        if (!options?.silent) {
          toast.success(`Blocked access for ${userName || "user"}.`);
        }
        return true;
      } catch (err: unknown) {
        const errorMsg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Failed to block user access.";
        if (!options?.silent) toast.error(errorMsg);
        return false;
      }
    }
  };

  const isSubmitting = addPolicyMutation.isPending || removePolicyMutation.isPending;
  const isLoading = policiesQuery.isLoading || membersQuery.isLoading;

  return {
    policiesList,
    membersList,
    isExternalAllowed,
    isLoading,
    isSubmitting,
    showAllowedDropdown,
    showBlockedDropdown,
    setShowAllowedDropdown,
    setShowBlockedDropdown,
    toggleExternalAccess,
    allowUser,
    blockUser,
    removePolicy,
  };
}
