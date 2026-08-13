import type { WorkspaceDto } from "@/types/workspace";

type WorkspaceMembershipFields = Pick<WorkspaceDto, "membershipType">;

export function normalizeWorkspaceMembershipType(
  membershipType: string | null | undefined,
) {
  return (membershipType ?? "Internal").trim().toLowerCase();
}

export function isInternalWorkspaceMembership(
  workspace: WorkspaceMembershipFields,
) {
  return normalizeWorkspaceMembershipType(workspace.membershipType) === "internal";
}

export function getPrimaryInternalWorkspace<T extends WorkspaceMembershipFields>(
  workspaces: readonly T[],
) {
  return workspaces.find(isInternalWorkspaceMembership) ?? null;
}
