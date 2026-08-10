import { useWorkspaceStore } from "@/stores/workspace-store";
import { normalizeWorkspaceRole, type WorkspaceRole } from "@/lib/workspace/workspace-role";

export type { WorkspaceRole };

/**
 * The current user's role in the active workspace, always in canonical lowercase form
 * ("owner" | "admin" | "member").
 *
 * Prefer this over reading `useWorkspaceStore(s => s.role)` directly: it collapses the
 * "not loaded yet" case to the least-privileged role, so callers never have to think about
 * null. When you *do* need to distinguish "no workspace loaded" from "member", use
 * `useWorkspaceRoleLoaded()`.
 */
export function useWorkspaceRole(): WorkspaceRole {
  const role = useWorkspaceStore((state) => state.role);
  return normalizeWorkspaceRole(role) ?? "member";
}

/** True once the active workspace's role has actually been resolved. */
export function useWorkspaceRoleLoaded(): boolean {
  return useWorkspaceStore((state) => state.role) !== null;
}
