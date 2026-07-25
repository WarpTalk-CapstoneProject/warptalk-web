import { useState } from "react";
import { toast } from "sonner";
import {
  useWorkspaceDocumentAccessPolicies,
  useAddWorkspaceDocumentAccessPolicy,
  useRemoveWorkspaceDocumentAccessPolicy,
  useWorkspaceMembers,
} from "./use-workspace";

export interface DocumentAccessPolicyHookReturn {
  policiesList: any[];
  membersList: any[];
  isExternalAllowed: boolean;
  isLoading: boolean;
  isSubmitting: boolean;
  showAllowedDropdown: boolean;
  showBlockedDropdown: boolean;
  setShowAllowedDropdown: (show: boolean) => void;
  setShowBlockedDropdown: (show: boolean) => void;
  toggleExternalAccess: (checked: boolean) => Promise<void>;
  allowUser: (userId: string, userName?: string) => Promise<void>;
  blockUser: (userId: string, userName?: string) => Promise<void>;
  removePolicy: (policyId: string) => Promise<void>;
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

  const policiesList: any[] = policiesQuery.data?.items || [];
  const membersList: any[] = membersQuery.data?.items || [];

  const isExternalAllowed = policiesList.some(
    (p: any) =>
      p.subjectType === "MembershipType" &&
      p.subjectKey === "External" &&
      p.permission === "View" &&
      p.effect === "ALLOW"
  );

  const toggleExternalAccess = async (checked: boolean) => {
    const extPolicy = policiesList.find(
      (p: any) =>
        p.subjectType === "MembershipType" &&
        p.subjectKey === "External" &&
        p.permission === "View" &&
        p.effect === "ALLOW"
    );

    if (checked) {
      try {
        await addPolicyMutation.mutateAsync({
          subjectType: "MembershipType",
          subjectKey: "External",
          subjectId: null,
          permission: "View",
          effect: "ALLOW",
        });
        toast.success("External member access enabled.");
      } catch (err: unknown) {
        const errorMsg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Failed to enable external access.";
        toast.error(errorMsg);
      }
    } else if (extPolicy) {
      try {
        await removePolicyMutation.mutateAsync(extPolicy.id);
        toast.success("External member access disabled.");
      } catch (err: unknown) {
        const errorMsg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Failed to disable external access.";
        toast.error(errorMsg);
      }
    }
  };

  const removePolicy = async (policyId: string) => {
    try {
      await removePolicyMutation.mutateAsync(policyId);
      toast.success("Access policy rule removed.");
    } catch (err: unknown) {
      const errorMsg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Failed to remove policy rule.";
      toast.error(errorMsg);
    }
  };

  const allowUser = async (userId: string, userName?: string) => {
    const existingPolicy = policiesList.find(
      (p: any) => p.subjectType === "User" && p.subjectId === userId && p.effect === "ALLOW"
    );

    if (existingPolicy) {
      await removePolicy(existingPolicy.id);
    } else {
      try {
        await addPolicyMutation.mutateAsync({
          subjectType: "User",
          subjectId: userId,
          subjectKey: null,
          permission: "View",
          effect: "ALLOW",
        });
        toast.success(`Allowed access for ${userName || "user"}.`);
      } catch (err: unknown) {
        const errorMsg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Failed to allow user access.";
        toast.error(errorMsg);
      }
    }
  };

  const blockUser = async (userId: string, userName?: string) => {
    const existingPolicy = policiesList.find(
      (p: any) => p.subjectType === "User" && p.subjectId === userId && p.effect === "DENY"
    );

    if (existingPolicy) {
      await removePolicy(existingPolicy.id);
    } else {
      try {
        await addPolicyMutation.mutateAsync({
          subjectType: "User",
          subjectId: userId,
          subjectKey: null,
          permission: "View",
          effect: "DENY",
        });
        toast.success(`Blocked access for ${userName || "user"}.`);
      } catch (err: unknown) {
        const errorMsg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Failed to block user access.";
        toast.error(errorMsg);
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
