/**
 * Keeps this person's microphone on the wire while it is meant to be on: the pure half of
 * <LocalMicSupervisor> in persistent-meeting-session.tsx, so the decision can be tested.
 *
 * WHY (field evidence, 2026-10-03)
 *   A bridge host's own speech stopped being transcribed right after LiveKit ran a full reconnect
 *   ("local connection quality lost while publishing, triggering full reconnect", then "failed to
 *   remove track"; an earlier session logged "error trying to re-publish tracks after
 *   reconnection"). A full reconnect unpublishes every local track and publishes it again; when
 *   that second half fails LiveKit only logs it. Nothing in the page noticed: the session's
 *   `microphoneEnabled` mirror does not run while the room is reconnecting, so it still said "on",
 *   the popup showed nothing wrong, and the rest of the meeting had no host transcript, no
 *   translation and no dub — Meet got the raw-mic fallback at best. The Meet window and Meet audio
 *   tracks already had a supervisor (publish-supervisor.ts); the microphone, the one track the whole
 *   translation depends on, had none.
 *
 * WHAT COUNTS AS BROKEN
 *   Only while connected, and only while the INTENT is on — the intent is the caller's (in a bridge
 *   room: the last value the Meet-follow applied, the user's popup override included), never this
 *   module's. An intent that is off or unknown is left alone, so this can never unmute someone Meet
 *   (or the host's ForceMuted) has muted. Then, in order:
 *     missing         no local Microphone publication at all
 *     no-track        a publication without a track
 *     track-ended     its MediaStreamTrack is `ended` (device unplugged, capture killed)
 *     no-server-sid   a publication the server never acknowledged (no `trackSid`)
 *     muted           published but muted, while it should be on
 *   A disabled-but-live track is NOT a fault: that is HalfDuplexMic holding the mic down while a
 *   dub plays, and it gives it back itself.
 *
 * NOT ON THE FIRST SIGHT
 *   A fault must be seen twice, MIC_FAULT_CONFIRM_MS apart, before anything is done. Every healthy
 *   join and every mute flip passes through a moment that looks exactly like one (the publication is
 *   created after Connected, LiveKit's own republish is still running right after Reconnected, an
 *   unmute is in flight), and re-publishing over those would be the double-publish this must avoid.
 *
 * ONE AT A TIME, AND BACKING OFF
 *   The caller runs one heal at a time (single flight) and reports its outcome here. A failed heal
 *   (device busy, permission withdrawn) is retried on a growing delay, so a microphone that cannot
 *   be opened is not hammered every ten seconds for the rest of the meeting; a success resets it.
 *
 * Relative imports with the extension: the unit tests run under the plain node test runner.
 */

import { isVirtualMicrophoneLabel } from "./bridge-mic-device.ts";

/** How often the microphone is checked while connected, besides the reconnect events. */
export const MIC_HEAL_CHECK_INTERVAL_MS = 10_000;

/** How long a fault must last before it is acted on. See NOT ON THE FIRST SIGHT. */
export const MIC_FAULT_CONFIRM_MS = 3_000;

/** The longest wait between two failed heals. */
export const MIC_HEAL_MAX_BACKOFF_MS = 60_000;

export type MicFault = "missing" | "no-track" | "track-ended" | "no-server-sid" | "muted";

/** What the caller read off the local participant, without touching LiveKit types. */
export type LocalMicObservation = {
  /** The room is Connected (not connecting, reconnecting or disconnected). */
  connected: boolean;
  /** Whether the mic should be on; null when nobody has said (nothing to enforce). */
  intent: boolean | null;
  /** The local Microphone publication, or null when there is none. */
  publication: {
    trackSid: string | null | undefined;
    muted: boolean;
    hasTrack: boolean;
    /** `mediaStreamTrack.readyState === "ended"`. */
    trackEnded: boolean;
  } | null;
};

export function detectMicFault(observation: LocalMicObservation): MicFault | null {
  if (!observation.connected || observation.intent !== true) return null;
  const publication = observation.publication;
  if (!publication) return "missing";
  if (!publication.hasTrack) return "no-track";
  if (publication.trackEnded) return "track-ended";
  if (!publication.trackSid) return "no-server-sid";
  if (publication.muted) return "muted";
  return null;
}

/**
 * How a fault is healed:
 *   enable     `setMicrophoneEnabled(true)` — creates and publishes a track, or unmutes one
 *   republish  unpublish the broken publication (stopping its track), then `setMicrophoneEnabled(true)`
 *              — enabling alone would only unmute a publication whose track is dead or unknown to
 *              the server
 */
export type MicHealAction = "enable" | "republish";

export function micHealAction(fault: MicFault): MicHealAction {
  return fault === "missing" || fault === "muted" ? "enable" : "republish";
}

