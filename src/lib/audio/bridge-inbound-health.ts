/**
 * Is anything actually reaching WarpTalk from the Meet side of a bridged call?
 *
 * WHY THIS EXISTS
 *   The inbound leg can be open, published and "working" by every signal the app has while
 *   carrying nothing at all. On Windows the two usual causes are both outside WarpTalk: Meet's
 *   Speakers left on the laptop speakers instead of "Hi-Fi Cable Input", or the cable's two ends
 *   set to different formats (a sample-rate mismatch makes the virtual cable pass pure digital
 *   silence). Either way the transcript simply stays empty for the far side, which reads as "they
 *   have not said anything yet" rather than as a broken bridge — until someone notices ten minutes
 *   in. The widget can only say so if something measures the track.
 *
 * WHY "DIGITAL ZERO" AND NOT "QUIET"
 *   A real capture of a real room is never exactly zero: even a muted Meet call through a working
 *   cable carries dither and noise floor. Every sample being exactly 0.0 is what a disconnected or
 *   mis-clocked cable produces. So the warning keys on exact zeros, and a merely quiet signal — a
 *   meeting where nobody is talking — never warns. Warning on quiet would fire in every pause and
 *   teach the user to ignore the one warning that matters.
 *
 * WHY THE LOOPBACK PATH NEVER WARNS
 *   Windows process loopback (`WindowsLoopbackPcmTrackBridge`) produces exact zeros legitimately
 *   whenever the browser is playing nothing — the PCM comes from the process's render stream, and
 *   no render is no samples. Digital zero there means "silence", not "broken", so that path is
 *   metered for the Listening/Quiet detail and nothing more.
 *
 * Pure on purpose: the timing rules are the part worth testing, and they must not depend on an
 * AudioContext or a clock the test cannot drive. `bridge-inbound-level-probe` feeds it.
 */

import type { BridgeDeviceLabels } from "./virtual-bridge-check";

export type InboundLevelClass = "digital-zero" | "quiet" | "signal";

export type InboundHealth = "unknown" | "listening" | "quiet" | "no-signal";

/** Which inbound mechanism is being measured; see the header for why they are judged differently. */
export type InboundCapturePath = "device" | "loopback";

export interface InboundLevelSample {
  /** RMS of the analysed block in dBFS; -Infinity for a block of exact zeros. */
  rmsDbfs: number;
  /** Largest absolute sample value in the block, 0..1. */
  peakAbs: number;
  /** Every sample in the block was exactly 0. */
  allZero: boolean;
}

/** Below this the block counts as quiet, not as someone talking. Room tone through a cable sits well under it. */
export const QUIET_THRESHOLD_DBFS = -60;
/**
 * How long a freshly opened capture may carry nothing but exact zeros before the widget says so.
 * Long enough to cover joining the call and the first silence before anyone speaks — a working
 * cable still carries a noise floor in that time, so waiting costs nothing on a healthy bridge.
 */
export const NO_SIGNAL_AFTER_OPEN_MS = 50_000;
/**
 * Once something HAS come through, the bridge demonstrably worked. Going back to exact zeros is
 * then far more likely to be the user changing Meet's speaker, or Meet ending, than a broken
 * cable — so the bar for saying so is much higher.
 */
export const NO_SIGNAL_AFTER_HEARD_MS = 5 * 60_000;
/**
 * How long "Listening" is held after the last block with signal. Speech is full of gaps a quarter
 * of a second long; without the hold the detail would flicker between Listening and Quiet on
 * every breath.
 */
export const LISTENING_HOLD_MS = 3_000;

export function classifyLevel(sample: InboundLevelSample): InboundLevelClass {
  if (sample.allZero || sample.peakAbs === 0) return "digital-zero";
  if (!(sample.rmsDbfs >= QUIET_THRESHOLD_DBFS)) return "quiet";
  return "signal";
}

export interface InboundHealthState {
  health: InboundHealth;
  /** When this capture opened. Every timing rule is measured from here or from a later event. */
  openedAtMs: number;
  /** Any block that was not exact zeros — quiet counts: a noise floor proves the cable carries. */
  heardAnything: boolean;
  /** Last block loud enough to count as signal, for the Listening hold. */
  lastSignalAtMs: number | null;
  /** Start of the current unbroken run of exact-zero blocks, or null when the last block had anything. */
  zeroSinceMs: number | null;
}

/** A fresh state for a capture that opened at `openedAtMs`. One per capture: a new device starts over. */
export function createInboundHealthState(openedAtMs: number): InboundHealthState {
  return {
    health: "unknown",
    openedAtMs,
    heardAnything: false,
    lastSignalAtMs: null,
    zeroSinceMs: null,
  };
}

export function reduceInboundHealth(
  state: InboundHealthState,
  sample: InboundLevelSample,
  nowMs: number,
  options: { path: InboundCapturePath },
): InboundHealthState {
  const level = classifyLevel(sample);
  const heardAnything = state.heardAnything || level !== "digital-zero";
  const lastSignalAtMs = level === "signal" ? nowMs : state.lastSignalAtMs;
  const zeroSinceMs = level === "digital-zero" ? (state.zeroSinceMs ?? nowMs) : null;

  let health: InboundHealth;
  const noSignal =
    options.path === "device" &&
    (heardAnything
      ? zeroSinceMs !== null && nowMs - zeroSinceMs >= NO_SIGNAL_AFTER_HEARD_MS
      : nowMs - state.openedAtMs >= NO_SIGNAL_AFTER_OPEN_MS);
  if (noSignal) {
    health = "no-signal";
  } else if (lastSignalAtMs !== null && nowMs - lastSignalAtMs < LISTENING_HOLD_MS) {
    health = "listening";
  } else if (heardAnything) {
    health = "quiet";
  } else if (options.path === "loopback" && nowMs - state.openedAtMs >= NO_SIGNAL_AFTER_OPEN_MS) {
    // Loopback zeros are silence, not a fault (see header): after the same grace a device gets,
    // call it what it is instead of leaving the row undecided for the whole meeting.
    health = "quiet";
  } else {
    health = "unknown";
  }

  return { health, openedAtMs: state.openedAtMs, heardAnything, lastSignalAtMs, zeroSinceMs };
}

/**
 * What to tell the user when the device path reports "no-signal". Shared by the in-app widget and
 * the popup so the two never give different advice for the same fault.
 *
 * Names the two settings that cause it, both outside WarpTalk, rather than "check your audio": the
 * user is looking at Meet's settings when they read this and needs the exact entry to pick. The
 * format half is Windows only — the two ends of a Hi-Fi Cable are separate endpoints that can be
 * set to different sample rates, and a mismatch is precisely what makes the cable pass digital
 * silence. BlackHole on a Mac is one duplex device with nothing to mismatch.
 */
export function inboundNoSignalHint(
  labels: Pick<BridgeDeviceLabels, "meetSpeaker" | "inboundCapture" | "platform">,
): string {
  const speaker = labels.meetSpeaker ?? labels.inboundCapture;
  const pick = speaker ? `In Meet, set Speakers to “${speaker}”.` : "Check Meet's Speakers setting.";
  if (labels.platform !== "windows" || !labels.meetSpeaker || !labels.inboundCapture) return pick;
  return `${pick} In Windows sound settings, give ${labels.meetSpeaker} and ${labels.inboundCapture} the same format (24-bit, 48000 Hz).`;
}
