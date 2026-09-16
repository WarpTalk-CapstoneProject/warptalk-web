/**
 * Which microphone-source tracks a listener keeps subscribed, and which one of those goes to the
 * external-bridge device instead of their speakers. FilteredRoomAudio renders the result; the rule
 * lives here so it can be tested without LiveKit.
 *
 * THE TWO THINGS voiceEnabled IS NOT ALLOWED TO TOUCH IN A BRIDGE ROOM
 *
 *   An EXTERNAL_BRIDGE room has two seats: the host, and a stand-in for everyone on the far side of
 *   a Google Meet call. The host's own dub is the OUTBOUND leg — BridgeOutboundAudio plays it into
 *   the virtual device Meet uses as its microphone — and the stand-in's microphone is the far side,
 *   captured from the host's own browser and published under a fixed identity.
 *
 *   1. The outbound dub. `voiceEnabled` is the host's choice about what THEY hear. It used to drop
 *      every `ai-interpreter-` track, the outbound one included, and it defaults to off for anyone
 *      who did not come through /join — which a room opened from the desktop offer never does. So
 *      the far side heard silence by default, with the bridge looking healthy from inside WarpTalk.
 *
 *   2. The stand-in's raw track. It is not an interpreter identity, so it was treated as a real
 *      person's microphone and played whenever voice was off, the languages matched, or no dub
 *      existed yet. The host already hears the far side through Meet itself; this replayed it a
 *      second time, offset by the round trip through LiveKit.
 *
 * WHY THE OUTBOUND DUB IS NOT FOUND THROUGH resolveInterpreterTracks
 *
 *   That resolver answers "what does THIS LISTENER hear", so it only accepts tracks in the
 *   listener's own language. The outbound dub is in the far side's language: a host who speaks and
 *   listens in Vietnamese against a far side in English is dubbed as `ai-interpreter-en-{hostId}`,
 *   and the resolver, looking for `ai-interpreter-vi-`, never saw it. The leg only worked for a host
 *   who had set their own listen language to the far side's — the one configuration in which the
 *   host hears no translation of the far side at all.
 */

import { AI_INTERPRETER_PREFIX, resolveInterpreterTracks } from "./interpreter-track.ts";

export type RoomAudioRoutingInput = {
  /** Every REMOTE microphone-source track identity currently visible. The local track is never here. */
  identities: readonly string[];
  /** normalizeLanguageCode of this listener's listen language. */
  targetLanguageNormalized: string;
  /** userId -> normalizeLanguageCode(speakLanguage) for every participant currently known. */
  speakerLanguageByUserId: Readonly<Record<string, string>>;
  /** A Cartesia voice id this listener explicitly chose, or null for the automatic default. */
  voicePreference: string | null;
  /** Whether this listener hears dubs. Never gates the outbound bridge leg — see the file doc. */
  voiceEnabled: boolean;
  /** A translation pipeline is running. False means an ordinary call: no dub is played or sent. */
  translationActive: boolean;
  /** This listener's own user id. */
  localUserId?: string | null;
  /** A virtual device exists to carry the outbound bridge leg. Only ever true in a bridge room. */
  bridgeOutboundReady?: boolean;
  /**
   * The stand-in identity this client publishes the far side under, in a bridge room. Taken from
   * the server's bridge-token response rather than spelled here, because the pipeline routes on
   * that exact string (see BridgeTokenDto).
   */
  bridgeStandInIdentity?: string | null;
};

export type RoomAudioRouting = {
  /** Every identity that should stay subscribed. */
  wanted: ReadonlySet<string>;
  /** The one wanted identity that is played into the bridge device rather than the speakers. */
  outboundIdentity: string | null;
};

/** A speaker's interpreter track in ANY language: the language it is in, and whether it is the default voice. */
function parseOwnDub(identity: string, speakerId: string): { language: string; isDefault: boolean } | null {
  const suffix = `-${speakerId}`;
  if (!identity.startsWith(AI_INTERPRETER_PREFIX) || !identity.endsWith(suffix)) return null;
  const middle = identity.slice(AI_INTERPRETER_PREFIX.length, identity.length - suffix.length);
  if (!middle) return null;
  // `{lang}-voice-{id8}` is a track rendered in a voice some LISTENER picked. The stand-in never
  // picks one, so what the far side is sent is the speaker's own default track.
  const voiceVariant = /^(.+)-voice-[^-]+$/.exec(middle);
  return voiceVariant
    ? { language: voiceVariant[1], isDefault: false }
    : { language: middle, isDefault: true };
}

/**
 * The host's own default dub that the far side should be sent, in whichever language it was
 * rendered.
 *
 * With the far side's language known, only a track in that language qualifies: sending the host's
 * dub in some third language into Meet is worse than sending nothing, because nothing at least
 * shows up as a missing leg. Unknown (the stand-in row is not in the roster yet), the best guess is
 * a dub NOT in the host's own listen language — that one exists only for the host's ears, which
 * never play their own dub anyway.
 */
