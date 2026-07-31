import { useWorkspaceStore } from "@/stores/workspace-store";

export type WorkspaceRole = "owner" | "admin" | "member";

/**
 * Custom hook to get the current user's role in the active workspace.
 * Always normalizes the role string to lowercase ("owner" | "admin" | "member").
 */
export function useWorkspaceRole(): WorkspaceRole {
  const role = useWorkspaceStore((state) => state.role);
  if (!role) return "member";
  const lower = role.toLowerCase();
  if (lower === "owner" || lower === "admin") {
    return lower as WorkspaceRole;
  }
  return "member";
}
