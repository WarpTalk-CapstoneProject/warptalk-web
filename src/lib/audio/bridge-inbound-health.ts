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
 * WHY ZEROS ARE ONLY EVER A SOFT "NOT YET"
 *   Exact digital zeros are what a disconnected or mis-clocked cable produces — but they are ALSO
 *   what a perfectly healthy cable carries while Meet is playing nothing. A virtual cable has no
 *   analogue stage and so no noise floor: a host alone in the call waiting for the other side, or a
 *   far side that joined muted, reads as an unbroken run of 0.0 through a working bridge. So zeros
 *   alone can never prove the bridge is broken. What they can say, before anything has ever come
 *   through, is "nothing from Meet yet" — worded as a question the user can answer ("is anyone
 *   talking?"), not as a fault. Once something HAS come through, the bridge demonstrably carried,
 *   and zeros afterwards are a meeting gone quiet: the state stays "quiet" however long they last.
 *   A merely quiet (non-zero) signal never warns at all; warning on quiet would fire in every pause
 *   and teach the user to ignore the note that matters.
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
 * How long a fresh capture may carry nothing but exact zeros before the widget says "No sound from
 * Meet yet". Long enough to cover joining the call and the first silence before anyone speaks.
 * Measured from the first sample the probe actually took (see `firstSampleAtMs`), not from open:
 * a context the browser kept suspended measured nothing, and time it spent measuring nothing must
 * not count as time spent hearing silence.
 */
export const NO_SIGNAL_AFTER_OPEN_MS = 50_000;
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
  /**
   * When the first sample of this capture was reduced, or null before any. The probe reports only
   * while its AudioContext is running, so this is the first moment anything was actually measured —
   * the grace period starts here and a capture held suspended for a minute does not arrive at its
   * first real sample already "overdue".
   */
  firstSampleAtMs: number | null;
  /** Any block that was not exact zeros — quiet counts: a noise floor proves the cable carries. */
  heardAnything: boolean;
  /** Last block loud enough to count as signal, for the Listening hold. */
  lastSignalAtMs: number | null;
  /** Start of the current unbroken run of exact-zero blocks, or null when the last block had anything. */
  zeroSinceMs: number | null;
}

/** A fresh state for a capture. One per capture: a new device, or a reopened one, starts over. */
export function createInboundHealthState(): InboundHealthState {
  return {
    health: "unknown",
    firstSampleAtMs: null,
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
  const firstSampleAtMs = state.firstSampleAtMs ?? nowMs;
  const graceOver = nowMs - firstSampleAtMs >= NO_SIGNAL_AFTER_OPEN_MS;

  let health: InboundHealth;
  // Only before anything was ever heard (see the header): after that, zeros are a quiet meeting.
  const noSignal = options.path === "device" && !heardAnything && graceOver;
  if (noSignal) {
    health = "no-signal";
  } else if (lastSignalAtMs !== null && nowMs - lastSignalAtMs < LISTENING_HOLD_MS) {
    health = "listening";
  } else if (heardAnything) {
    health = "quiet";
  } else if (options.path === "loopback" && graceOver) {
    // Loopback zeros are silence, not a fault (see header): after the same grace a device gets,
    // call it what it is instead of leaving the row undecided for the whole meeting.
    health = "quiet";
  } else {
    health = "unknown";
  }

  return { health, firstSampleAtMs, heardAnything, lastSignalAtMs, zeroSinceMs };
}

/**
 * The lead of the "no-signal" note, shared by the in-app widget and the popup. "Yet", because
 * no-signal only exists before anything was heard and a healthy cable in an empty call reads the
 * same (see the header): the copy has to stay true when nothing is wrong.
 */
export const INBOUND_NO_SIGNAL_TITLE = "No sound from Meet yet";

/**
 * What to tell the user when the device path reports "no-signal". Shared by the in-app widget and
 * the popup so the two never give different advice for the same fault.
 *
 * Opens with the condition under which the advice applies — someone actually talking in Meet —
 * because the same zeros come from a call where nobody has spoken, and that user has nothing to fix.
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
  const lead = "If someone is talking in Meet, ";
  const pick = speaker
    ? `${lead}check that Meet's Speakers are set to “${speaker}”.`
    : `${lead}check Meet's Speakers setting.`;
  if (labels.platform !== "windows" || !labels.meetSpeaker || !labels.inboundCapture) return pick;
  return `${pick} In Windows sound settings, give ${labels.meetSpeaker} and ${labels.inboundCapture} the same format (24-bit, 48000 Hz).`;
}
