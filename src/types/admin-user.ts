/**
 * Contracts for the system-admin user directory.
 *
 * These mirror `~/api/v1/admin/users` in the Auth service. Deliberately separate from
 * `@/types/workspace`, whose member DTOs describe somebody's place in ONE workspace — a platform
 * admin reads these accounts without sharing a workspace with any of them.
 */

/**
 * Derived server-side from five columns, not stored. The precedence is fixed and matters:
 * `deleted` beats `locked` beats `deactivated` beats `unverified` beats `active`.
 *
 * `locked` is a failed-login lockout, which clears itself when the window passes.
 * `deactivated` is somebody's decision and does not.
 */
export type AdminUserStatus =
  | "active"
  | "locked"
  | "unverified"
  | "deactivated"
  | "deleted";

export type AdminUserStatusFilter = "all" | AdminUserStatus;

export type AdminUserSort =
  | "created_desc"
  | "created_asc"
  | "name_asc"
  | "name_desc"
  | "last_login_desc"
  | "last_login_asc";

export interface AdminUserSummaryDto {
  id: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  status: AdminUserStatus;
  /** Platform roles only, with revoked assignments already removed. */
  roles: string[];
  /** Sessions live right now — neither revoked nor expired. */
  activeSessionCount: number;
  lastLoginAt: string | null;
  createdAt: string;
  deletedAt: string | null;
}

/**
 * One session. Never carries the token or its hash: an administrator needs to know a session
 * exists, not to be able to use it.
 */
export interface AdminUserSessionDto {
  id: string;
  deviceInfo: string | null;
  ipAddress: string | null;
  createdAt: string;
  expiresAt: string;
}

/**
 * Workspace membership is deliberately absent. It lives in another service, and resolving it here
 * would put auth behind a gRPC call for a screen that must still work when workspace is down.
 */
export interface AdminUserDetailDto {
  user: AdminUserSummaryDto;
  /** True while a failed-login lockout window is still running. */
  isLockedOut: boolean;
  lockedUntil: string | null;
  emailVerified: boolean;
  isActive: boolean;
  activeSessions: AdminUserSessionDto[];
}

export interface AdminUserDirectoryQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: AdminUserStatusFilter;
  role?: string;
  sort?: AdminUserSort;
}
