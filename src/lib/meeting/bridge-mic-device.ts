/**
 * Translated-voice bridge: the microphone WarpTalk records, and what Meet hears from it. The pure
 * half; the popup's Microphone panel and the main window's routing read it.
 *
 * THE DEVICES ARE PICKED IN WARPTALK, NOT IN MEET (PO, 2026-10-03)
 *   In voice mode Meet's microphone is set once to "CABLE Output" and left there. Everything the
 *   person picks afterwards — which real microphone WarpTalk listens to — is picked in the popup.
 *   Before this the popup had no microphone choice at all: a bridge room is opened without a
 *   pre-join screen, so WarpTalk recorded whatever Windows called the default input, the setup
 *   wizard told people to "keep your own microphone selected here in WarpTalk" with nothing to
 *   select, and nothing anywhere said which device that was. Text-only mode is unchanged: Meet
 *   keeps the real microphone there and the person picks it in Meet.
 *
 * NEVER A VIRTUAL CABLE
 *   A virtual cable's capture side is not a microphone. "CABLE Output" carries what WarpTalk plays
 *   into the cable — in voice mode that is this person's own outbound leg — so recording it would
 *   transcribe WarpTalk's own output instead of the person. The picker leaves every virtual
 *   endpoint out, and a current device that is one is flagged so the popup can say so.
 *
 * WHAT MEET HEARS (`BridgeOutboundLeg`)
 *   room-audio-routing decides it; this only names it, so the main window can log every change
 *   (main.log) and the popup can say when Meet has been hearing the untranslated voice for long
 *   enough that it is not just the first sentence waiting for its dub.
 *
 * WHAT THIS PERSON HEARS OF MEET (`BridgeInboundDub`)
 *   The other direction, named for main.log for the same reason: "they hear my dub, I hear none of
 *   theirs" (production, 2026-10-03) could not be answered from a log that only ever named the
 *   outbound leg. It says whether the Meet side's dub is being played to this person, and when it
 *   is not, which of the four reasons it is — with the facts behind the answer on the same line
 *   (the switch, the session, the listen language, and every dub of the Meet side in the room), so
 *   one line tells "the pipeline produced none" from "it produced one and it was not played".
 *
 * Relative imports with the extension: the unit tests run under the plain node test runner.
 */

import type { BridgeAudioMode } from "./bridge-audio-mode.ts";
import { AI_INTERPRETER_PREFIX } from "./interpreter-track.ts";

/**
 * Every virtual endpoint a bridge machine is known to carry: VB-CABLE and Hi-Fi Cable (and the
 * other VB-Audio cables), Voicemeeter, BlackHole, and WarpTalk's own macOS pair.
 */
const VIRTUAL_INPUT = /vb-audio|voicemeeter|\bcable\b|blackhole|warptalk (microphone|speaker)/i;

export function isVirtualMicrophoneLabel(label: string | null | undefined): boolean {
  return Boolean(label) && VIRTUAL_INPUT.test(label as string);
}

export type BridgeMicOption = {
  deviceId: string;
  label: string;
};

type DeviceLike = Pick<MediaDeviceInfo, "kind" | "deviceId" | "label">;

/**
 * The microphones the popup offers, in the browser's order.
 *
 * Real inputs only (see NEVER A VIRTUAL CABLE). Windows also lists every input a second time as
 * "communications"; that alias is dropped so a device is never offered twice. "default" is kept
 * when it points at a real device — it follows Windows when the person changes the default there.
 * A device without a label (no microphone permission yet) is still offered, numbered.
 */
export function bridgeMicOptions(devices: readonly DeviceLike[]): BridgeMicOption[] {
  const options: BridgeMicOption[] = [];
  let unnamed = 0;
  for (const device of devices) {
    if (device.kind !== "audioinput" || !device.deviceId) continue;
    if (device.deviceId === "communications") continue;
    if (isVirtualMicrophoneLabel(device.label)) continue;
    const label = device.label.trim() || `Microphone ${++unnamed}`;
    options.push({ deviceId: device.deviceId, label });
  }
  return options;
}

/**
 * The device WarpTalk is recording, as the popup should describe it: its label, and whether it is
 * a virtual cable (a problem in voice mode: see NEVER A VIRTUAL CABLE). Null when the main window
 * has not said, or the device is not in this window's list (unplugged, or no permission yet).
 */
export function describeBridgeMic(
  devices: readonly DeviceLike[],
  activeDeviceId: string | null | undefined,
): { label: string; virtual: boolean } | null {
  if (!activeDeviceId) return null;
  const device = devices.find((d) => d.kind === "audioinput" && d.deviceId === activeDeviceId);
  if (!device || !device.label.trim()) return null;
  return { label: device.label.trim(), virtual: isVirtualMicrophoneLabel(device.label) };
}

// ── what Meet hears ─────────────────────────────────────────────────────────

/**
 *   dub      the translated voice
 *   raw-mic  this person's own microphone, untranslated (no dub on the wire yet)
 *   none     nothing: no bridge device (text mode, no cable), or the dub is between sentences
 */
export type BridgeOutboundLeg = "dub" | "raw-mic" | "none";

export function bridgeOutboundLeg(input: {
  deviceReady: boolean;
  outboundIdentity: string | null;
  outboundRawMic: boolean;
}): BridgeOutboundLeg {
  if (!input.deviceReady) return "none";
  if (input.outboundIdentity) return "dub";
  return input.outboundRawMic ? "raw-mic" : "none";
}

