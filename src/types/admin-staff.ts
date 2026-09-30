/**
 * Platform staff, roles and permissions (G10) — the auth service's /api/v1/admin/staff contract.
 * Mirrors WarpTalk.AuthService.Application.DTOs.Admin.StaffDtos.
 */

export type StaffStatus = "active" | "suspended";
export type StaffSource = "migrated" | "invited" | "invitation_accepted" | "legacy_bridge";
export type StaffInvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export interface StaffMemberDto {
  userId: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  roleId: string;
  roleSlug: string;
  roleName: string;
  isSuperAdmin: boolean;
  status: StaffStatus;
  statusReason: string | null;
  statusChangedAt: string | null;
  source: StaffSource;
  invitedBy: string | null;
  createdAt: string;
  /** Last admin request that reached the auth service's access check (written at most every 5 minutes). */
  lastActiveAt: string | null;
  lastSignInAt: string | null;
  /** False when the account itself is deactivated: such a member has no access. */
  accountActive: boolean;
}

export interface StaffDirectoryQuery {
  q?: string;
  /** Role slugs, comma-separated. */
  role?: string;
  status?: StaffStatus | "all";
  lastActive?: "7d" | "30d" | "90d" | "never" | "inactive30d";
  sort?: "name" | "email" | "role" | "status" | "lastActive" | "lastSignIn" | "created";
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export interface StaffDirectoryPage {
  items: StaffMemberDto[];
  total: number;
  page: number;
  pageSize: number;
  statusCounts: Record<string, number>;
}

export interface StaffInvitationDto {
  id: string;
  email: string;
  roleId: string;
  roleName: string;
  status: StaffInvitationStatus;
  invitedBy: string;
  note: string | null;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  revokeReason: string | null;
}

export interface InviteStaffResult {
  /** granted: the address already had an account. invited: it did not, and will on first verified sign-in. */
  outcome: "granted" | "invited";
  member: StaffMemberDto | null;
  invitation: StaffInvitationDto | null;
  emailSent: boolean;
}

export interface StaffRoleDto {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isBuiltIn: boolean;
  isSuperAdmin: boolean;
  /** Effective codes: the whole catalog for Super Admin. */
  permissions: string[];
  memberCount: number;
  pendingInvitationCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface StaffRoleRefDto {
  id: string;
  slug: string;
  name: string;
  isBuiltIn: boolean;
}

export interface StaffPermissionDto {
  code: string;
  area: string;
  description: string;
  isRead: boolean;
  roleCount: number;
  memberCount: number;
}

export interface StaffPermissionCatalogDto {
  areas: string[];
  permissions: StaffPermissionDto[];
}

export interface PermissionHoldersDto {
  permission: StaffPermissionDto;
  roles: StaffRoleRefDto[];
  members: StaffMemberDto[];
}

export interface SaveStaffRoleRequest {
  name: string;
  description?: string | null;
  permissions: string[];
  reason?: string | null;
}
