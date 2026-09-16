/**
 * A link to a moment in a meeting: the `?t=` parameter. WT-655.
 *
 * WHY THE MEETING AXIS AND NOT THE FILE AXIS
 *   `?t=` is a count of seconds from the start of the MEETING'S timeline — the same axis a
 *   transcript offset (`startTimeMs`) and a summary citation (`atMs`) are written on, and the axis
 *   recording-seek.ts converts FROM. It is not an offset into the video file, which is the number a
 *   media player would naturally hand you.
 *
 *   A file-axis number stops meaning anything the moment the recording it was measured against is
 *   replaced, trimmed, or joined by a second run — and all three of those happen to meetings: a
 *   recording is re-encoded, a host stops and restarts, an egress job is re-run. The meeting axis is
 *   the clock the transcript itself is written in, so a link on it still points at the same sentence
 *   after every one of those. It also keeps working on a meeting with no recording at all, which is
 *   the case that decides the whole design — see WHAT A LINK DOES WITH NO VIDEO below.
 *
 * WHY THIS IS NOT A LINK-MINTING FEATURE
 *   Nothing here creates a link, a token, or a public route. The URL a reader shares is the page's
 *   own URL with one parameter added, so whoever opens it meets exactly the access checks that page
 *   already applies — a viewer with no right to the meeting sees what they would have seen without
 *   the parameter. That is worth writing down because "share a moment" is precisely the kind of
 *   feature that grows a public-link mode by accident, one reasonable request at a time, and a
 *   public link to a moment is a public link to the whole transcript around it.
 *
 * WHAT A LINK DOES WITH NO VIDEO
 *   Scrolls the transcript. Reading the right sentence is most of the value of "look at this bit",
 *   and it is the part that survives a meeting nobody recorded, a meeting whose clocks cannot be
 *   reconciled, and a meeting with several recordings — the three cases the page already refuses to
 *   seek in. The caller does that; this module only parses and formats.
 *
 * WHY A BAD VALUE IS SILENT
 *   `parseMomentParam` answers null for anything it does not recognise and the caller does nothing
 *   at all with a null: no seek, no toast, no jump to 0:00. A malformed `?t=` is somebody's mangled
 *   copy-paste — a link broken across two lines in a chat client, a trailing bracket from a
 *   markdown auto-linker. There is no action the reader can take about it and no bug for them to
 *   report, so an error message would be noise on arrival at a page that otherwise works fine. A
 *   jump to 0:00 would be worse than noise: it is a confident answer to a question nobody asked.
 */

/** The parameter's name, in one place, so a reader and a writer cannot disagree about it. */
export const MOMENT_PARAM = "t";

/**
 * What a value has to look like: digits, optionally with a decimal part.
 *
 * Deliberately narrower than `Number()`, which accepts `0x10`, `1e3`, `+5`, `Infinity` and a bare
 * empty string (as 0 — the jump-to-0:00 failure, arriving through the front door). We only ever
 * MINT whole digits, so anything else in this parameter is a mangled paste rather than an alternative
 * spelling worth honouring.
 */
const SECONDS_PATTERN = /^\d+(?:\.\d+)?$/;

/**
 * The largest value worth reading, so the milliseconds it becomes stay exact.
 *
 * Past this the multiplication loses integer precision and the moment silently becomes a different
 * moment. Nothing this long is a meeting, so it is a mangled value by another route.
 */
const MAX_SECONDS = Number.MAX_SAFE_INTEGER / 1000;

/**
 * The moment a `?t=` value names, in MEETING milliseconds — or null when it names nothing.
 *
 * Milliseconds because that is what every consumer of a moment on this page already speaks:
 * `atMs` on a citation, `startTimeMs` on a segment, the argument to seekTargetSeconds. The parameter
 * is in seconds because a URL a person might read or hand-edit should be in seconds.
 *
 * A fractional value is accepted and floored rather than rejected. We never write one, so it can
 * only be hand-edited — and someone who types `?t=90.5` meant a moment, not a mistake. Flooring is
 * the honest reading of a whole-second parameter: the second that CONTAINS the moment.
 */
export function parseMomentParam(raw: string | null | undefined): number | null {
  if (typeof raw !== "string") return null;
  // Trimmed because a link pasted out of an email arrives with whitespace round it more often than
  // it arrives clean, and the surrounding space is not part of anybody's intent.
  const trimmed = raw.trim();
  if (!SECONDS_PATTERN.test(trimmed)) return null;

  const seconds = Number(trimmed);
  // Belt and braces after the pattern: a long enough run of digits parses to Infinity.
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > MAX_SECONDS) return null;

  return Math.floor(seconds) * 1000;
}

/**
 * A meeting moment as the parameter's value, or null when there is no moment to write.
 *
 * Floored to whole seconds, matching what `parseMomentParam` reads back, so a link that is shared,
 * opened and re-shared keeps pointing at the same second instead of drifting a fraction each time.
 */
export function formatMomentParam(atMs: number): string | null {
  if (!Number.isFinite(atMs) || atMs < 0) return null;
  return String(Math.floor(atMs / 1000));
}

/**
 * A query string with the moment set, or removed when `atMs` is null.
 *
 * Takes and returns a query string rather than a whole URL so it can be tested without one, and so
 * the caller stays in charge of the path — this parameter is added to the page the reader is
 * already on and must never be the thing that decides which page that is.
 *
 * Every OTHER parameter is preserved. The room page carries none of its own today, but a reader's
 * URL is not ours to tidy: a tracking parameter, a `?tab=`, anything a future wave adds — dropping
 * them here would make sharing a moment quietly destructive of whatever else was in the address bar.
 *
 * The result has no leading `?`; an empty string means "no query at all", which the caller must
 * turn into a bare path rather than a trailing `?`.
 */
export function withMomentParam(search: string, atMs: number | null): string {
  const params = new URLSearchParams(search);
  const value = atMs === null ? null : formatMomentParam(atMs);
  if (value === null) params.delete(MOMENT_PARAM);
  else params.set(MOMENT_PARAM, value);
  return params.toString();
}