/**
 * How long Meet may hear the untranslated voice while translating before the popup says so.
 *
 * The first sentence of every session is sent raw on purpose (room-audio-routing: the dub's bot is
 * created by that sentence), and the pipeline takes a few seconds; this is long enough to cover
 * that and short enough that a person still speaking notices it.
 */
export const RAW_MIC_NOTICE_AFTER_MS = 15_000;

/**
 * Whether the popup warns that Meet hears this person untranslated.
 *
 * Voice mode, translation running, and Meet fed the raw microphone for RAW_MIC_NOTICE_AFTER_MS.
 * Same language on both sides is excluded: there is nothing to translate, and raw is right.
 */
export function showsRawMicNotice(input: {
  audioMode: BridgeAudioMode | null | undefined;
  translationStarted: boolean;
  leg: BridgeOutboundLeg | null | undefined;
  legSinceMs: number | null | undefined;
  sameLanguage: boolean;
  nowMs: number;
}): boolean {
  if (input.audioMode !== "voice" || !input.translationStarted || input.sameLanguage) return false;
  if (input.leg !== "raw-mic" || typeof input.legSinceMs !== "number") return false;
  return input.nowMs - input.legSinceMs >= RAW_MIC_NOTICE_AFTER_MS;
}

/** The main.log line for a change of what Meet hears. */
export function describeOutboundLegChange(leg: BridgeOutboundLeg, outboundIdentity: string | null): string {
  switch (leg) {
    case "dub":
      return `[bridge] Meet now hears the translated voice (${outboundIdentity ?? "dub"})`;
    case "raw-mic":
      return "[bridge] Meet now hears the untranslated microphone: no translated voice is on the wire";
    case "none":
      return "[bridge] Meet now hears nothing from WarpTalk";
  }
}

// ── what this person hears of Meet ──────────────────────────────────────────

/**
 *   dub              the Meet side's translated voice is being played to this person
 *   no-dub           it should be — voice on, translation running, another language — and no such
 *                    dub is on the wire: nothing has been said yet, the bot is between sentences,
 *                    or the pipeline is not producing it
 *   text             "You hear" is on Text: dubs are not played to this person
 *   not-translating  no translation session is running
 *   same-language    the Meet side speaks the language this person listens in: nothing to dub
 */
export type BridgeInboundDub = "dub" | "no-dub" | "text" | "not-translating" | "same-language";

/** One dub of the Meet side that is in the room, in whichever language and voice it was rendered. */
export type BridgeInboundDubTrack = {
  identity: string;
  /** This listener's routing keeps it (room-audio-routing). */
  wanted: boolean;
  /** Its media is arriving: a wanted publication with no track yet plays nothing. */
  subscribed: boolean;
};

export type BridgeInboundDubReport = {
  translationActive: boolean;
  /** This person's "You hear" switch: Voice (true) or Text (false). */
  voiceEnabled: boolean;
  listenLanguage: string;
  /** The stand-in's speak language, or null while it is not known. */
  farSideLanguage: string | null | undefined;
  /** Every dub of the stand-in in the room — see isDubOfSpeaker. */
  tracks: readonly BridgeInboundDubTrack[];
};

/**
 * Whether `identity` is an interpreter bot dubbing `speakerId`, in ANY language or voice
 * (`ai-interpreter-{lang}-{speakerId}`, `ai-interpreter-{lang}-voice-{id8}-{speakerId}`). Any
 * language on purpose: a dub of the Meet side in a language this person does not listen in is
 * exactly what "none is on the wire" would otherwise hide.
 */
export function isDubOfSpeaker(identity: string, speakerId: string): boolean {
  return identity.startsWith(AI_INTERPRETER_PREFIX) && identity.endsWith(`-${speakerId}`);
}

/** The Meet side's dub this person is actually being played, or null. */
function playingInboundDub(report: BridgeInboundDubReport): string | null {
  return report.tracks.find((track) => track.wanted && track.subscribed)?.identity ?? null;
}

export function bridgeInboundDub(report: BridgeInboundDubReport): BridgeInboundDub {
  if (!report.translationActive) return "not-translating";
  if (!report.voiceEnabled) return "text";
  if (playingInboundDub(report)) return "dub";
  if (report.farSideLanguage && report.farSideLanguage === report.listenLanguage) return "same-language";
  return "no-dub";
}

/**
 * The main.log line for what this person hears of the Meet side. The same report gives the same
 * line, so the caller logs when the line changes and not on every render.
 */
export function describeInboundDubChange(report: BridgeInboundDubReport): string {
  const language = report.listenLanguage;
  const headline = (() => {
    switch (bridgeInboundDub(report)) {
      case "dub":
        return `You now hear the Meet side's translated voice (${playingInboundDub(report)})`;
      case "no-dub":
        return `You hear no translated voice of the Meet side: none is on the wire in "${language}"`;
      case "text":
        return 'You hear no translated voice of the Meet side: "You hear" is on Text';
      case "not-translating":
        return "You hear no translated voice of the Meet side: translation is not running";
      case "same-language":
        return `You hear no translated voice of the Meet side: it speaks the language you listen in ("${language}")`;
    }
  })();
  const tracks = report.tracks.length
    ? report.tracks
        .map((track) => {
          if (!track.wanted) return `${track.identity} not wanted`;
          return `${track.identity} wanted, ${track.subscribed ? "subscribed" : "not subscribed"}`;
        })
        .join("; ")
    : "none";
  return (
    `[bridge] ${headline} ` +
    `[voice ${report.voiceEnabled ? "on" : "off"}, translation ${report.translationActive ? "running" : "not running"}, ` +
    `listening in "${language}"; Meet-side dubs in the room: ${tracks}]`
  );
}
