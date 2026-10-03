/**
 * The Google Meet call's sound, as one track the bridge recording can mix. The pure half.
 *
 * WHY A TRACK OF ITS OWN
 *   A bridge recording came out as digital silence from 1.1 s to the end (production, 2026-10-03)
 *   while the user was talking in Meet. The recorder mixed what WarpTalk publishes, and the user's
 *   voice there is their WarpTalk microphone: an STT tap that starts off in a bridge, follows the
 *   Meet mute sensor, mute-on-entry and force-mute, and is held silent by the half-duplex gate
 *   while a dub plays. None of that is "what the Meet call heard", which is what a recording of
 *   the call has to contain. See egress-participants.ts (MEET_AUDIO_TRACK_NAME) for the template
 *   half.
 *
 * WHAT IS IN IT
 *   far side   the inbound leg's track (bridge-inbound-connection): Meet's playback, captured by
 *              process loopback (text-only and voice) or by the cable, whichever this bridge
 *              already uses. Borrowed, never re-captured, never stopped here.
 *   this user  their microphone, opened once more for the recording so no WarpTalk mute or gate
 *              reaches it, and switched by what MEET says about their microphone (below).
 *
 * Relative imports with the extension: the unit tests run under the plain node test runner.
 */

import type { MeetFollowState } from "./bridge-meet-follow.ts";

/**
 * Published only while there is a bridge recording to put it in and this window is the one
 * capturing the far side (`inboundOpen` already means "bridge audio owner, listening, leg up").
 * Unlike the Meet window it does not follow the Meet tab: the call goes on sounding in PiP or
 * behind another tab, and the recording must go on hearing it.
 */
export function shouldPublishMeetAudio(input: {
  isBridgeRoom: boolean;
  inboundOpen: boolean;
  recording: boolean;
  starting: boolean;
}): boolean {
  return input.isBridgeRoom && input.inboundOpen && (input.recording || input.starting);
}

/**
 * Whether this user's own voice belongs in the recording right now: whether MEET is sending it.
 *
 *   lobby / left               no: they are not in the call.
 *   Meet's button read muted   no: nobody in the call heard them, so neither does the file.
 *   Meet's button read on      yes, whatever WarpTalk's own microphone is doing (off by default
 *                              in a bridge, mute-on-entry, force-mute, the half-duplex gate).
 *   never read                 follow the WarpTalk microphone: an older desktop or macOS cannot
 *                              read Meet, and the popup's chip is then the user's stated intent.
 *
 * `meetMuted` is the last FRESH reading (reduceMeetFollow drops stale and unreadable ones), so a
 * sensor that goes quiet mid-call keeps the last answer instead of flapping.
 */
export function meetAudioLocalVoiceOn(input: {
  believed: MeetFollowState["believed"];
  meetMuted: MeetFollowState["meetMuted"];
  warptalkMicrophoneEnabled: boolean;
}): boolean {
  if (input.believed === "lobby" || input.believed === "left") return false;
  if (input.meetMuted === true) return false;
  if (input.meetMuted === false) return true;
  return input.warptalkMicrophoneEnabled;
}

/**
 * How the recording's copy of the microphone is opened: the device the meeting uses (`ideal`, as
 * microphoneRoomOptions does, so an unplugged headset falls back instead of throwing), with the
 * browser's echo cancellation ON. Unlike the far-side capture this IS a person at a microphone, and
 * cancellation is what keeps WarpTalk's own playback in this window (the dubs) from being recorded
 * a second time through the speakers.
 */
export function meetAudioMicrophoneConstraints(selectedMicrophoneId: string): MediaTrackConstraints {
  return {
    ...(selectedMicrophoneId ? { deviceId: { ideal: selectedMicrophoneId } } : {}),
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  };
}

/** Seconds for the microphone's gain to follow a Meet mute: quick, but no click. */
export const MEET_AUDIO_LOCAL_RAMP_S = 0.03;

// ── Echo: the far side heard twice ───────────────────────────────────────────

/**
 * WHY THE MIC COPY IS DUCKED WHILE THE FAR SIDE TALKS
 *   On laptop speakers the microphone hears Meet's playback of the far side. That playback comes
 *   from another process (Chrome), so this window's echo canceller has no reference for it and
 *   cannot remove it. The far side then reaches `meet-audio` twice: clean through the loopback, and
 *   again, delayed and roomy, through the microphone.
 *
 *   We do have the reference, though: the loopback IS Meet's playback. So the same idea as the
 *   half-duplex gate (half-duplex-mic.tsx) applies, with an exact signal: while the inbound leg
 *   carries sound (a plain energy VAD, MEET_AUDIO_FAR_SPEECH_DBFS) and for a short hang after it
 *   (the room's tail, Meet's jitter buffer), the microphone copy is ducked to MEET_AUDIO_DUCK_GAIN.
 *   When only the user speaks, the loopback is silent and their voice is at full level.
 *
 * THE TRADE-OFF: DOUBLE TALK
 *   When both sides talk at once, the user is ducked too (about -16 dB), so in overlaps the user is
 *   quieter than the far side in the file. A duck rather than a hard gate on purpose: their words
 *   stay audible in an overlap, while the echo (already 10-20 dB down acoustically) falls about
 *   another 16 dB under the clean loopback copy, where it is masked. On a headset there is no echo
 *   and the duck only costs that overlap level. The first tens of milliseconds of each far-side
 *   phrase can leak before the VAD sees it (one analyser window plus one tick).
 */
