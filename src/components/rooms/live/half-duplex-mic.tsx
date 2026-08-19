"use client";

import { useEffect, useRef } from "react";
import { ParticipantEvent, RoomEvent, Track, type RemoteParticipant } from "livekit-client";
import { useMaybeRoomContext } from "@livekit/components-react";

/**
 * Stops the microphone carrying the room's own translation back into the room.
 *
 * THE DEFECT THIS EXISTS FOR
 *   A listener hears the far side's dub through their SPEAKERS. Their microphone picks that dub
 *   up, publishes it, and the pipeline transcribes it — attributed to THEM, because it arrived on
 *   their track. In a live session that produced a transcript of short Vietnamese fragments
 *   ("vườn.", "Đơn giản.", "Trong.", "Ừ.") credited to a person who had not spoken, while the
 *   other participant was speaking English.
 *
 *   It does not stop there. `stt_worker` learns a per-speaker language override when speech
 *   contradicts the declared language, and those fragments are exactly such evidence — so the
 *   listener gets pinned to the dub's language. Once source and target match, nothing is
 *   translated at all. The reported "it worked for a while and then stopped translating" is the
 *   second half of this same loop.
 *
 * WHY NOT LEAVE IT TO ECHO CANCELLATION
 *   Browser AEC is modelled on a near-field talker and a modest speaker, and it is applied
 *   BEFORE the signal is loud enough to matter. Synthesised speech at conversational volume
 *   through laptop speakers routinely defeats it. Every conferencing product that plays audio
 *   into a room has some form of this gate; ours can be exact, because we know precisely which
 *   tracks are ours and when they are sounding.
 *
 * HOW IT GATES, AND WHY THIS PRIMITIVE
 *   `mediaStreamTrack.enabled = false` — not LiveKit's publication toggle, and not the LiveKit
 *   track's own mute.
 *
 *   Unpublishing would change `microphoneTrackSid`, which re-runs the Krisp/track-processor
 *   effect and re-attaches a noise filter several times a minute. Muting through LiveKit would
 *   broadcast the user as muted and flip the mic button in everyone's roster, several times a
 *   minute, for something that is not a mute.
 *
 *   Disabling the underlying track sends silence and touches nothing else: the publication
 *   stays, the SFU keeps routing, the ingress worker's VAD sees silence and never opens a chunk,
 *   and no UI anywhere changes. It is the smallest thing that removes the audio.
 *
 * THE TRADE-OFF, STATED
 *   This is half duplex: while a dub is sounding, this microphone is not heard. Talking over the
 *   translation is what stops working. That is the accepted cost — in a translated meeting people
 *   already wait for the dub, and the alternative on speakers is a transcript of words nobody
 *   said and a language that silently stops translating.
 *
 *   The hangover is deliberately short so a reply lands naturally rather than after a pause.
 */

/**
 * How long after the dub falls silent before the microphone is live again.
 *
 * Long enough to ride out the gaps between sentences of one dubbed utterance — reopening inside
 * them would let exactly the fragments this prevents back through. Short enough that answering
 * does not feel gated.
 */
const RELEASE_HANGOVER_MS = 450;

export function HalfDuplexMic({
  dubIdentities,
  enabled,
}: {
  /** Interpreter identities currently being played to this listener's own output. */
  dubIdentities: string[];
  /** False in a room with no pipeline running — there are no dubs, so there is nothing to gate. */
  enabled: boolean;
}) {
  const room = useMaybeRoomContext();

  // Read through refs so a changing dub list does not tear down and rebuild the listeners on
  // every render — the identity set changes whenever an interpreter bot appears or leaves.
  const dubIdentitiesRef = useRef(dubIdentities);
  // Synced in an effect, not during render. The listeners below read this ref rather than closing
  // over the prop so that a dub bot appearing or leaving does not tear down and rebuild every
  // subscription — but writing a ref while rendering is the thing that makes a component fail to
  // update, so the write belongs here.
  useEffect(() => {
    dubIdentitiesRef.current = dubIdentities;
  }, [dubIdentities]);

  /** True only while WE are holding the microphone down, so a user's own mute is never touched. */
  const gatedRef = useRef(false);
  const releaseTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!room || !enabled) return;

    const clearRelease = () => {
      if (releaseTimerRef.current !== null) {
        window.clearTimeout(releaseTimerRef.current);
        releaseTimerRef.current = null;
      }
    };

    // getTrackPublication(Source.Microphone), not a `.microphoneTrack` shortcut — that property
    // is on the components-react hook's view of a participant, not on LocalParticipant itself.
    const micTrack = () =>
      room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack ??
      null;

    const openMic = () => {
      gatedRef.current = false;
      // Only if the user has not muted themselves in the meantime. Their mute outranks ours, and
      // re-enabling the track under it would publish audio from somebody who believes they are
      // muted — the one failure here that is worse than the bug being fixed.
      if (!room.localParticipant.isMicrophoneEnabled) return;
      const track = micTrack();
      if (track) track.enabled = true;
    };

    const evaluate = () => {
      const wanted = new Set(dubIdentitiesRef.current);
      const dubSounding = Array.from(room.remoteParticipants.values()).some(
        (participant) => wanted.has(participant.identity) && participant.isSpeaking,
      );

      if (dubSounding) {
        clearRelease();
        if (!gatedRef.current) {
          gatedRef.current = true;
          const track = micTrack();
          if (track) track.enabled = false;
        }
        return;
      }

      if (gatedRef.current && releaseTimerRef.current === null) {
        releaseTimerRef.current = window.setTimeout(() => {
          releaseTimerRef.current = null;
          openMic();
        }, RELEASE_HANGOVER_MS);
      }
    };

    // Both signals, for the reason the speaking ring needs both: ActiveSpeakersChanged is
    // room-level and arrives on the SFU's own cadence, while IsSpeakingChanged fires per
    // participant. Gating late is audible as a fragment getting through.
    const attach = (participant: RemoteParticipant) =>
      participant.on(ParticipantEvent.IsSpeakingChanged, evaluate);
    const detach = (participant: RemoteParticipant) =>
      participant.off(ParticipantEvent.IsSpeakingChanged, evaluate);

    // A dub bot joins DURING the meeting — tts_worker creates it on the first synthesised chunk —
    // so the interesting participant is almost never one that was here when this mounted.
    const onParticipantConnected = (participant: RemoteParticipant) => {
      attach(participant);
      evaluate();
    };

    room.on(RoomEvent.ActiveSpeakersChanged, evaluate);
    room.on(RoomEvent.ParticipantConnected, onParticipantConnected);
    for (const participant of room.remoteParticipants.values()) attach(participant);

    return () => {
      clearRelease();
      room.off(RoomEvent.ActiveSpeakersChanged, evaluate);
      room.off(RoomEvent.ParticipantConnected, onParticipantConnected);
      for (const participant of room.remoteParticipants.values()) detach(participant);
      // Never leave the microphone held down by a component that has gone away — that would be a
      // silent mic with nothing left running to release it.
      if (gatedRef.current) openMic();
    };
  }, [room, enabled]);

  // Translation stopping (or the last dub leaving) must release the microphone too: with no
  // interpreter left to report isSpeaking, no event will ever arrive to do it.
  useEffect(() => {
    if (enabled && dubIdentities.length > 0) return;
    if (!gatedRef.current || !room) return;
    gatedRef.current = false;
    if (!room.localParticipant.isMicrophoneEnabled) return;
    const track = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track
      ?.mediaStreamTrack;
    if (track) track.enabled = true;
  }, [enabled, dubIdentities.length, room]);

  return null;
}
