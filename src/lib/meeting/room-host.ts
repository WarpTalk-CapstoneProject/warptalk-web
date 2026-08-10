type RoomHostReference = {
  hostId: string;
};

type WorkspaceMemberIdentity = {
  id: string;
  userId: string;
  fullName?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
};

type CurrentUserIdentity = {
  id: string;
  fullName?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
} | null;

export function resolveRoomHost(
  room: RoomHostReference,
  members: WorkspaceMemberIdentity[],
  currentUser: CurrentUserIdentity,
) {
  if (room.hostId === currentUser?.id) {
    return {
      name: currentUser.fullName || currentUser.email || "Host",
      avatarUrl: currentUser.avatarUrl ?? undefined,
    };
  }

  const hostMember = members.find(
    (member) => member.userId === room.hostId || member.id === room.hostId,
  );

  return {
    name: hostMember?.fullName || hostMember?.email || "Host",
    avatarUrl: hostMember?.avatarUrl ?? undefined,
  };
}
