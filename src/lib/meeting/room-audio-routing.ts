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
 * WHAT MEET HEARS FROM THE HOST: THE NATIVE LISTENER'S RULE, APPLIED TO THE FAR SIDE
 *
 *   The far side is a listener like any other, it just sits in Meet. So the virtual microphone
 *   carries exactly what a native WarpTalk listener in the far side's language would hear of the
 *   host (`outboundRawMic` / `outboundIdentity`):
 *
 *     - no translation running (before Start, after Stop): the host's own voice, raw;
 *     - the host's dub in the far side's language is on the wire: the dub, and the raw voice fully
 *       off — there is no "original underneath" level in a native room either;
 *     - that dub existed earlier in this session but its bot is between sentences or reconnecting
 *       after the 60s idle reap: silence, not the raw voice (WT-874, same reasoning);
 *     - no dub has existed yet (the utterance that summons the bot), or the host speaks the far
 *       side's language, or either language is unknown: raw — fail open, as for any speaker.
 *
 *   It used to carry the dub and nothing else, so Meet's microphone was dead before Start, between
 *   sentences, and for the whole meeting when the languages matched. From Meet that is
 *   indistinguishable from a broken virtual cable, and it was reported as exactly that.
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
  /**
   * Speakers this listener has ALREADY been hearing through a dub, in this listen language, while
   * translation has been running. Their raw microphone stays off even while their interpreter bot
   * is momentarily absent — see the mismatched-language rule in routeRoomAudio.
   */
  previouslyDubbedSpeakerIds?: ReadonlySet<string>;
  /**
   * The host's outbound dub has been on the wire at least once in the current outbound scope
   * (see outboundDubHistoryScope). Keeps Meet's microphone silent, not raw, while the host's
   * interpreter bot is between sentences or reconnecting — the outbound twin of
   * previouslyDubbedSpeakerIds.
   */
  previouslyDubbedOutbound?: boolean;
  /**
   * identity -> the `warptalk.voice` attribute each interpreter bot sets (tts_worker
   * VOICE_KIND_ATTRIBUTE): "cloned" | "profile" | "default" | "preference". Absent for a bot from
   * a pipeline that predates the attribute, which keeps the old rule.
   */
  dubVoiceKindByIdentity?: Readonly<Record<string, string>>;
};

