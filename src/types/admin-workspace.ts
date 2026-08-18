/**
 * Contracts for the system-admin workspace directory (WT-204 / WT-213).
 *
 * These mirror `~/api/v1/admin/workspaces` in the Workspace service. They are deliberately
 * separate from `@/types/workspace`, whose DTOs are member-scoped and carry the caller's own
 * role — a system admin reads these workspaces without being a member of any of them.
 */

/**
 * Derived from the persisted workspace record: `deleted` when soft-deleted, otherwise
 * `active`/`suspended` by the is_active flag. There is no `trial` state here — plan and trial
 * status live in the billing subscription, which the admin analytics API (WT-206) exposes.
 */
export type AdminWorkspaceStatus = "active" | "suspended" | "deleted";

export type AdminWorkspaceStatusFilter = "all" | AdminWorkspaceStatus;

export type AdminWorkspaceSort =
  | "created_desc"
  | "created_asc"
  | "name_asc"
  | "name_desc"
  | "members_desc"
  | "members_asc"
  | "updated_desc";

export interface AdminWorkspaceOwnerDto {
  id: string;
  fullName: string | null;
  email: string | null;
  avatarUrl: string | null;
  /** False when the Auth service could not resolve the owner; render a degraded cell. */
  resolved: boolean;
}

export interface AdminWorkspaceSummaryDto {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  status: AdminWorkspaceStatus;
  owner: AdminWorkspaceOwnerDto;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
}

export interface AdminWorkspaceLifecycleEventDto {
  id: string;
  action: "suspend" | "reactivate" | "delete";
  reason: string;
  performedBy: string;
  performedAt: string;
}

/**
 * One roster row: who is in the workspace and in what capacity. Operational facts only —
 * the tenant's content (documents, knowledge, meetings) is never exposed to this portal.
 */
export interface AdminWorkspaceMemberDto {
  userId: string;
  fullName: string | null;
  email: string | null;
  avatarUrl: string | null;
  /** False when the Auth service could not resolve the account; render a degraded cell. */
  resolved: boolean;
  role: string;
  membershipType: string;
  status: string;
  canCreateMeetings: boolean;
  joinedAt: string;
}

export interface AdminWorkspaceDetailDto {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  status: AdminWorkspaceStatus;
  owner: AdminWorkspaceOwnerDto;
  memberCount: number;
  internalMemberCount: number;
  externalMemberCount: number;
  pendingInvitationCount: number;
  documentCount: number;
  verifiedDomainCount: number;
  allowExternalCollaboration: boolean;
  requireVerifiedDomainForInternal: boolean;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
  deletedAt: string | null;
  /** Present only while the workspace is currently suspended. */
  currentSuspension: AdminWorkspaceLifecycleEventDto | null;
  lifecycleHistory: AdminWorkspaceLifecycleEventDto[];
}

export interface AdminWorkspaceDirectoryQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: AdminWorkspaceStatusFilter;
  minMembers?: number;
  maxMembers?: number;
  sort?: AdminWorkspaceSort;
}

export interface AdminPagedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface AdminWorkspaceLifecycleRequest {
  reason: string;
}