export function findOutboundDubIdentity({
  identities,
  localUserId,
  farSideLanguage,
  listenerLanguage,
}: {
  identities: readonly string[];
  localUserId: string;
  farSideLanguage?: string | null;
  listenerLanguage: string;
}): string | null {
  const ownDubs = identities
    .map((identity) => ({ identity, parsed: parseOwnDub(identity, localUserId) }))
    .filter(
      (entry): entry is { identity: string; parsed: { language: string; isDefault: true } } =>
        entry.parsed !== null && entry.parsed.isDefault,
    );

  if (farSideLanguage) {
    return ownDubs.find((entry) => entry.parsed.language === farSideLanguage)?.identity ?? null;
  }
  return (
    ownDubs.find((entry) => entry.parsed.language !== listenerLanguage)?.identity ??
    ownDubs[0]?.identity ??
    null
  );
}

export function routeRoomAudio({
  identities,
  targetLanguageNormalized,
  speakerLanguageByUserId,
  voicePreference,
  voiceEnabled,
  translationActive,
  localUserId,
  bridgeOutboundReady = false,
  bridgeStandInIdentity,
}: RoomAudioRoutingInput): RoomAudioRouting {
  const standIn = bridgeStandInIdentity || null;

  // The whole-room voice decision: see interpreter-track.ts for why it cannot be a predicate over
  // one identity.
  const interpreterTracks = resolveInterpreterTracks({
    identities,
    targetLanguageNormalized,
    voicePreference,
  });
  /** An interpreter identity this listener would accept → the speaker it dubs, else null. */
  const dubbedSpeakerId = (identity: string) => interpreterTracks.get(identity) ?? null;

  // Speakers whose dub is ACTUALLY on the wire right now. tts_worker creates an interpreter bot
  // lazily, on the first synthesized chunk (LiveKitTTSPublisher._get_or_create_bot), so a
  // mismatched speaker has no dub until they have already spoken. Cutting the raw mic on the
  // language mismatch alone silenced the very utterance that summons their interpreter.
  const dubbedSpeakerIds = new Set(
    identities
      .map((identity) => dubbedSpeakerId(identity))
      .filter((speakerId): speakerId is string => speakerId !== null),
  );

  // Ahead of every listening rule below, and deliberately not behind voiceEnabled: this track is
  // not for this listener's ears. Still gated on translationActive, because tts_worker only sweeps
  // idle bots from inside _get_or_create_bot — once synthesis stops, a lingering bot would keep
  // feeding its last state into Meet.
  const outboundIdentity =
    bridgeOutboundReady && translationActive && localUserId
      ? findOutboundDubIdentity({
          identities,
          localUserId,
          farSideLanguage: standIn ? speakerLanguageByUserId[standIn] : null,
          listenerLanguage: targetLanguageNormalized,
        })
      : null;

  const isWanted = (identity: string): boolean => {
    if (identity === outboundIdentity) return true;

    // The far side, raw. The host is sitting in the Meet call and already hears it there; playing
    // it here as well is the same voice twice, one round trip apart. Never subscribed, under any
    // setting — the pipeline reads it server-side and does not need this client to.
    if (standIn && identity === standIn) return false;

    if (identity.startsWith(AI_INTERPRETER_PREFIX)) {
      // Voice off means "no dubs", not "no sound": the people below stay audible.
      if (!voiceEnabled) return false;
      const dubbed = dubbedSpeakerId(identity);
      // Never your own dub. A speaker who listens in the language they speak would otherwise hear
      // a synthetic copy of what they just said, a second behind themselves. In a bridge room the
      // one own dub that matters has already been taken above, for the device rather than the ears.
      if (localUserId && dubbed === localUserId) return false;
      // A lingering bot must not be played once translation has stopped.
      return translationActive && dubbed !== null;
    }

    // Real participant's own microphone. With voice off, or no pipeline running, there is no dub
    // to prefer over anyone — every person is audible as they actually sound.
    if (!voiceEnabled || !translationActive) return true;
    // Audible if THEY speak the language this listener chose to hear — including a speaker not yet
    // classified (fail open). Otherwise the dub is this listener's version of them.
    const speakerLang = speakerLanguageByUserId[identity];
    if (!speakerLang || speakerLang === targetLanguageNormalized) return true;
    // Mismatched language: prefer the dub, but only once it exists. The untranslated original is
    // a worse listen than the dub and a far better one than dead air, and it self-corrects the
    // moment the bot publishes.
    return !dubbedSpeakerIds.has(identity);
  };

  return {
    wanted: new Set(identities.filter(isWanted)),
    outboundIdentity,
  };
}
