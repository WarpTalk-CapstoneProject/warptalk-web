/**
 * Letting the host hear the far side once Google Meet stops playing it to them.
 *
 * When the inbound leg rides a virtual device, the host has pointed Meet's SPEAKER at that device
 * (Hi-Fi Cable on Windows, WarpTalk Speaker or BlackHole 16ch on macOS). Meet then plays the call
 * into the cable and nothing into the host's headphones: WarpTalk hears the meeting, and the host
 * does not. The raw stand-in track is deliberately never subscribed from the room
 * (room-audio-routing), so without this the host of a two-cable bridge sits in silence whenever
 * "Text only" is on.
 *
 * The captured track is played locally rather than subscribed back from LiveKit: it is already in
 * this page, so there is no SFU round trip, and it does not pull a second copy over the network.
 *
 * DUCKING
 *   Handing the host's ears to WarpTalk is also what makes ducking possible at all. On the loopback
 *   path it is not: loopback captures after the browser's session volume, so lowering Meet in the
 *   mixer lowers what WarpTalk hears too (measured — muting Chrome delivered zero chunks). Here the
 *   capture is taken before this gain, so the original can sit under the translation while the
 *   pipeline still receives it at full level. The popup's Voice panel sets how far it drops.
 *
 * NOT ON THE LOOPBACK PATH
 *   There Meet still plays into the host's real speakers, so a local copy would be the same voice
 *   twice, a few milliseconds apart.
 */

import type { BridgeInboundSource } from "./bridge-inbound-connection.ts";

/** Original at full level: nothing is being played over it. */
export const FAR_SIDE_MONITOR_FULL = 1;
/** Original under the translation, by default: still audible, so the host can tell who is speaking and how. */
export const FAR_SIDE_MONITOR_UNDER_DUB = 0.3;

/** A level the host may choose, bounded to silent..full. Anything unreadable falls back to the default. */
export function clampMeetingAudioLevel(level: number): number {
  if (!Number.isFinite(level)) return FAR_SIDE_MONITOR_UNDER_DUB;
  return Math.min(FAR_SIDE_MONITOR_FULL, Math.max(0, level));
}

/**
 * How loud the far side's original voice is, given whether this listener hears dubs.
 *
 * `underDub` is the host's choice from the Voice panel; it applies only while dubs play, because
 * with Text only there is nothing to sit under and the original is all the host hears.
 */
export function farSideMonitorGain(
  voiceEnabled: boolean,
  underDub: number = FAR_SIDE_MONITOR_UNDER_DUB,
): number {
  return voiceEnabled ? clampMeetingAudioLevel(underDub) : FAR_SIDE_MONITOR_FULL;
}

/** Only a device source took the meeting's audio away from the host's own speakers. */
export function shouldMonitorFarSide(kind: BridgeInboundSource["kind"]): boolean {
  return kind === "device";
}

export interface FarSideMonitor {
  setGain: (gain: number) => void;
  /** Releases the audio graph. Never stops the track, which the publisher owns. Safe to repeat. */
  stop: () => Promise<void>;
}

/** Seconds for a gain change to settle, so a toggle ramps instead of clicking. */
const GAIN_RAMP_SECONDS = 0.15;

export function startFarSideMonitor(track: MediaStreamTrack, gain: number): FarSideMonitor {
  const context = new AudioContext();
  const source = context.createMediaStreamSource(new MediaStream([track]));
  const volume = context.createGain();
  volume.gain.value = gain;
  source.connect(volume).connect(context.destination);
  // Created from inside an async effect, which may be outside the gesture that unlocked audio.
  void context.resume().catch(() => undefined);

  let stopped = false;
  return {
    setGain: (next) => {
      if (stopped) return;
      volume.gain.setTargetAtTime(next, context.currentTime, GAIN_RAMP_SECONDS);
    },
    stop: async () => {
      if (stopped) return;
      stopped = true;
      source.disconnect();
      volume.disconnect();
      try {
        await context.close();
      } catch {
        // Already closed.
      }
    },
  };
}
