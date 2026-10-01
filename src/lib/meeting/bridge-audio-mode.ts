/**
 * Text-only bridge mode: the pure half (PO, 2026-10-01).
 *
 * TWO WAYS TO BE IN A GOOGLE MEET CALL WITH WARPTALK
 *   voice  Meet's microphone is VB-CABLE. WarpTalk plays this user's DUB into it, so the far side
 *          hears them translated. Needs the cable, and Meet set to "CABLE Output".
 *   text   Meet keeps the user's REAL microphone and speakers. The far side hears their real voice;
 *          WarpTalk still transcribes and translates everything (the transcript, the translated
 *          text, and the far side translated back to the user), but synthesizes no dub of this
 *          user for the far side and the web plays NOTHING into a cable. No driver needed.
 *
 * THE MODE IS PER PARTICIPANT, AND THE SERVER OWNS IT (backend #509)
 *   `POST /translation-rooms/bridge/claim` takes an optional `audioMode` (omitted = keep the current
 *   one; a first claim is voice) and answers the mode in force; `PUT /{id}/bridge/audio-mode`
 *   switches it; the participant row carries `isBridgeTextOnly`. tts_worker reads the mode per route,
 *   which is why the client never fakes text mode by just not playing the dub.
 *
 * ONE DIRECTION ONLY WHILE LIVE
 *   Voice → text is always allowed: it only removes the dub. Text → voice is refused while a
 *   translation session runs (409 BRIDGE_AUDIO_MODE_LOCKED): the user is speaking into Meet with
 *   their real mic, and switching the dub on would put a second copy of every sentence into the call
 *   the moment a cable appeared. Before Start and after Stop both directions are free. The popup does
 *   not offer the locked direction, and the main window re-checks it before calling the server.
 *
 * Relative imports with the extension: the unit tests run under the plain node test runner.
 */

import type { BridgeModeAvailability, MeetMicState, VirtualAudioStatus } from "../desktop/bridge.ts";

export type BridgeAudioMode = "voice" | "text";

export const BRIDGE_AUDIO_MODE_VOICE: BridgeAudioMode = "voice";
export const BRIDGE_AUDIO_MODE_TEXT: BridgeAudioMode = "text";

/** The server's 409 for text → voice while translation runs (BridgeRoomConstants). */
export const BRIDGE_AUDIO_MODE_LOCKED = "BRIDGE_AUDIO_MODE_LOCKED";

export function isBridgeAudioMode(value: unknown): value is BridgeAudioMode {
  return value === "voice" || value === "text";
}

/** "voice" / "text" in any case → the canonical value; anything else → null. Mirrors the server. */
export function parseBridgeAudioMode(value: unknown): BridgeAudioMode | null {
  if (typeof value !== "string") return null;
  const mode = value.trim().toLowerCase();
  return isBridgeAudioMode(mode) ? mode : null;
}

// ── what this machine can do ────────────────────────────────────────────────

export type BridgeModeSupport = {
  /** Voice mode can run: the outbound cable is installed (the dub has somewhere to go). */
  voice: boolean;
  /** Text-only mode can run: the desktop says loopback works without a cable. */
  text: boolean;
  /** VB-CABLE (or the platform's outbound device) is installed. */
  cableInstalled: boolean;
  /** False for a desktop build that predates `bridgeModes`: only voice mode exists there. */
  reported: boolean;
};

function hasInstalledOutboundDevice(status: VirtualAudioStatus): boolean {
  return (status.devices ?? []).some((device) => device.leg === "outbound" && device.installed);
}

/**
 * The two modes this machine can run, from one desktop status reading.
 *
 * `bridgeModes` is the desktop's own verdict (desktop #45). Without it — an older build — text mode
 * does not exist (its loopback refuses without the cable, B2), and voice is "the cable is there",
 * exactly what the rest of the bridge already assumes. Null status (a browser tab, no desktop answer)
 * answers null: "we did not look" is not "neither works".
 *
 * Voice reads `cableInstalled`, not the desktop's `voice.possible`: that one also wants the far side
 * to be able to come back, and the outbound dub is what voice mode is about. A machine whose inbound
 * leg is missing still speaks into Meet; the inbound problem is shown by its own notice.
 */
export function bridgeModeSupport(status: VirtualAudioStatus | null): BridgeModeSupport | null {
  if (!status) return null;
  const modes: BridgeModeAvailability | undefined = status.bridgeModes;
  if (!modes) {
    const cable = hasInstalledOutboundDevice(status);
    return { voice: cable, text: false, cableInstalled: cable, reported: false };
  }
  const cable = modes.voice?.cableInstalled === true;
  return {
    voice: cable,
    text: modes.textOnly?.possible === true,
    cableInstalled: cable,
    reported: true,
  };
}

/**
 * The mode a NEW sitting starts in on this machine: voice where the cable is installed, text where it
 * is not and text-only works, voice otherwise (nothing better exists — the old behaviour).
 */
export function preferredBridgeAudioMode(support: BridgeModeSupport | null): BridgeAudioMode {
  if (!support) return "voice";
  if (support.cableInstalled) return "voice";
  return support.text ? "text" : "voice";
}

/**
 * What the CLAIM sends as `audioMode`, or undefined to send nothing.
 *
 * Only ever "text", and only where voice cannot run. Sending "voice" would not be neutral: the claim
 * re-runs on every reload of the main window, and before Start a "voice" there would quietly undo a
 * text pick the user made in the popup. Omitted, the server keeps what this participant already has
 * (voice for a first claim), which is exactly the default the PO asked for where a cable exists.
 */