export type RoomAudioRouting = {
  /** Every identity that should stay subscribed. */
  wanted: ReadonlySet<string>;
  /** The one wanted identity that is played into the bridge device rather than the speakers. */
  outboundIdentity: string | null;
  /** Speakers whose dub, in this listener's voice, is on the wire right now. */
  dubbedSpeakerIds: ReadonlySet<string>;
  /**
   * Bridge rooms only: the host's OWN microphone track, not a remote one, goes into the bridge
   * device. Never true together with a non-null outboundIdentity — exactly one of the two plays
   * into Meet at a time.
   */
  outboundRawMic: boolean;
  /**
   * Speakers whose own microphone is played UNDER their dub, at ORIGINAL_UNDER_DUB_VOLUME, rather
   * than at full volume. Only ever speakers dubbed in their own voice, in a meeting room.
   */
  duckedSpeakerIds: ReadonlySet<string>;
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

/** The participant attribute each interpreter bot sets — tts_worker VOICE_KIND_ATTRIBUTE. */
export const DUB_VOICE_ATTRIBUTE = "warptalk.voice";

/** How loud a speaker's original voice plays beneath their cloned dub: present, not competing. */
export const ORIGINAL_UNDER_DUB_VOLUME = 0.3;

/** A dub in the speaker's OWN voice — cloned from them, or a voice they picked for themselves. */
export function isOwnVoiceKind(kind: string | null | undefined): boolean {
  return kind === "cloned" || kind === "profile";
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
  previouslyDubbedSpeakerIds,
  previouslyDubbedOutbound = false,
  dubVoiceKindByIdentity,
}: RoomAudioRoutingInput): RoomAudioRouting {
  const standIn = bridgeStandInIdentity || null;
  const farSideLanguage = standIn ? speakerLanguageByUserId[standIn] || null : null;

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
          farSideLanguage,
          listenerLanguage: targetLanguageNormalized,
        })
      : null;

  // THE SPEAKER DECIDES (reported: Kỳ turned voice clone on and Tuấn heard the clone only once
  // Tuấn turned HIS switch on too). In a meeting room a dub is played only when it is in the
  // speaker's own voice, whatever the listener has set, and the speaker's original stays audible
  // beneath it, quieter. A speaker without a voice of their own is heard as they actually sound.
  //
  // Only where the pipeline reports voice kinds at all: until the AI side is deployed no bot
  // carries the attribute, and the rule below is the one that has always run. Bridge rooms keep
  // their own rules — the far side's dub is the only way the host understands them, and it is
  // never in the far side's own voice.
  const isBridgeRoom = Boolean(standIn) || bridgeOutboundReady;
  const kindOf = (identity: string): string | undefined => dubVoiceKindByIdentity?.[identity] || undefined;
  const speakerOwnedVoice =
    !isBridgeRoom && identities.some((identity) => identity.startsWith(AI_INTERPRETER_PREFIX) && kindOf(identity));
  // REVISED BY THE OWNER, 4 Oct 2026, after that release: the LISTENER decides. With their switch
  // (`voiceEnabled`) on, every speaker is dubbed — in their own voice if they chose one (cloned or
  // picked), otherwise in a stand-in voice, because a speaker who did not consent is never cloned.
  // Off, everyone is heard as they actually sound. What stayed from the release: the original
  // plays under a dub at ORIGINAL_UNDER_DUB_VOLUME instead of being muted. The voice kind no longer
  // decides playback; its presence only says the pipeline is new enough for this rule.
  const ownVoiceDubbed = new Set<string>();
  if (speakerOwnedVoice && translationActive && voiceEnabled) {
    for (const identity of identities) {
      const dubbed = dubbedSpeakerId(identity);
      if (dubbed && dubbed !== localUserId) ownVoiceDubbed.add(dubbed);
    }
  }

  const isWanted = (identity: string): boolean => {
    if (identity === outboundIdentity) return true;

    if (speakerOwnedVoice) {
      if (identity.startsWith(AI_INTERPRETER_PREFIX)) {
        const dubbed = dubbedSpeakerId(identity);
        return voiceEnabled && translationActive && dubbed !== null && dubbed !== localUserId;
      }
      // Every person stays audible; duckedSpeakerIds says which play quieter under their dub.
      return true;
    }

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
    //
    // "Once it exists" means once in this session, not "right now" (WT-874). tts_worker
    // disconnects an interpreter bot after 60s without a sentence (SESSION_IDLE_TIMEOUT_S), so
    // every pause longer than that unmuted the speaker's raw mic, and the next sentence was heard
    // twice: the original for the 2-5s the pipeline takes, then the bot rejoined and the dub
    // started over it. For a speaker already dubbed to this listener the pipeline is known to
    // work, so the gap is a bot reconnecting, not a missing translation.
    if (previouslyDubbedSpeakerIds?.has(identity)) return false;
    return !dubbedSpeakerIds.has(identity);
  };

  return {
    wanted: new Set(identities.filter(isWanted)),
    duckedSpeakerIds: ownVoiceDubbed,
    outboundIdentity,
    dubbedSpeakerIds,
    outboundRawMic: bridgeOutboundReady
      ? decideOutboundRawMic({
          outboundIdentity,
          translationActive,
          hostLanguage: localUserId ? speakerLanguageByUserId[localUserId] || null : null,
          farSideLanguage,
          previouslyDubbedOutbound,
        })
      : false,
  };
}

/**
 * Whether Meet hears the host's own voice, given that a bridge device exists. The mismatched-
 * language rule of isWanted above, with the host as the speaker and the far side as the listener.
 *
 * Deliberately NOT behind translationActive the way the dub is: with no pipeline running this is
 * an ordinary call, and in an ordinary call everyone hears everyone as they sound. And not behind
 * voiceEnabled either — that is what the host hears, never what the far side is sent.
 */
