"use client";

import { useEffect } from "react";
import { RemoteTrackPublication, Track } from "livekit-client";
import { AudioTrack, isTrackReference, useTracks } from "@livekit/components-react";

const AI_INTERPRETER_PREFIX = "ai-interpreter-";

/**
 * Replaces the default <RoomAudioRenderer />, which plays every subscribed audio
 * track unconditionally. tts_worker publishes one interpreter bot per
 * (speaker, target language) — identity "ai-interpreter-{lang}-{speakerId}" (see
 * warptalk-ai/tts_worker/livekit_publisher.py) — so concurrent speakers are dubbed on
 * separate parallel tracks.
 *
 * This does true per-participant ROUTING, not just client-side muting: every track
 * this listener doesn't want — an interpreter track in another language, OR a real
 * speaker's raw microphone when that speaker's own language differs from what this
 * listener chose — is explicitly unsubscribed via RemoteTrackPublication.
 * setSubscribed(false), which tells the LiveKit SFU to stop sending that track's media
 * over the wire entirely, not just decode-then-discard it locally. `onlySubscribed:
 * false` on useTracks is required so this component can still SEE (and un/subscribe) a
 * track it isn't currently receiving.
 *
 * Muting the raw mic for a mismatched language is deliberate, not an oversight: without
 * it, a listener who chose English would hear the speaker's real Vietnamese voice
 * layered underneath the AI interpreter's English dub at the same time — not the clean
 * single-language listen the room's whole language picker exists to provide. A speaker
 * whose OWN language matches what this listener chose (including a speaker not yet
 * classified in speakerLanguageByUserId — fail open) is always audible, unfiltered,
 * since there's no dub to prefer over the original in that case.
 *
 * That mute is conditional on the dub actually being published, though, NOT on the
 * language mismatch alone: an interpreter bot is spawned lazily by the first synthesized
 * chunk, so a mismatched speaker has no dub until they have already spoken. Cutting them
 * on the mismatch alone silenced the very utterance that creates their interpreter, and
 * left only same-language listeners hearing anything. Prefer the dub whenever it is on
 * the wire; fall back to the untranslated original rather than to silence when it isn't.
 *
 * Deliberately scoped to only this hook's own useTracks() call — the room's global
 * autoSubscribe stays at its default (true), so camera/screen-share tracks elsewhere
 * (see meeting-stage.tsx) are unaffected.
 *
 * `voicePreference` selects among MULTIPLE interpreter tracks tts_worker may publish
 * for the same speaker+language: the shared default track (identity ends in just
 * "-{speakerId}") everyone without a preference hears, or a track dedicated to one
 * explicitly-picked voice (identity has "-voice-{id8}-" before the speakerId — see
 * TTSWorker._resolve_voice_variants / LiveKitTTSPublisher). A GUID speakerId never
 * starts with "voice-", so the two shapes can't collide.
 *
 * `voiceEnabled = false` is the "transcript only" mode: every track this listener
 * would otherwise hear — the AI interpreter dub AND any same-language raw mic — is
 * unsubscribed, so no audio plays at all. TranslationTextDto keeps arriving over
 * SignalR regardless (that path doesn't touch LiveKit tracks), so captions are
 * unaffected — this only silences playback.
 */