export function claimAudioModeFor(status: VirtualAudioStatus | null): BridgeAudioMode | undefined {
  const support = bridgeModeSupport(status);
  return support && preferredBridgeAudioMode(support) === "text" ? "text" : undefined;
}

// ── which mode is in force ──────────────────────────────────────────────────

/**
 * This user's mode in a bridge room, best source first:
 *   1. `known` — what the server told THIS window (the claim, a switch it made);
 *   2. the participant row's `isBridgeTextOnly` (a room opened by hand, a window that never claimed);
 *   3. voice — what every server before #509 means, and the first-claim default.
 */
export function resolveBridgeAudioMode(input: {
  known?: BridgeAudioMode | null;
  isBridgeTextOnly?: boolean | null;
}): BridgeAudioMode {
  if (input.known) return input.known;
  if (input.isBridgeTextOnly === true) return "text";
  return "voice";
}

// ── switching ───────────────────────────────────────────────────────────────

/**
 *   noop     already in that mode — nothing to ask the server.
 *   allowed  ask the server (it still has the last word).
 *   locked   text → voice while translation runs. Not asked: the server would answer 409.
 */
export type BridgeAudioModeChange = "noop" | "allowed" | "locked";

export function bridgeAudioModeChange(input: {
  current: BridgeAudioMode;
  next: BridgeAudioMode;
  translationActive: boolean;
}): BridgeAudioModeChange {
  if (input.current === input.next) return "noop";
  if (input.next === "voice" && input.translationActive) return "locked";
  return "allowed";
}

/** Whether a mode may be OFFERED right now (the popup's chooser greys the other one out). */
export function canChooseBridgeAudioMode(input: {
  current: BridgeAudioMode;
  next: BridgeAudioMode;
  translationActive: boolean;
  support: BridgeModeSupport | null;
}): boolean {
  if (bridgeAudioModeChange(input) === "locked") return false;
  if (input.current === input.next) return true;
  // Without a reading we cannot say the machine can't; the server and the meeting decide then.
  if (!input.support) return true;
  return input.next === "voice" ? input.support.voice : input.support.text;
}

/**
 * What a refused switch means. `locked` is the server's 409 BRIDGE_AUDIO_MODE_LOCKED — this user is
 * text-only and stays so until translation stops; anything else leaves the mode where it was.
 */
export function bridgeAudioModeFailure(error: { status?: number | null; code?: string | number | null }):
  | "locked"
  | "refused" {
  const code = typeof error.code === "string" ? error.code.toUpperCase() : null;
  return error.status === 409 && code === BRIDGE_AUDIO_MODE_LOCKED ? "locked" : "refused";
}

// ── what the main window does with it ───────────────────────────────────────

/**
 * The device FilteredRoomAudio plays this user's outbound leg into — the dub, or the raw mic before a
 * dub exists — or null for none.
 *
 * NULL IN TEXT MODE, WHATEVER IS INSTALLED. Meet hears the real microphone; anything played into the
 * cable there is either nothing (Meet is not listening to it) or, for a user whose Meet still points
 * at the cable, a second voice next to the real one. This is the one place the main window decides
 * it; the text-only contract script checks the session passes through here.
 */
export function bridgeOutboundSinkDeviceId(input: {
  isBridgeRoom: boolean;
  isHost: boolean;
  audioMode: BridgeAudioMode;
  deviceId: string | null;
}): string | null {
  if (!input.isBridgeRoom || !input.isHost) return null;
  if (input.audioMode === "text") return null;
  return input.deviceId;
}

/** The desktop's loopback capture mode (WindowsLoopbackCaptureRequest.mode, desktop #45). */
export function bridgeLoopbackCaptureMode(mode: BridgeAudioMode): "voice" | "text-only" {
  return mode === "text" ? "text-only" : "voice";
}

/**
 * Whether a missing outbound cable is a problem worth the "cannot reach Google Meet" toast and the
 * setup wizard: only in voice mode, and only where voice is what this machine would run anyway. A
 * user in text mode — or about to be put in it because there is no cable — needs no cable at all.
 */
export function missingCableIsAProblem(input: {
  audioMode: BridgeAudioMode;
  support: BridgeModeSupport | null;
}): boolean {
  if (input.audioMode === "text") return false;
  return preferredBridgeAudioMode(input.support) === "voice";
}

// ── the Meet microphone check ───────────────────────────────────────────────

/**
 *   text-on-cable    text mode, but Meet records from VB-CABLE: nothing is played into it any more,
 *                    so the call hears silence from this user.
 *   voice-on-real    voice mode, but Meet records from the real microphone: the call hears this user
 *                    untranslated, and the dub goes into a cable nobody listens to.
 *   null             they agree, or the desktop cannot tell (`unknown`, `ambiguous`, no reading).
 */
export type BridgeMeetMicMismatch = "text-on-cable" | "voice-on-real";

export function bridgeMeetMicMismatch(input: {
  audioMode: BridgeAudioMode | null;
  meetMic: MeetMicState["state"] | null | undefined;
}): BridgeMeetMicMismatch | null {
  if (!input.audioMode || !input.meetMic) return null;
  if (input.audioMode === "text" && input.meetMic === "cable") return "text-on-cable";
  if (input.audioMode === "voice" && input.meetMic === "real") return "voice-on-real";
  return null;
}