export const MEET_AUDIO_FAR_SPEECH_DBFS = -50;
/** How long the duck holds after the far side falls silent. */
export const MEET_AUDIO_FAR_SPEECH_HANG_MS = 400;
/** The microphone copy's gain while the far side is sounding (about -16 dB). */
export const MEET_AUDIO_DUCK_GAIN = 0.15;
/**
 * How often the far side's level is measured, on a main-thread timer.
 *
 * ASSUMPTION, WITH ITS EVIDENCE: this runs only in the desktop app's main window (a bridge needs
 * the desktop), which warptalk-desktop creates with `backgroundThrottling: false`
 * (src/main/index.ts, the main BrowserWindow's webPreferences, with the reason: "This window does
 * realtime audio work while nobody is looking at it"). So the timer keeps its 20 ms while the
 * window sits hidden behind Meet. In a throttled page it would slow to ~1 s and the duck would
 * lag the far side by up to a second; an AudioWorklet would be the fix if this ever ran there.
 */
export const MEET_AUDIO_VAD_TICK_MS = 20;

export interface FarSpeechState {
  /** When the inbound leg last measured above the threshold; null if never. */
  lastSoundAtMs: number | null;
}

export const INITIAL_FAR_SPEECH: FarSpeechState = { lastSoundAtMs: null };

export function reduceFarSpeech(
  state: FarSpeechState,
  sample: { dbfs: number; nowMs: number },
): FarSpeechState {
  return sample.dbfs >= MEET_AUDIO_FAR_SPEECH_DBFS ? { lastSoundAtMs: sample.nowMs } : state;
}

export function farSpeechActive(state: FarSpeechState, nowMs: number): boolean {
  return state.lastSoundAtMs !== null && nowMs - state.lastSoundAtMs <= MEET_AUDIO_FAR_SPEECH_HANG_MS;
}

/** The microphone copy's gain: off when Meet is not sending the user, ducked under the far side. */
export function meetAudioMicGain(input: { localVoiceOn: boolean; farSpeechActive: boolean }): number {
  if (!input.localVoiceOn) return 0;
  return input.farSpeechActive ? MEET_AUDIO_DUCK_GAIN : 1;
}

// ── The microphone copy coming back ──────────────────────────────────────────

/** At most this many reopens of an ended microphone per minute: a device that dies on open is broken. */
export const MEET_AUDIO_MIC_REOPENS_PER_MINUTE = 3;

/**
 * Whether an ended microphone copy (unplugged, driver restart) is reopened now. Same bound the
 * inbound leg uses for its own track, for the same reason: no tight loop on a dead device.
 */
export function shouldReopenMeetAudioMic(
  recentReopensMs: readonly number[],
  nowMs: number,
): { reopen: boolean; recent: number[] } {
  const recent = recentReopensMs.filter((at) => nowMs - at < 60_000);
  if (recent.length >= MEET_AUDIO_MIC_REOPENS_PER_MINUTE) return { reopen: false, recent };
  return { reopen: true, recent: [...recent, nowMs] };
}

/**
 * Which devices to try, in order, when (re)opening the microphone copy: the meeting's current
 * device, then the browser default. `ideal` already falls back for a device that is gone, but a
 * device that is present and refuses (busy, driver fault) needs the explicit second try.
 */
export function meetAudioMicrophoneCandidates(deviceId: string): string[] {
  return deviceId && deviceId !== "default" ? [deviceId, ""] : [""];
}

// ── Who wins, what is up, how long to wait ───────────────────────────────────

/**
 * Only the latest request wins. A microphone (re)open can be asked for again while an older one
 * is still in getUserMedia (a device switch right after an unplug); the older result must be
 * stopped and discarded when it lands, not connected over the newer one.
 */
export function createLatestRequest(): { begin: () => number; isLatest: (token: number) => boolean } {
  let latest = 0;
  return {
    begin: () => (latest += 1),
    isLatest: (token) => token === latest,
  };
}

/** How long the publisher waits for the microphone attribute before publishing anyway. */
export const MEET_AUDIO_ATTRIBUTE_TIMEOUT_MS = 1_500;

/** Waits for `promise` at most `ms`: what happened, never a throw. */
export async function settleWithin(
  promise: Promise<unknown>,
  ms: number,
): Promise<{ outcome: "ok" } | { outcome: "timeout" } | { outcome: "error"; error: unknown }> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<{ outcome: "timeout" }>((resolve) => {
    timer = setTimeout(() => resolve({ outcome: "timeout" }), ms);
  });
  try {
    return await Promise.race([
      promise.then(
        () => ({ outcome: "ok" as const }),
        (error: unknown) => ({ outcome: "error" as const, error }),
      ),
      timeout,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Whether `meet-audio` is really on the wire. A mix in memory is not enough: the publication can
 * go away under it (unpublished by the SFU, a reconnect that did not carry it back) while the mix
 * stays, and the supervisor was then told "published" for a track nobody could subscribe to.
 *
 *   none       no mix: publish one.
 *   published  the mix's publication is one the local participant still has.
 *   stale      a mix whose publication is gone: tear it down and publish again.
 */
export function meetAudioPublishState(input: {
  hasMix: boolean;
  publishedTrackSid: string | null;
  localTrackSids: Iterable<string>;
}): "none" | "published" | "stale" {
  if (!input.hasMix) return "none";
  if (!input.publishedTrackSid) return "stale";
  for (const sid of input.localTrackSids) if (sid === input.publishedTrackSid) return "published";
  return "stale";
}
