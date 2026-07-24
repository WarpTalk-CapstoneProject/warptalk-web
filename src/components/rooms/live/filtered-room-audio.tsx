"use client";

import { Track } from "livekit-client";
import { AudioTrack, isTrackReference, useTracks } from "@livekit/components-react";

const AI_INTERPRETER_PREFIX = "ai-interpreter-";

/**
 * Replaces the default <RoomAudioRenderer />, which plays every subscribed audio
 * track unconditionally. tts_worker publishes one interpreter bot per
 * (speaker, target language) — identity "ai-interpreter-{lang}-{speakerId}" (see
 * warptalk-ai/tts_worker/livekit_publisher.py) — so concurrent speakers are dubbed on
 * separate parallel tracks. This listener should hear only the interpreter tracks in
 * the language they chose (any speaker), not every language mixed together. Real
 * participants' own microphone tracks are always audible.
 */
export function FilteredRoomAudio({ targetLanguage }: { targetLanguage: string }) {
  const tracks = useTracks([{ source: Track.Source.Microphone, withPlaceholder: false }], {
    onlySubscribed: true,
  });

  // Language token sits between the prefix and the speaker GUID, so match on the
  // "ai-interpreter-{lang}-" prefix rather than a full-identity equality.
  const languagePrefix = `${AI_INTERPRETER_PREFIX}${targetLanguage}-`;
  const audibleTracks = tracks.filter(isTrackReference).filter((trackRef) => {
    const identity = trackRef.participant.identity;
    if (!identity.startsWith(AI_INTERPRETER_PREFIX)) {
      return true;
    }
    return identity.startsWith(languagePrefix);
  });

  return (
    <>
      {audibleTracks.map((trackRef) => (
        <AudioTrack key={`${trackRef.participant.identity}-${trackRef.source}`} trackRef={trackRef} />
      ))}
    </>
  );
}
