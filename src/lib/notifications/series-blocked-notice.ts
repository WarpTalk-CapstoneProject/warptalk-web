/**
 * WT-708 — MEETING_SERIES_BLOCKED: a repeating meeting stopped creating occurrences because its
 * languages are no longer allowed by the workspace.
 *
 * Sent to the series host by TranslationRoomSeriesService.NotifySeriesLanguagePolicyBlockedAsync,
 * at most once a week per series. Its payload is `series_id` + `series_title` (both REQUIRED in the
 * notification service's validator) and it carries NO action_url: it is about a series, and the
 * point of it is that no new room is being made. There is no booking page either (WT-327 — a
 * series is edited from one of its meetings), so the link is resolved on click: the series'
 * current occurrence, else its most recent one.
 *
 * Read from either spelling of the payload field, like every other notice reader — the realtime
 * hub sends `payload_json`, the REST list `payloadJson`.
 */

export const MEETING_SERIES_BLOCKED_TYPE = "MEETING_SERIES_BLOCKED";

export type SeriesBlockedRaw = {
  type?: string;
  payloadJson?: string;
  payload_json?: string;
};

export type SeriesBlockedNotice = {
  seriesId: string;
  /** Null when the payload carried no title; the caller falls back to the server's own title. */
  seriesTitle: string | null;
};

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

/** The series this notification is about, or null for any other type / an unusable payload. */
export function readSeriesBlockedNotice(raw: SeriesBlockedRaw): SeriesBlockedNotice | null {
  if (raw.type !== MEETING_SERIES_BLOCKED_TYPE) return null;
  const json = firstString(raw.payload_json, raw.payloadJson);
  if (!json) return null;

  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const seriesId = firstString(parsed.series_id, parsed.seriesId);
    if (!seriesId) return null;
    return { seriesId, seriesTitle: firstString(parsed.series_title, parsed.seriesTitle) ?? null };
  } catch {
    return null;
  }
}

export type SeriesOccurrences = {
  currentOccurrenceId?: string | null;
  occurrences?: readonly { id: string; scheduledAt?: string | null }[] | null;
};

/**
 * The meeting to open so the host can edit the booking's languages: the occurrence the server
 * calls current (running now, else next due), else the most recently scheduled one. Null when the
 * series has no meeting at all.
 */
export function seriesBlockedRoomId(detail: SeriesOccurrences | null | undefined): string | null {
  if (!detail) return null;
  if (detail.currentOccurrenceId) return detail.currentOccurrenceId;

  const occurrences = detail.occurrences ?? [];
  if (occurrences.length === 0) return null;

  const time = (value?: string | null) => {
    const parsed = value ? Date.parse(value) : Number.NaN;
    return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
  };
  const latest = [...occurrences].sort((a, b) => time(b.scheduledAt) - time(a.scheduledAt))[0];
  return latest?.id ?? null;
}
