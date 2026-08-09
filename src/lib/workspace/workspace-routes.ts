/**
 * Where things live inside a workspace.
 *
 * Every one of these paths used to be a template literal written out at the call site — the
 * live meeting alone was spelled in seven places — which is exactly how `/room/{id}` came to
 * exist without a workspace slug while every route around it had one. A path that is typed
 * once cannot disagree with itself.
 *
 * Pure, so the shapes can be tested without a router.
 */

/**
 * The live meeting.
 *
 * With no slug this returns the legacy `/room/{id}`, which is not a guess: that route still
 * exists and forwards to the slugged one using the workspace the user already has open. A
 * caller that cannot know the slug — a global notification handler, say — is better off
 * sending people through that door than fabricating a slug or refusing to navigate.
 */
export function liveMeetingPath(
  workspaceSlug: string | null | undefined,
  roomId: string,
): string {
  const slug = (workspaceSlug ?? "").trim();
  return slug ? `/${slug}/rooms/${roomId}/live` : `/room/${roomId}`;
}

/** The room's information page — where it is described, edited and read back afterwards. */
export function roomDetailPath(workspaceSlug: string, roomId: string): string {
  return `/${workspaceSlug}/rooms/${roomId}`;
}

/** The lobby a room sits in before anybody has started it. */
export function roomWaitingPath(workspaceSlug: string, roomId: string): string {
  return `/${workspaceSlug}/rooms/${roomId}/waiting`;
}

/**
 * Whether a path is the live meeting.
 *
 * The app shell asks this to decide whether the meeting dock floats. Getting it wrong does
 * not merely misplace a border: a false answer floats the minimised window on top of the
 * meeting it is a copy of.
 */
export function isLiveMeetingPath(pathname: string): boolean {
  return (
    pathname.startsWith("/room/") ||
    /^\/[^/]+\/rooms\/[^/]+\/live\/?$/.test(pathname)
  );
}
