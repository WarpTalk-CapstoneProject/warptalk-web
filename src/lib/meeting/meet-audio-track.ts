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
