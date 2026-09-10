type RoomHostReference = {
  hostId: string;
};

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
