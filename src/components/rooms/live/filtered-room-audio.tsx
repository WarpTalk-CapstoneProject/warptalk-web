"use client";

import { useEffect } from "react";
import { RemoteTrackPublication, Track } from "livekit-client";
import { AudioTrack, isTrackReference, useTracks } from "@livekit/components-react";

import {
  AI_INTERPRETER_PREFIX,
  resolveInterpreterTracks,
} from "@/lib/meeting/interpreter-track";
import { BridgeOutboundAudio } from "./bridge-outbound-audio";
import { HalfDuplexMic } from "./half-duplex-mic";


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
 * `voiceEnabled = false` drops the DUBS and keeps the people. It used to unsubscribe every
 * track including the raw microphones, so the switch produced silence rather than the room
 * as it actually sounds — which is not a mode anyone asked for, and left "turn the dub off
 * to hear the real voice" with no way to do it. TranslationTextDto keeps arriving over
 * SignalR regardless (that path doesn't touch LiveKit tracks), so captions are
 * unaffected — this only silences playback.
 *
 * `translationActive = false` disables the language routing entirely: the room is an
 * ordinary call, so every participant is audible and no interpreter track is played.
 * Without this the filter ran before Start Translation — muting speakers for a dub that
 * no pipeline was ever going to produce — and kept running after Stop Translation,
 * because tts_worker only sweeps idle bots from inside _get_or_create_bot: once synthesis
 * stops there is no next creation to trigger the sweep, so the bot lingers in the room
 * and its mere presence kept the raw microphone muted.
 */
export function FilteredRoomAudio({
  targetLanguageNormalized,
  speakerLanguageByUserId,
  voicePreference,
  voiceEnabled = true,
  translationActive,
  localUserId,
  bridgeOutboundDeviceId,
  onBridgeOutboundError,
}: {
  /** normalizeLanguageCode(targetLanguage) — see page.tsx for why this must be computed there, not re-derived here. */
  targetLanguageNormalized: string;
  /** userId -> normalizeLanguageCode(speakLanguage) for every participant currently known. */
  speakerLanguageByUserId: Record<string, string>;
  /** A real Cartesia voice id this listener explicitly chose, or null for the automatic default. */
  voicePreference: string | null;
  /** false = transcript-only mode: no audio track is ever wanted, regardless of language/voice. Defaults to true. */
  voiceEnabled?: boolean;
  /** room.status === "in_progress" — false means no STT/MT/TTS pipeline is running, so this is a plain call. */
  translationActive: boolean;
  /** This listener's own user id, so their own dub is never played back at them. */
  localUserId?: string | null;
  /**
   * WT-525 — set ONLY in an external-bridge meeting: the virtual device Google Meet is using as
   * its microphone. Its presence flips the "never your own dub" rule below, because in a bridge
   * meeting that track is not a redundant echo of yourself — it is the translated voice the far
   * side is meant to hear, and this is the device that carries it to them.
   */
  bridgeOutboundDeviceId?: string | null;
  /** Surfaces a failed hand-off to the virtual device; silence here is indistinguishable from a working bridge. */
  onBridgeOutboundError?: (message: string) => void;
}) {
  const bridgeActive = Boolean(bridgeOutboundDeviceId);
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

  // The whole rule lives in lib/meeting/interpreter-track.ts, where it can be tested: it is a
  // WHOLE-ROOM decision (a speaker's default track is declined only if a track in this
  // listener's voice exists for that same speaker), so it cannot be expressed as a predicate
  // over one identity — which is exactly the mistake that discarded every cloned voice.
  const interpreterTracks = resolveInterpreterTracks({
    identities: trackRefs.map((trackRef) => trackRef.participant.identity),
    targetLanguageNormalized,
    voicePreference,
  });

  /** An interpreter identity this listener would accept → the speaker it dubs, else null. */
  const dubbedSpeakerId = (identity: string) => interpreterTracks.get(identity) ?? null;

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
    // Voice off means "no dubs", not "no sound".
    //
    // This returned false for EVERY track, so turning the switch off did not hand the room
    // back its real voices — it produced silence. The report is exact: "bật thì nghe tiếng
    // bên người khác, tắt thì không nghe", and separately "tắt voice clone rồi mà vẫn không
    // nghe được giọng thật". Both are this line.
    //
    // Off now drops the AI interpreter tracks and keeps every human microphone, which is
    // what the switch was always supposed to mean: hear people as they actually sound.
    if (!voiceEnabled) {
      return !identity.startsWith(AI_INTERPRETER_PREFIX);
    }
    if (identity.startsWith(AI_INTERPRETER_PREFIX)) {
      // Never your own dub. The interpreter publishes a track per (speaker, language), and
      // a speaker who happens to have picked the same listen language as their speak
      // language is subscribed to the bot that is dubbing THEM — so they hear a synthetic
      // copy of what they just said, a second behind themselves. Nobody needs a translation
      // of their own sentence into the language they said it in.
      const dubbed = dubbedSpeakerId(identity);
      // ...unless this is a bridge meeting, where your own dub is the outbound leg. It still
      // never reaches your headphones — BridgeOutboundAudio below renders it to the virtual
      // device instead of <AudioTrack> — but it does have to stay SUBSCRIBED, and this predicate
      // is what drives setSubscribed(). Returning false here would unsubscribe the one track the
      // far side is listening to.
      if (localUserId && dubbed === localUserId && !bridgeActive) return false;
      // A lingering bot must not be played once translation has stopped: tts_worker only
      // sweeps idle bots from inside _get_or_create_bot, so when synthesis stops there is
      // no next creation to trigger the sweep and the bot stays in the room indefinitely.
      return translationActive && dubbedSpeakerId(identity) !== null;
    }
    // With no pipeline running there is no dub to prefer over anyone, and a stale bot must
    // not be mistaken for one — this is an ordinary call, so every participant is audible.
    if (!translationActive) return true;
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
  }, [targetLanguageNormalized, speakerLanguageByUserId, voicePreference, voiceEnabled, translationActive, trackIdentityFingerprint]);

  const wantedTracks = trackRefs.filter((trackRef) => isWanted(trackRef.participant.identity));

  // In a bridge meeting exactly one of the wanted tracks goes somewhere else. Split it out rather
  // than letting it fall through to <AudioTrack>: rendering both would play the far side's
  // translation into the user's headphones as well as into Meet — the user would hear a delayed
  // copy of themselves in another language, which is the single most confusing thing this feature
  // can do while otherwise appearing to work.
  const outboundTrack = bridgeActive
    ? wantedTracks.find((trackRef) => dubbedSpeakerId(trackRef.participant.identity) === localUserId)
    : undefined;
  const audibleTracks = wantedTracks.filter((trackRef) => trackRef !== outboundTrack);

  // Exactly the dubs going to this listener's own speakers — the outbound bridge leg is excluded
  // because it plays into a virtual device Meet listens to, not into the room the user is sitting
  // in, so it cannot come back through their microphone.
  const localDubIdentities = audibleTracks
    .filter((trackRef) => trackRef.participant.identity.startsWith(AI_INTERPRETER_PREFIX))
    .map((trackRef) => trackRef.participant.identity);

  return (
    <>
      {/* Keeps the room's own translation from being picked up by this microphone and
          transcribed as the listener — see half-duplex-mic.tsx. */}
      <HalfDuplexMic dubIdentities={localDubIdentities} enabled={translationActive} />
      {outboundTrack && bridgeOutboundDeviceId && (
        <BridgeOutboundAudio
          key={`bridge-out-${outboundTrack.participant.identity}`}
          trackRef={outboundTrack}
          outputDeviceId={bridgeOutboundDeviceId}
          onError={onBridgeOutboundError}
        />
      )}
      {audibleTracks.map((trackRef) => (
        <AudioTrack key={`${trackRef.participant.identity}-${trackRef.source}`} trackRef={trackRef} />
      ))}
    </>
  );
}
