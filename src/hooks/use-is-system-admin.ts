import { useAuthStore } from "@/stores/auth-store";

/**
 * Whether the current user holds the platform-wide "admin" system role (auth.roles, seeded in
 * init-db.sql, distinct from the workspace-scoped Owner/Admin/Member roles `useWorkspaceRole`
 * mocks by email). `UserDto.roles` comes straight from the JWT's ClaimTypes.Role claims via
 * AuthResponseHelper/UserMapper — real data, not a mock — so no separate `/auth/me` call is
 * needed. Gates access to ~/api/v1/admin/* endpoints (global glossary, notifications) in the UI.
 */
export function useIsSystemAdmin(): boolean {
  const user = useAuthStore((state) => state.user);
  return user?.roles?.includes("admin") ?? false;
}
