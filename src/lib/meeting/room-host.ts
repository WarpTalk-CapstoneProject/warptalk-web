type RoomHostReference = {
  hostId: string;
};

/**
 * Whether a meetings-list row may say the viewer was INVITED to it.
 *
 * It used to be `room.hostId !== user.id` — "I did not book this" — which is a different claim,
 * and it was wrong three ways: a workspace Owner/Admin saw "Invited" on every room in the
 * workspace, because the server lists all of them to her whether or not she has anything to do
 * with them; a host a room had been handed to saw "Invited" on the room they now run, because
 * `hostId` is the booker; and the booker who handed it over was the only one the check got right.
 *
 * What the list row actually carries is `isHost` (the EFFECTIVE host, after any transfer) and
 * `hostId` (the booker). It carries nothing about participants or invitations. What makes the
 * answer still decidable is who the server lists rooms TO: for a plain member it is exactly the
 * rooms they host, booked, joined, or hold an open invitation to (RoomReadAccess.IsReadableBy),
 * so a row that is neither of the first two is one of the last two. For an Owner/Admin the list
 * is every room in the workspace, and nothing on the row separates "invited" from "can see
 * everything" — so the badge is withheld there rather than guessed. Missing a true "Invited" is
 * an absence; stamping it on a room she was never asked to is a false statement.
 *
 * An unknown role (`null`, not resolved yet) is treated like an Owner/Admin for the same
 * reason: it might be one.
 *
 * Known limit: "joined" and "invited" are one bucket here. Someone who entered with the room code
 * has a participant row and no invitation, and still reads as Invited, because the row cannot
 * tell the two apart. Separating them — and restoring the badge for an Owner/Admin who really was
 * invited — needs the server to say the viewer's relation on the list item; it does not today.
 */
export function isInvitedToRoom(
  room: RoomHostReference & { isHost?: boolean },
  viewerId: string | null | undefined,
  workspaceRole: "owner" | "admin" | "member" | null,
): boolean {
  if (!viewerId) return false;
  // Hosting it now, or having booked it — either way it is theirs, not an invitation.
  if (room.isHost || room.hostId === viewerId) return false;
  return workspaceRole === "member";
}

type WorkspaceMemberIdentity = {
  id: string;
  userId: string;
  fullName?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
  roleName?: string | null;
};

type CurrentUserIdentity = {
  id: string;
  fullName?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
} | null;

/**
 * Who hosts this room, in the shape `UserChip` wants.
 *
 * `userId` and `email` are part of the answer, not extras: the chip keys presence on the id and
 * puts the address under the name, and a caller that only received `{ name, avatarUrl }` had no
 * way to supply either — so every host chip in the rooms list would have been a name and a face
 * with nothing behind it. The type is written structurally rather than imported from the chip
 * because this module is loaded directly by a node test, which has no path aliases.
 */
export function resolveRoomHost(
  room: RoomHostReference,
  members: WorkspaceMemberIdentity[],
  currentUser: CurrentUserIdentity,
) {
  if (room.hostId === currentUser?.id) {
    return {
      userId: room.hostId,
      name: currentUser.fullName || currentUser.email || "Host",
      email: currentUser.email ?? undefined,
      avatarUrl: currentUser.avatarUrl ?? undefined,
      role: "Host",
    };
  }

  const hostMember = members.find(
    (member) => member.userId === room.hostId || member.id === room.hostId,
  );

  return {
    userId: room.hostId,
    name: hostMember?.fullName || hostMember?.email || "Host",
    email: hostMember?.email ?? undefined,
    avatarUrl: hostMember?.avatarUrl ?? undefined,
    role: "Host",
  };
}