export type MicHealState = {
  /** The fault seen on the last check, and since when; null when the last check was healthy. */
  suspect: { fault: MicFault; sinceMs: number } | null;
  /** Consecutive failed heals. */
  failures: number;
  /** No heal before this (the back-off); 0 for none. */
  notBeforeMs: number;
};

export const INITIAL_MIC_HEAL: MicHealState = { suspect: null, failures: 0, notBeforeMs: 0 };

/** The wait after `failures` failed heals in a row: 5 s, 10 s, 20 s, 40 s, then a minute. */
export function micHealBackoffMs(failures: number): number {
  if (failures <= 0) return 0;
  return Math.min(MIC_HEAL_MAX_BACKOFF_MS, 5_000 * 2 ** (failures - 1));
}

export type MicHealDecision = {
  state: MicHealState;
  /** Heal now, for this fault. Null: nothing to do (healthy, unconfirmed, backing off, in flight). */
  heal: MicFault | null;
  /** A fault seen for the first time on this check (for the log, once per fault). */
  newlySuspected: MicFault | null;
  /** The fault that was suspected went away without a heal (it was a transient). */
  cleared: MicFault | null;
};

/**
 * One check. `inFlight`: a heal from an earlier check has not settled yet — never a second one.
 */
export function checkMicHealth(
  state: MicHealState,
  observation: LocalMicObservation,
  nowMs: number,
  inFlight: boolean,
): MicHealDecision {
  const fault = detectMicFault(observation);
  if (!fault) {
    const cleared = state.suspect?.fault ?? null;
    const next = state.suspect ? { ...state, suspect: null } : state;
    return { state: next, heal: null, newlySuspected: null, cleared };
  }
  // A different fault restarts the confirmation: it is a different situation.
  const sameFault = state.suspect?.fault === fault;
  const suspect = sameFault && state.suspect ? state.suspect : { fault, sinceMs: nowMs };
  const next = sameFault ? state : { ...state, suspect };
  const confirmed = nowMs - suspect.sinceMs >= MIC_FAULT_CONFIRM_MS;
  const heal = confirmed && !inFlight && nowMs >= state.notBeforeMs ? fault : null;
  return { state: next, heal, newlySuspected: sameFault ? null : fault, cleared: null };
}

/** A heal settled. A success forgets the fault and the back-off; a failure grows the back-off. */
export function micHealSettled(state: MicHealState, ok: boolean, nowMs: number): MicHealState {
  if (ok) return { suspect: null, failures: 0, notBeforeMs: 0 };
  const failures = state.failures + 1;
  return { ...state, failures, notBeforeMs: nowMs + micHealBackoffMs(failures) };
}


// ── main.log lines ───────────────────────────────────────────────────────────

const FAULT_WORDS: Record<MicFault, string> = {
  missing: "it is not published at all",
  "no-track": "its publication has no track",
  "track-ended": "its track has ended",
  "no-server-sid": "the server never acknowledged its publication",
  muted: "it is published muted",
};

export function describeMicFault(fault: MicFault): string {
  return FAULT_WORDS[fault];
}

export function micFaultSuspectedLine(fault: MicFault, cause: string): string {
  return `[bridge] WarpTalk mic should be on but ${describeMicFault(fault)} (${cause}); re-publishing if it lasts ${MIC_FAULT_CONFIRM_MS / 1000} s`;
}

export function micHealAttemptLine(fault: MicFault, attempt: number): string {
  return `[bridge] WarpTalk mic: re-publishing because ${describeMicFault(fault)} (attempt ${attempt}, ${micHealAction(fault)})`;
}

export function micHealOutcomeLine(input: {
  ok: boolean;
  fault: MicFault;
  detail: string;
  failures: number;
}): string {
  if (input.ok) return `[bridge] WarpTalk mic is back on the wire (${input.detail})`;
  const retryS = Math.round(micHealBackoffMs(input.failures) / 1000);
  return `[bridge] WarpTalk mic re-publish failed (${describeMicFault(input.fault)}): ${input.detail}; next try in ${retryS} s`;
}

// ── which device is being recorded ──────────────────────────────────────────

/**
 * The main.log line for the device WarpTalk records, or null when it has not changed since the
 * last line (`previous`, per connection). Said once per connection and on every change, because
 * "which microphone was it" is the first question about every "it did not hear me" report, and a
 * bridge has no pre-join screen where the answer would have been visible.
 */
export function micDeviceLogLine(previous: string | null, label: string | null): string | null {
  const current = label?.trim() || null;
  if (current === previous) return null;
  if (!current) return "[bridge] WarpTalk mic is recording no device (no microphone track)";
  const virtual = isVirtualMicrophoneLabel(current)
    ? " — a virtual cable, not a microphone: WarpTalk will not hear this person"
    : "";
  return `[bridge] WarpTalk mic is recording "${current}"${virtual}`;
}
