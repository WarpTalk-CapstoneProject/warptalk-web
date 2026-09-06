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

/**
 * The activation landing — what a workspace with no plan shows INSTEAD of the product.
 *
 * It is a workspace route (it needs the slug: it names the workspace and bills it) but it is
 * deliberately not a workspace PAGE. The app shell renders it without the portal chrome, the
 * same way it renders /workspace and /workspace/create, because a sidebar full of destinations
 * that all bounce back here is not a paywall — it is the product with the doors locked, which
 * is precisely the thing this route replaced.
 *
 * The gate that sends people here lives in lib/billing/workspace-paywall, and imports this
 * function rather than spelling the path again: the route the paywall holds EXEMPT and the
 * route it redirects TO must be the same string, or the redirect loops.
 */
export function workspaceActivationPath(workspaceSlug: string): string {
  return `/${workspaceSlug}/activate`;
}

/**
 * Whether a path is a workspace's activation landing.
 *
 * Asked by the app shell to decide whether to draw the portal around the page. A false negative
 * puts the sidebar back around the paywall; a false positive strips the chrome off a real page.
 *
 * Matched as a whole two-segment path, so `/{slug}/activateXYZ` and `/{slug}/activate/anything`
 * are not it. The caller is responsible for excluding non-workspace first segments — `/admin`
 * and `/workspace` are checked before this in the shell — since a bare `/[^/]+` cannot tell a
 * slug from a top-level route.
 */
export function isWorkspaceActivationPath(pathname: string): boolean {
  return /^\/[^/]+\/activate\/?$/.test(pathname);
}
