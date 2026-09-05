import { Room, LocalAudioTrack, RoomEvent, type DisconnectReason } from "livekit-client";
import { captureFarSideAudio } from "./bridge-audio-legs";

/**
 * WT-525 — the inbound leg of an external-bridge meeting.
 *
 * The far side of the Google Meet call is captured from the virtual speaker Meet plays into, and
 * published into the WarpTalk room as a SECOND LiveKit connection.
 *
 * WHY A SECOND CONNECTION AND NOT A SECOND TRACK
 *   The whole pipeline routes on participant identity — `stt_worker` reads `speaker_id` straight
 *   off `participant_identity`. Publishing the far side as another track on the host's own
 *   connection would attribute their speech to the host: transcribed under the host's name, run
 *   through the host's source language, and dubbed in the host's cloned voice. The stand-in seat
 *   exists precisely so the far side is somebody, and it only becomes real by being connected to.
 *
 *   The token for it cannot be obtained the ordinary way — every other endpoint derives identity
 *   from the authenticated caller — so it comes from `meetings/rooms/{id}/bridge-token`, which is
 *   gated on the caller being the host AND the room being a bridge.
 *
 * PUBLISH-ONLY, DELIBERATELY
 *   `autoSubscribe: false`. The stand-in has nothing to listen to, and subscribing it would pull
 *   the room's own dub tracks down a connection whose audio is being played into the device Meet
 *   is listening to — the far side would hear the translation of their own words looping back.
 *   That is a feedback path, not a wasted subscription.
 */

export interface BridgeInboundHandles {
  /** The second connection, already publishing. Exposed for status, not for callers to drive. */
  room: Room;
  /** Stops capture and disconnects. Safe to call more than once. */
  stop: () => Promise<void>;
}

/**
 * Where the far side's audio comes from.
 *
 * Two shapes, because the two Windows paths do not look alike. A virtual device has an endpoint we
 * can open by id; process loopback has no endpoint at all — the track is built from PCM the main
 * process forwards, and by the time it reaches here it already exists.
 *
 * The distinction that matters below is OWNERSHIP. A track we opened is ours to close; a track
 * handed to us belongs to whoever built it, and stopping it would tear down an AudioContext this
 * module never created and cannot rebuild.
 */
export type BridgeInboundSource =
  | { kind: "device"; deviceId: string }
  | { kind: "track"; track: MediaStreamTrack };

export async function openBridgeInbound(options: {
  /** LiveKit server URL — the same one the host's own connection uses. */
  serverUrl: string;
  /** Publish-only token for the stand-in identity, from `meetingService.bridgeToken`. */
  token: string;
  /** Where the far side's audio comes from — a virtual device, or a track already assembled. */
  source: BridgeInboundSource;
  /** Called when the second connection drops on its own, so the UI can stop claiming it is bridged. */
  onDisconnected?: (reason?: DisconnectReason) => void;
}): Promise<BridgeInboundHandles> {
  // Capture BEFORE connecting. A failure here — device unplugged, permission withdrawn — should
  // leave no half-open room behind: a connected stand-in publishing nothing looks exactly like a
  // working bridge with a silent far side, which is the hardest version of this to diagnose.
  //
  // A borrowed track is already open, so there is nothing to fail here and nothing to release
  // later; `ownsTrack` carries that difference to every teardown path below.
  const ownsTrack = options.source.kind === "device";
  const mediaTrack =
    options.source.kind === "device"
      ? await captureFarSideAudio(options.source.deviceId)
      : options.source.track;

  const room = new Room();
  let stopped = false;

  const stop = async () => {
    if (stopped) return;
    stopped = true;
    if (ownsTrack) mediaTrack.stop();
    try {
      await room.disconnect();
    } catch {
      // Already gone. Nothing to release that stopping the track has not released.
    }
  };

  room.on(RoomEvent.Disconnected, (reason) => {
    // The connection can end without anyone calling stop() — a token expiring, the SFU evicting
    // the participant, the network going away. Release the device in that case too: a held
    // capture keeps the virtual device busy, and the next attempt then fails for a different
    // reason than the real one.
    //
    // A borrowed track is left alone: its owner may still be feeding it, and killing it here would
    // strand them with a dead track they never closed.
    if (!stopped) {
      stopped = true;
      if (ownsTrack) mediaTrack.stop();
    }
    options.onDisconnected?.(reason);
  });

  try {
    await room.connect(options.serverUrl, options.token, { autoSubscribe: false });
    await room.localParticipant.publishTrack(new LocalAudioTrack(mediaTrack), {
      // The far side is a conference feed, not a person at a microphone. Every enhancement that
      // helps a real mic hurts here — and echo cancellation in particular would treat the
      // outbound dub as echo and gate away exactly the audio this leg exists to carry.
      dtx: false,
      red: true,
    });
  } catch (error) {
    await stop();
    throw error;
  }

  return { room, stop };
}
