/**
 * How the app lays out what GET /notifications/announcements returned.
 *
 * The server has already decided WHO sees an announcement and HOW OFTEN (audience, window,
 * frequency, dismissals). What is left to the client is WHERE: each placement has its own
 * surface, and some surfaces show one at a time.
 *
 *   TOP_BANNER           one strip across the content column, a pager when there are several
 *   MODAL                one dialog at a time, highest priority first; closing shows the next
 *   TOAST                up to TOAST_LIMIT at once, bottom corner
 *   NOTIFICATION_CENTER  cards pinned to the top of the bell panel
 *   DASHBOARD_CARD       cards on the workspace home
 *
 * Free of React and `@/` imports so `node:test` runs it.
 */

export const VIEWER_PLACEMENTS = [
  "TOP_BANNER",
  "MODAL",
  "TOAST",
  "NOTIFICATION_CENTER",
  "DASHBOARD_CARD",
] as const;
export type ViewerPlacement = (typeof VIEWER_PLACEMENTS)[number];

export const TOAST_LIMIT = 2;

export interface PlacedAnnouncement {
  id: string;
  placement: string;
  priority: number;
  publishedAt: string | null;
  startsAt: string | null;
}

/** Highest priority first; among equals the newest start. An unknown placement is a banner. */
export function byPlacement<T extends PlacedAnnouncement>(items: readonly T[]): Record<ViewerPlacement, T[]> {
  const groups: Record<ViewerPlacement, T[]> = {
    TOP_BANNER: [],
    MODAL: [],
    TOAST: [],
    NOTIFICATION_CENTER: [],
    DASHBOARD_CARD: [],
  };
  for (const item of [...items].sort(compareForViewer)) {
    const placement = (VIEWER_PLACEMENTS as readonly string[]).includes(item.placement)
      ? (item.placement as ViewerPlacement)
      : "TOP_BANNER";
    groups[placement].push(item);
  }
  return groups;
}

export function compareForViewer(a: PlacedAnnouncement, b: PlacedAnnouncement): number {
  return b.priority - a.priority || startOf(b) - startOf(a) || a.id.localeCompare(b.id);
}

function startOf(item: PlacedAnnouncement): number {
  return Date.parse(item.startsAt ?? item.publishedAt ?? "") || 0;
}

/**
 * What each surface shows right now, after this page load's local closes.
 *
 * `closed` holds ids the viewer closed in this tab — a toast or a non-dismissible modal that was
 * only hidden, or a dismissal the server has not confirmed yet — so a refetch never brings back
 * something they just closed.
 */
export function visibleNow<T extends PlacedAnnouncement>(
  items: readonly T[],
  closed: ReadonlySet<string>,
): { banner: T[]; modal: T | null; toasts: T[]; notificationCenter: T[]; dashboard: T[] } {
  const open = items.filter((item) => !closed.has(item.id));
  const groups = byPlacement(open);
  return {
    banner: groups.TOP_BANNER,
    modal: groups.MODAL[0] ?? null,
    toasts: groups.TOAST.slice(0, TOAST_LIMIT),
    notificationCenter: groups.NOTIFICATION_CENTER,
    dashboard: groups.DASHBOARD_CARD,
  };
}

/** The key the browser-session id lives under in sessionStorage. */
export const SESSION_STORAGE_KEY = "wt.announcements.session";

export interface SessionStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * A random id for this browser session — what "every session" and "once per session" count
 * against. sessionStorage ends with the tab, which is the session a person means. When storage is
 * unavailable (private mode, a sandboxed frame) the id lives only as long as the page.
 */
export function browserSessionId(store: SessionStore | null, random: () => string): string {
  try {
    const existing = store?.getItem(SESSION_STORAGE_KEY);
    if (existing && /^[A-Za-z0-9-]{8,64}$/.test(existing)) return existing;
    const fresh = random().replace(/[^A-Za-z0-9-]/g, "").slice(0, 64) || "anonymous-session";
    store?.setItem(SESSION_STORAGE_KEY, fresh);
    return fresh;
  } catch {
    return random().replace(/[^A-Za-z0-9-]/g, "").slice(0, 64) || "anonymous-session";
  }
}

/**
 * Impressions are recorded once per announcement per page load (the server also collapses a
 * session's repeats). Returns true the first time an id is seen.
 */
export function firstSighting(seen: Set<string>, id: string): boolean {
  if (seen.has(id)) return false;
  seen.add(id);
  return true;
}
