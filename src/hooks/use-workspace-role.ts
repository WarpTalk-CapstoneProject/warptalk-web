import { useWorkspaceStore } from "@/stores/workspace-store";

export type WorkspaceRole = "Owner" | "Admin" | "Member";

/**
 * Custom hook to get the current user's role in the active workspace.
 * Fetches the role directly from the workspace store, which is synchronized with the database.
 */
export function useWorkspaceRole(): WorkspaceRole {
  const role = useWorkspaceStore((state) => state.role);
  return (role as WorkspaceRole) || "Member";
}
