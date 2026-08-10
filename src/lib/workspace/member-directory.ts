import type { WorkspaceInvitationDto, WorkspaceMemberDto } from "@/types/workspace";

/**
 * One list for everyone connected to a workspace, whatever stage they are at.
 *
 * Members and invitations used to live on two pages, and the Invitations page was itself
 * duplicated under two routes. Somebody invited yesterday was invisible on Members, so the
 * only way to answer "did I already invite them?" was to remember which page to open. They
 * are the same question, so they are now one table with a status column.
 *
 * Everything here is a pure function of the three server lists, so the merge rules can be
 * tested without a workspace. The node test runner strips types but cannot parse JSX, which
 * is why this is a `.ts` and not part of the page.
 */

/** Where somebody is in the journey. Ordered as the table shows them. */
export type DirectoryStatus = "requested" | "invited" | "joined";

export type DirectoryRow = {
  /** Stable React key. Member ids and invitation ids come from different tables. */
  key: string;
  status: DirectoryStatus;
  name: string;
  email: string;
  roleName: string;
  membershipType: string;
  /** Joined date, invite date, or request date — whichever applies to this status. */
  date: string | null;
  /** The underlying record, for the actions a row offers. Exactly one is set. */
  member: WorkspaceMemberDto | null;
  invitation: WorkspaceInvitationDto | null;
};

/**
 * An invitation only earns a row while it is still waiting on somebody.
 *
 * The server returns the whole history — accepted, rejected, revoked, expired. Showing all of
 * it would bury the four people who actually need attention under every invite ever sent, and
 * an accepted invitation is just a member, who already has a row of their own.
 */
const PENDING_INVITE = "PENDING";
const PENDING_REQUEST = "REQUESTED";

/** An invited person has no display name yet, so their address stands in for one. */
export function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local || email;
}

export function buildMemberDirectory(
  members: readonly WorkspaceMemberDto[],
  invitations: readonly WorkspaceInvitationDto[],
  joinRequests: readonly WorkspaceInvitationDto[],
): DirectoryRow[] {
  const memberEmails = new Set(
    members.map((member) => member.email?.toLowerCase()).filter(Boolean),
  );

  const pending = (
    source: readonly WorkspaceInvitationDto[],
    wanted: string,
    status: DirectoryStatus,
  ): DirectoryRow[] =>
    source
      .filter((invite) => invite.status?.toUpperCase() === wanted)
      // Somebody who has already joined must not appear twice. This happens for real: the
      // invitation row lingers between acceptance and the members list being refetched.
      .filter((invite) => !memberEmails.has(invite.email?.toLowerCase()))
      .map((invite) => ({
        key: `invite:${invite.id}`,
        status,
        name: nameFromEmail(invite.email),
        email: invite.email,
        // A join request has not been granted a role yet; the approver picks it.
        roleName: status === "requested" ? "Member" : invite.roleName,
        membershipType: invite.membershipType,
        date: invite.createdAt ?? null,
        member: null,
        invitation: invite,
      }));

  const joined: DirectoryRow[] = members.map((member) => ({
    key: `member:${member.id}`,
    status: "joined",
    name: member.fullName || nameFromEmail(member.email ?? ""),
    email: member.email,
    roleName: member.roleName,
    membershipType: member.membershipType,
    date: member.joinedAt ?? null,
    member,
    invitation: null,
  }));

  // People waiting on an answer come first — they are the only rows with something to do.
  return [
    ...pending(joinRequests, PENDING_REQUEST, "requested"),
    ...pending(invitations, PENDING_INVITE, "invited"),
    ...joined,
  ];
}

export type DirectoryFilter =
  | "all"
  | "owner"
  | "admin"
  | "member"
  | "invited"
  | "requested";

export function filterMemberDirectory(
  rows: readonly DirectoryRow[],
  filter: DirectoryFilter,
): DirectoryRow[] {
  if (filter === "all") return [...rows];
  if (filter === "invited" || filter === "requested") {
    return rows.filter((row) => row.status === filter);
  }
  // A role filter is a question about the workspace as it stands, so it does not sweep in
  // people who have merely been offered that role.
  return rows.filter(
    (row) => row.status === "joined" && row.roleName?.toLowerCase() === filter,
  );
}

export const DIRECTORY_STATUS_LABELS: Record<DirectoryStatus, string> = {
  requested: "Requested",
  invited: "Invited",
  joined: "Joined",
};

/** What the date column means for a row — the header cannot say "Joined" for all three. */
export const DIRECTORY_DATE_LABELS: Record<DirectoryStatus, string> = {
  requested: "Requested",
  invited: "Invited",
  joined: "Joined",
};