export function FilteredRoomAudio({
  targetLanguageNormalized,
  speakerLanguageByUserId,
  voicePreference,
  voiceEnabled = true,
}: {
  /** normalizeLanguageCode(targetLanguage) — see page.tsx for why this must be computed there, not re-derived here. */
  targetLanguageNormalized: string;
  /** userId -> normalizeLanguageCode(speakLanguage) for every participant currently known. */
  speakerLanguageByUserId: Record<string, string>;
  /** A real Cartesia voice id this listener explicitly chose, or null for the automatic default. */
  voicePreference: string | null;
  /** false = transcript-only mode: no audio track is ever wanted, regardless of language/voice. Defaults to true. */
  voiceEnabled?: boolean;
}) {
  const tracks = useTracks([{ source: Track.Source.Microphone, withPlaceholder: false }], {
    onlySubscribed: false,
  });

  // useTracks() includes the LOCAL participant's own mic publication alongside every
  // remote one (see @livekit/components-core's getTrackReferences) — you never "hear"
  // your own track through this component in the first place (you hear yourself
  // acoustically, not via playback); <AudioTrack> has no built-in guard against this and
  // will happily attach + play a local publication if given one, which is a real mic
  // feedback/echo hazard, not just a redundant no-op. Drop it before any wanted/
  // subscription logic runs, so nothing below ever has to special-case "is this me".
  const trackRefs = tracks.filter(isTrackReference).filter((trackRef) => !trackRef.publication.isLocal);

  // Language token sits between the prefix and the speaker GUID, so match on the
  // "ai-interpreter-{lang}-" prefix rather than a full-identity equality.
  const languagePrefix = `${AI_INTERPRETER_PREFIX}${targetLanguageNormalized}-`;
  const voiceSegmentPrefix = voicePreference ? `voice-${voicePreference.slice(0, 8)}-` : "";

  /** An interpreter identity this listener would accept → the speaker it dubs, else null. */
  const dubbedSpeakerId = (identity: string) => {
    if (!identity.startsWith(languagePrefix)) return null;
    const rest = identity.slice(languagePrefix.length); // "{speakerId}" or "voice-{id8}-{speakerId}"
    if (voicePreference) {
      return rest.startsWith(voiceSegmentPrefix) ? rest.slice(voiceSegmentPrefix.length) : null;
    }
    return rest.startsWith("voice-") ? null : rest;
  };

  // Speakers whose dub is ACTUALLY on the wire right now. tts_worker creates an
  // interpreter bot lazily, on the first synthesized chunk for a (speaker, language,
  // voice) — see LiveKitTTSPublisher._get_or_create_bot — so between "this listener's
  // language differs from that speaker's" becoming known and that speaker's first
  // utterance completing the STT→MT→TTS round trip, the dub simply does not exist yet.
  // Cutting the raw mic on the language mismatch alone therefore silenced the speaker
  // for exactly the utterance that would have summoned their interpreter, leaving only
  // listeners who happen to share the speaker's language able to hear anything at all.
  const dubbedSpeakerIds = new Set(
    trackRefs
      .map((trackRef) => dubbedSpeakerId(trackRef.participant.identity))
      .filter((speakerId): speakerId is string => speakerId !== null),
  );

  const isWanted = (identity: string) => {
    if (!voiceEnabled) return false;
    if (identity.startsWith(AI_INTERPRETER_PREFIX)) {
      return dubbedSpeakerId(identity) !== null;
    }
    // Real participant's own microphone. Audible if THEY speak the language this
    // listener chose to hear — otherwise the AI interpreter track above is this
    // listener's version of that speaker, and the raw original would just double up.
    const speakerLang = speakerLanguageByUserId[identity];
    if (!speakerLang || speakerLang === targetLanguageNormalized) return true;
    // Mismatched language: the dub is preferred, but only once it exists. Falling back
    // to the untranslated original is a worse listen than the dub and a far better one
    // than dead air, and it self-corrects — the moment the bot publishes, the identity
    // list changes, this recomputes, and the raw mic is dropped in favour of the dub.
    return !dubbedSpeakerIds.has(identity);
  };

  // trackRefs is a fresh array every render (useTracks), so the effect below keys on
  // this derived, stable string instead — otherwise it would call setSubscribed() on
  // every unrelated re-render, not just when a track, its subscription, or a speaker's
  // language actually changes.
  const trackIdentityFingerprint = trackRefs
    .map((t) => `${t.participant.identity}:${t.publication?.isSubscribed}`)
    .join(",");

  useEffect(() => {
    for (const trackRef of trackRefs) {
      if (!(trackRef.publication instanceof RemoteTrackPublication)) continue;

      const wanted = isWanted(trackRef.participant.identity);
      if (wanted && !trackRef.publication.isSubscribed) {
        trackRef.publication.setSubscribed(true);
      } else if (!wanted && trackRef.publication.isSubscribed) {
        trackRef.publication.setSubscribed(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetLanguageNormalized, speakerLanguageByUserId, voicePreference, voiceEnabled, trackIdentityFingerprint]);

  const audibleTracks = trackRefs.filter((trackRef) => isWanted(trackRef.participant.identity));

  return (
    <>
      {audibleTracks.map((trackRef) => (
        <AudioTrack key={`${trackRef.participant.identity}-${trackRef.source}`} trackRef={trackRef} />
      ))}
    </>
  );
}
