import type { WorkspaceInvitationDto } from "@/types/workspace";

export const JOIN_REQUEST_SUGGESTED_ACTIONS = {
  enableExternalCollaboration: "EnableExternalCollaboration",
  addVerifiedDomain: "AddVerifiedDomain",
  rejectRequest: "RejectRequest",
} as const;

const KNOWN_MEMBERSHIP_TYPES = new Set(["Internal", "External"]);

export function getAllowedFinalMembershipTypes(invitation: WorkspaceInvitationDto): string[] {
  if (Array.isArray(invitation.allowedFinalMembershipTypes)) {
    return invitation.allowedFinalMembershipTypes.filter((type) => KNOWN_MEMBERSHIP_TYPES.has(type));
  }

  const fallback = normalizeMembershipType(invitation.membershipType);
  return fallback ? [fallback] : [];
}

export function getDefaultApprovalMembershipType(
  invitation: WorkspaceInvitationDto,
  selectedMembershipType?: string
): string | undefined {
  const allowedTypes = getAllowedFinalMembershipTypes(invitation);
  if (selectedMembershipType && allowedTypes.includes(selectedMembershipType)) {
    return selectedMembershipType;
  }

  return allowedTypes[0];
}

export function isJoinRequestApprovalBlocked(invitation: WorkspaceInvitationDto): boolean {
  return Array.isArray(invitation.allowedFinalMembershipTypes)
    && getAllowedFinalMembershipTypes(invitation).length === 0;
}

export function getJoinRequestPolicyMessage(invitation: WorkspaceInvitationDto): string | null {
  if (invitation.policyReason) {
    return invitation.policyReason;
  }

  if (isJoinRequestApprovalBlocked(invitation) || invitation.requiresPolicyAction) {
    return "Workspace policy must be updated before this request can be approved.";
  }

  return null;
}

export function getSuggestedActionLabel(action: string): string | null {
  switch (action) {
    case JOIN_REQUEST_SUGGESTED_ACTIONS.enableExternalCollaboration:
      return "Enable external collaboration";
    case JOIN_REQUEST_SUGGESTED_ACTIONS.addVerifiedDomain:
      return "Add verified domain";
    case JOIN_REQUEST_SUGGESTED_ACTIONS.rejectRequest:
      return "Reject request";
    default:
      return null;
  }
}

function normalizeMembershipType(value?: string | null): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.toLowerCase() === "internal" ? "Internal" : value.toLowerCase() === "external" ? "External" : undefined;
  return normalized;
}
