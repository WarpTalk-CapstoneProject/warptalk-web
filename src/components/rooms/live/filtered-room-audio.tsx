"use client";

import { Track } from "livekit-client";
import { AudioTrack, isTrackReference, useTracks } from "@livekit/components-react";

const AI_INTERPRETER_PREFIX = "ai-interpreter-";

/**
 * Replaces the default <RoomAudioRenderer />, which plays every subscribed audio
 * track unconditionally. In a multi-listener room, tts_worker publishes one
 * "ai-interpreter-{lang}" bot per active target language (see
 * warptalk-ai/tts_worker/livekit_publisher.py), so playing all of them mixes every
 * listener's dubbed language together instead of just the one this listener chose.
 * Real participants' own microphone tracks are unaffected.
 */
export function FilteredRoomAudio({ targetLanguage }: { targetLanguage: string }) {
  const tracks = useTracks([{ source: Track.Source.Microphone, withPlaceholder: false }], {
    onlySubscribed: true,
  });

  const audibleTracks = tracks.filter(isTrackReference).filter((trackRef) => {
    const identity = trackRef.participant.identity;
    if (!identity.startsWith(AI_INTERPRETER_PREFIX)) {
      return true;
    }
    return identity === `${AI_INTERPRETER_PREFIX}${targetLanguage}`;
  });

  return (
    <>
      {audibleTracks.map((trackRef) => (
        <AudioTrack key={`${trackRef.participant.identity}-${trackRef.source}`} trackRef={trackRef} />
      ))}
    </>
  );
}