function decideOutboundRawMic({
  outboundIdentity,
  translationActive,
  hostLanguage,
  farSideLanguage,
  previouslyDubbedOutbound,
}: {
  outboundIdentity: string | null;
  translationActive: boolean;
  hostLanguage: string | null;
  farSideLanguage: string | null;
  previouslyDubbedOutbound: boolean;
}): boolean {
  // The dub is on the wire: it is what the far side hears, and the original is fully off. Two
  // voices into one microphone would be the doubled sentence WT-874 removed for native listeners.
  if (outboundIdentity) return false;
  if (!translationActive) return true;
  // Same language, or one we cannot tell: there is nothing to translate into, or no way to know,
  // so fail open — the same as an unclassified speaker in a native room. Checked before the
  // history so a host who switches to the far side's language is heard again at once.
  if (!hostLanguage || !farSideLanguage || hostLanguage === farSideLanguage) return true;
  // The bot is between sentences or reconnecting after its idle reap: the pipeline is known to
  // work for this pair, so the gap is a bot coming back, not a missing translation. Silence, or
  // the next sentence is heard in the original and then again as the dub.
  if (previouslyDubbedOutbound) return false;
  // The first sentence, before the interpreter bot has ever published: the original is a worse
  // listen than the dub and a far better one than dead air, and it self-corrects the moment the
  // bot appears.
  return true;
}

/**
 * The scope an outbound-dub history is valid for: the far side's language, while translation runs
 * and a bridge device exists. Empty means "no history applies" — Stop and Start again, or the far
 * side's language changing, starts over, so the first sentence fails open again.
 *
 * Not keyed on voiceEnabled, unlike dubbedHistoryScope: the host turning their own dubs off does
 * not change what the far side is sent.
 */
export function outboundDubHistoryScope({
  translationActive,
  bridgeOutboundReady = false,
  speakerLanguageByUserId,
  bridgeStandInIdentity,
}: Pick<
  RoomAudioRoutingInput,
  "translationActive" | "bridgeOutboundReady" | "speakerLanguageByUserId" | "bridgeStandInIdentity"
>): string {
  const farSideLanguage = bridgeStandInIdentity ? speakerLanguageByUserId[bridgeStandInIdentity] : null;
  return translationActive && bridgeOutboundReady && farSideLanguage ? farSideLanguage : "";
}

/** Which speakers a listener has been hearing dubbed, and under which listening scope. */
export type DubbedHistory = { readonly scope: string; readonly ids: ReadonlySet<string> };

export const EMPTY_DUBBED_HISTORY: DubbedHistory = { scope: "", ids: new Set() };

/**
 * The scope a dubbed-speaker history is valid for: the listen language, while dubs are both
 * produced and wanted. Empty means "no history applies", so turning voice or translation off and
 * on again starts over and the first utterance fails open again.
 */
export function dubbedHistoryScope({
  targetLanguageNormalized,
  translationActive,
  voiceEnabled,
}: Pick<RoomAudioRoutingInput, "targetLanguageNormalized" | "translationActive" | "voiceEnabled">): string {
  return translationActive && voiceEnabled ? targetLanguageNormalized : "";
}

/**
 * The history after this render: reset on a scope change, grown by whoever is dubbed now.
 * Returns `previous` itself when nothing changed, so a caller can store it in React state during
 * render without looping.
 */
export function mergeDubbedHistory(
  previous: DubbedHistory,
  scope: string,
  dubbedNow: ReadonlySet<string>,
): DubbedHistory {
  if (!scope) return previous.scope === "" && previous.ids.size === 0 ? previous : EMPTY_DUBBED_HISTORY;
  const base = previous.scope === scope ? previous.ids : new Set<string>();
  const missing = [...dubbedNow].filter((id) => !base.has(id));
  if (previous.scope === scope && missing.length === 0) return previous;
  return { scope, ids: new Set([...base, ...missing]) };
}
