import type { WorkspaceMemberDto } from "@/types/workspace";

/**
 * Active workspace member directory logic.
 *
 * Invitations and join requests are not members yet. They are queue records backed by
 * WorkspaceInvitation, while this table is backed by WorkspaceMember rows that already have
 * a seat in the workspace. Keeping those concepts apart stops the All tab and exports from
 * reporting pending people as joined members.
 */

export type DirectoryStatus = "joined";

export type DirectoryRow = {
  key: string;
  status: DirectoryStatus;
  name: string;
  email: string;
  roleName: string;
  membershipType: string;
  date: string | null;
  member: WorkspaceMemberDto;
};

export type DirectoryFilter =
  | "all"
  | "admin"
  | "member"
  | "internal"
  | "external"
  | "invitations"
  | "join-requests";

export const DIRECTORY_STATUS_LABELS: Record<DirectoryStatus, string> = {
  joined: "Joined",
};

export const DIRECTORY_DATE_LABELS: Record<DirectoryStatus, string> = {
  joined: "Joined",
};

export function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local || email;
}

export function isActiveWorkspaceMember(member: WorkspaceMemberDto): boolean {
  return member.status?.toLowerCase() === "active";
}

function roleAccessRank(row: Pick<DirectoryRow, "roleName" | "membershipType">): number {
  const role = row.roleName?.toLowerCase();
  const membershipType = row.membershipType?.toLowerCase();

  if (role === "owner") return 0;
  if (role === "admin") return 1;
  if (membershipType === "internal") return 2;
  if (membershipType === "external") return 3;
  return 4;
}

function compareDirectoryRows(a: DirectoryRow, b: DirectoryRow): number {
  const rankDelta = roleAccessRank(a) - roleAccessRank(b);
  if (rankDelta !== 0) return rankDelta;

  const joinedDelta =
    new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime();
  if (joinedDelta !== 0) return joinedDelta;

  return a.name.localeCompare(b.name);
}

export function buildMemberDirectory(
  members: readonly WorkspaceMemberDto[],
): DirectoryRow[] {
  return members
    .filter(isActiveWorkspaceMember)
    .map((member) => ({
      key: `member:${member.id}`,
      status: "joined" as const,
      name: member.fullName || nameFromEmail(member.email ?? ""),
      email: member.email,
      roleName: member.roleName,
      membershipType: member.membershipType,
      date: member.joinedAt ?? null,
      member,
    }))
    .sort(compareDirectoryRows);
}

export function filterMemberDirectory(
  rows: readonly DirectoryRow[],
  filter: DirectoryFilter,
): DirectoryRow[] {
  if (filter === "all") return [...rows];
  if (filter === "internal" || filter === "external") {
    return rows.filter((row) => row.membershipType?.toLowerCase() === filter);
  }
  if (filter === "invitations" || filter === "join-requests") return [];

  return rows.filter((row) => row.roleName?.toLowerCase() === filter);
}

export function groupMemberRowsByMembership(rows: readonly DirectoryRow[]) {
  return {
    internal: rows.filter((row) => row.membershipType?.toLowerCase() === "internal"),
    external: rows.filter((row) => row.membershipType?.toLowerCase() === "external"),
  };
}
