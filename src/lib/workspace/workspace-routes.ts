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

/**
 * The calendar of what is booked — where a meeting created for later actually shows up.
 *
 * Distinct from the meetings LIST at `/{slug}/rooms`: that one is a flat inventory, this one is
 * the month/week grid, and a booking made for Thursday is only legible on the second.
 */
export function schedulesPath(workspaceSlug: string): string {
  return `/${workspaceSlug}/schedules`;
}

/** A calendar deep link's query keys: written by `withScheduleFocus`, read by `readScheduleFocus`. */
export const SCHEDULE_DATE_PARAM = "date";
export const SCHEDULE_FOCUS_PARAM = "focus";

/** What a calendar deep link asks for: open this day's month, and point at this meeting. */
export type ScheduleFocus = { date: Date | null; roomId: string | null };

/** Anything that reads like `URLSearchParams` — the real one, or a test's plain map. */
type ReadableParams = Pick<URLSearchParams, "get">;

/**
 * The calendar path with "show me the meeting I just booked" attached — the success screen's
 * "View in calendar" after a booking.
 *
 * A decorator on `schedulesPath` rather than a second parameter of it, the same shape as
 * `withCheckoutIntent`: the bare path stays the one spelling of where the calendar lives, and
 * the create dialog still reads `schedulesPath(activeWorkspaceSlug)` at its call site, which is
 * what check-room-surface-contract pins.
 *
 * The date is the LOCAL calendar day ("2026-09-18"), never `toISOString()`: a meeting at 01:00 in
 * Hanoi is the previous day in UTC, and the calendar would open on the wrong day — or, on the 1st,
 * the wrong month. Each half is optional and is simply left off when absent; with neither, the
 * path comes back unchanged.
 */
export function withScheduleFocus(
  path: string,
  focus: { date?: Date | null; roomId?: string | null },
): string {
  const params = new URLSearchParams();
  if (focus.date && !Number.isNaN(focus.date.getTime())) {
    params.set(SCHEDULE_DATE_PARAM, toLocalDateParam(focus.date));
  }
  const roomId = focus.roomId?.trim();
  if (roomId) params.set(SCHEDULE_FOCUS_PARAM, roomId);

  const query = params.toString();
  if (!query) return path;
  return `${path}${path.includes("?") ? "&" : "?"}${query}`;
}

/**
 * The deep link `withScheduleFocus` wrote, or null when the URL carries none.
 *
 * A malformed date is dropped rather than guessed at — `new Date("2026-13-40")` would roll over
 * into a real, wrong month — but a valid room id beside it still stands: pointing at the meeting
 * in whatever month is on screen is better than ignoring the link outright.
 */
export function readScheduleFocus(params: ReadableParams | null | undefined): ScheduleFocus | null {
  const date = parseLocalDateParam(params?.get(SCHEDULE_DATE_PARAM)?.trim() ?? "");
  const roomId = params?.get(SCHEDULE_FOCUS_PARAM)?.trim() || null;
  return date || roomId ? { date, roomId } : null;
}

function toLocalDateParam(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Local midnight of a "yyyy-MM-dd", or null. Rejects anything `Date` would silently roll over. */
function parseLocalDateParam(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  // Constructed in local time: `new Date("2026-09-18")` parses as UTC midnight, which is the
  // previous day for everybody west of Greenwich.
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date
    : null;
}

/** The library of everything WarpTalk wrote down, across every meeting. */
export function recordsPath(workspaceSlug: string): string {
  return `/${workspaceSlug}/artifacts`;
}

/**
 * One meeting's records, at their own address.
 *
 * Keyed by ROOM and not by artifact: the page holds a meeting's transcript, summary and minutes
 * together, and which of them is open is a tab rather than a different page. A record therefore
 * has a URL that survives the meeting producing another one.
 */
export function recordDetailPath(workspaceSlug: string, roomId: string): string {
  return `/${workspaceSlug}/artifacts/${roomId}`;
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
