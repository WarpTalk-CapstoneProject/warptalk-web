/**
 * Reading a "meeting has started" notification, from either shape the server sends.
 *
 * THE BUG THIS EXISTS TO FIX
 *   The popup rendered without its Join button, every time. It looked like a missing feature; it
 *   was a field-name mismatch. The realtime payload is `RealtimeNotificationMessage`, whose
 *   properties are annotated `[JsonPropertyName("action_url")]` and `("payload_json")` — SNAKE
 *   CASE — while the REST list endpoint returns `NotificationMessageDto`, which is camelCase. The
 *   client read only camelCase, so on the realtime path `actionUrl` and `payloadJson` were both
 *   `undefined`: no link to join with, and no `room_id` to build one from.
 *
 *   Nothing threw. `title` and `content` happen to have the same name in both shapes, so the
 *   popup appeared, correctly worded, and simply omitted the one control that made it useful.
 *   That is why this is a module with tests rather than three `??` operators inline — the failure
 *   mode is silent, and the next person to add a field will not know there are two spellings.
 *
 * READ BOTH, PREFER NEITHER
 *   Both spellings are accepted for every field. Normalising on the server would be the deeper
 *   fix, but it is a shared contract with the mobile and desktop clients, and a client that
 *   tolerates both is correct before, during and after any such change.
 */

/** Either shape, as it arrives — every field optional because none of them are guaranteed. */
export type RawNotification = {
  type?: string;
  title?: string;
  content?: string;
  message?: string;
  actionUrl?: string | null;
  action_url?: string | null;
  payloadJson?: string;
  payload_json?: string;
  data?: { actionUrl?: string | null } | null;
};

export type MeetingStartedNotice = {
  /** The room's own title, when the payload carried one; otherwise the server's sentence. */
  title: string;
  /** Where Join goes. Null when neither a link nor a room id arrived — the notice still informs. */
  joinHref: string | null;
};

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

/**
 * The room id and title out of `payload_json`.
 *
 * Parsed defensively: this runs inside a SignalR callback, and an exception there takes down the
 * connection's whole handler — so a malformed payload degrades to a notice with no Join button
 * rather than to no notifications at all.
 */
function readPayload(raw: RawNotification): { roomId?: string; roomTitle?: string } {
  const json = firstString(raw.payload_json, raw.payloadJson);
  if (!json) return {};

  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    return {
      roomId: firstString(parsed.room_id, parsed.roomId),
      roomTitle: firstString(parsed.room_title, parsed.roomTitle),
    };
  } catch {
    return {};
  }
}

/** This app's origin, or null where there is no window to ask (SSR, and node:test). */
export function currentOrigin(): string | null {
  return typeof window === "undefined" ? null : window.location.origin;
}

/**
 * An absolute link to our own app, made relative.
 *
 * The server builds `{frontendBaseUrl}/room/{id}` because the same string is also emailed. Handed
 * to next/link as-is that is a full page load — a fresh document, a fresh SignalR connection, and
 * the LiveKit session in the mini dock torn down, which is the exact thing the persistent session
 * exists to prevent. Only the path is kept, so the router handles it as a client navigation.
 *
 * An absolute URL pointing somewhere ELSE is discarded rather than followed. Join is a one-click
 * action and a notification payload is not a trusted source of destinations — so `appOrigin` is a
 * PARAMETER rather than a `window` lookup buried inside. Read from `window`, the check silently
 * disappeared wherever `window` does not exist, which is both server rendering and every test:
 * the first version of this function let `https://evil.example.com/steal` through as `/steal`,
 * and only an explicit origin made that visible.
 *
 * A null origin therefore rejects every absolute URL rather than trusting it.
 */
export function toInternalHref(
  url: string | null | undefined,
  appOrigin: string | null = currentOrigin(),
): string | null {
  if (!url) return null;

  // `//evil.example.com` and `/\evil.example.com` are paths to a browser only in the sense that
  // they leave the site. They must be caught before the "starts with a slash" shortcut.
  if (/^[/\\]{2}/.test(url)) return null;
  if (url.startsWith("/")) return url;

  try {
    const parsed = new URL(url);
    // `javascript:` and `data:` parse perfectly well and have a pathname.
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (!appOrigin || parsed.origin !== appOrigin) return null;
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return null;
  }
}

/**
 * What to show for a MEETING_STARTED notification, or null if this is not one.
 *
 * The Join target is the server's `action_url` when it survived the trip, and `/room/{room_id}`
 * otherwise — `room_id` is a REQUIRED field of this notification type (see the backend's
 * NotificationValidator), so the fallback is not a guess.
 */
export function readMeetingStartedNotice(
  raw: RawNotification,
  appOrigin: string | null = currentOrigin(),
): MeetingStartedNotice | null {
  if (raw.type !== "MEETING_STARTED") return null;

  const { roomId, roomTitle } = readPayload(raw);
  const actionUrl = firstString(raw.action_url, raw.actionUrl, raw.data?.actionUrl);

  return {
    title: roomTitle ?? firstString(raw.title, raw.content, raw.message) ?? "A meeting",
    // A rejected link falls back to the room id rather than to nothing: an off-origin action_url
    // must not be able to REMOVE the Join button any more than it may redirect it.
    joinHref: toInternalHref(actionUrl, appOrigin) ?? (roomId ? `/room/${roomId}` : null),
  };
}
