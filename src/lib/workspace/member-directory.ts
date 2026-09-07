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
export type DirectoryStatus = "requested" | "leaving" | "invited" | "joined";

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
  /**
   * Set only on a member who has asked to leave and is waiting on an answer. They are still a
   * member — `member` stays set — so this is a second record on the row rather than a third
   * kind of row, which is what keeps one person from appearing twice.
   */
  leaveRequest: WorkspaceInvitationDto | null;
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
const PENDING_LEAVE = "LEAVE_REQUESTED";

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

  // A leave request arrives on the same listing as a join request — the server returns both
  // under the join-request kind, because both are somebody asking for something. It is the one
  // request whose sender is already a member, which is exactly why it needs picking out here:
  // the two rules below this both exist to keep members out of the pending lists.
  const liveLeaveRequests = joinRequests.filter(
    (request) => request.status?.toUpperCase() === PENDING_LEAVE,
  );
  const leaveByUserId = new Map(
    liveLeaveRequests
      .filter((request) => request.requestedBy)
      .map((request) => [request.requestedBy as string, request]),
  );
  const leaveByEmail = new Map(
    liveLeaveRequests
      .filter((request) => request.email)
      .map((request) => [request.email.toLowerCase(), request]),
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
        leaveRequest: null,
      }));

  // Which requests found their member on this page. Members arrive ten at a time; the requests
  // are a complete set, so most of them will not match anybody here.
  const claimed = new Set<string>();

  const joined: DirectoryRow[] = members.map((member) => {
    // By user id first: that is the link the server actually stored. The address is a fallback
    // for a request written before `requestedBy` was populated.
    const leaveRequest =
      leaveByUserId.get(member.userId) ??
      leaveByEmail.get(member.email?.toLowerCase() ?? "") ??
      null;
    if (leaveRequest) claimed.add(leaveRequest.id);

    return {
      key: `member:${member.id}`,
      status: leaveRequest ? ("leaving" as const) : ("joined" as const),
      name: member.fullName || nameFromEmail(member.email ?? ""),
      email: member.email,
      roleName: member.roleName,
      membershipType: member.membershipType,
      // For a row an Admin has to answer, when they asked is the useful date; their joining
      // date is on every other row and says nothing about the decision that is waiting.
      date: (leaveRequest ? leaveRequest.createdAt : member.joinedAt) ?? null,
      member,
      invitation: null,
      leaveRequest,
    };
  });

  // A request whose member is not on this page still needs answering, so it gets a row of its
  // own rather than waiting for an Admin to page across to them — otherwise the eleventh member
  // to ask is unanswerable in exactly the way the first ten no longer are.
  //
  // The request carries everything such a row needs, because the server built it from the
  // member: their address, their role and their access type at the moment they asked.
  const unclaimed: DirectoryRow[] = liveLeaveRequests
    .filter((request) => !claimed.has(request.id))
    .map((request) => ({
      key: `leave:${request.id}`,
      status: "leaving" as const,
      name: nameFromEmail(request.email),
      email: request.email,
      roleName: request.roleName,
      membershipType: request.membershipType,
      date: request.createdAt ?? null,
      member: null,
      invitation: null,
      leaveRequest: request,
    }));

  // People waiting on an answer come first — they are the only rows with something to do.
  return [
    ...pending(joinRequests, PENDING_REQUEST, "requested"),
    ...joined.filter((row) => row.status === "leaving"),
    ...unclaimed,
    ...pending(invitations, PENDING_INVITE, "invited"),
    ...joined.filter((row) => row.status !== "leaving"),
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
  if (filter === "invited") return rows.filter((row) => row.status === "invited");
  // Requests is the pill for "somebody is waiting on you", and both kinds are: one asking to
  // get in, one asking to get out. Splitting them into two pills would hide whichever the
  // workspace sees less often.
  if (filter === "requested") {
    return rows.filter((row) => row.status === "requested" || row.status === "leaving");
  }
  // A role filter is a question about the workspace as it stands, so it does not sweep in
  // people who have merely been offered that role — but it does keep someone who has asked to
  // leave, because until an Admin answers they still hold the role.
  return rows.filter(
    (row) => row.member !== null && row.roleName?.toLowerCase() === filter,
  );
}

export const DIRECTORY_STATUS_LABELS: Record<DirectoryStatus, string> = {
  requested: "Requested",
  leaving: "Leaving",
  invited: "Invited",
  joined: "Joined",
};

/** What the date column means for a row — the header cannot say "Joined" for all three. */
export const DIRECTORY_DATE_LABELS: Record<DirectoryStatus, string> = {
  requested: "Requested",
  leaving: "Requested",
  invited: "Invited",
  joined: "Joined",
};
