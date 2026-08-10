/**
 * The one canonical form of a workspace role on the client.
 *
 * The API sends capitalised role names ("Owner" / "Admin" / "Member" — see
 * WorkspaceMemberRoleExtensions.ToRoleName on the backend). The workspace store has
 * lowercased them on write since 421611e, but the stored value stayed typed as a bare
 * `string`, so three pages kept comparing it to "Owner"/"Admin" and type-checked fine
 * while being unconditionally false on a fresh login. Narrowing the stored value to this
 * union is what makes that class of comparison a compile error instead of a demo failure.
 */
export type WorkspaceRole = "owner" | "admin" | "member";

/**
 * Fold any casing the API (or a stale persisted value) hands us into the canonical form.
 * Unknown role names degrade to the least-privileged role rather than throwing, which is
 * the behaviour `useWorkspaceRole` has always had.
 */
export function normalizeWorkspaceRole(
  role: string | null | undefined,
): WorkspaceRole | null {
  if (!role) return null;
  switch (role.trim().toLowerCase()) {
    case "owner":
      return "owner";
    case "admin":
      return "admin";
    default:
      return "member";
  }
}

/**
 * Case-insensitive check for API-supplied role names (e.g. `WorkspaceMemberDto.roleName`),
 * which are *not* stored in the workspace store and therefore keep their server casing.
 */
export function isWorkspaceRole(
  roleName: string | null | undefined,
  expected: WorkspaceRole,
): boolean {
  return normalizeWorkspaceRole(roleName) === expected;
}
