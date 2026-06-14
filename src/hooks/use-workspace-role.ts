import { useAuthStore } from "@/stores/auth-store";

export type WorkspaceRole = "admin" | "owner" | "member";

/**
 * Custom hook to get the current user's role in the active workspace.
 * Currently uses email-based mocking for testing the 3 roles since the
 * backend getWorkspaceMembers doesn't expose roleName fully yet.
 */
export function useWorkspaceRole(): WorkspaceRole {
  const user = useAuthStore((state) => state.user);

  if (!user) return "member";

  // Check roles or emails for demonstration/testing
  if (user.roles?.includes("admin") || user.email.includes("admin")) {
    return "admin";
  }
  
  if (user.roles?.includes("owner") || user.email.includes("owner")) {
    return "owner";
  }

  return "member";
}
