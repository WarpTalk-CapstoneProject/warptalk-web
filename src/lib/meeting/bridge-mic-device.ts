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
 * Relative imports with the extension: the unit tests run under the plain node test runner.
 */

import type { BridgeAudioMode } from "./bridge-audio-mode.ts";

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
