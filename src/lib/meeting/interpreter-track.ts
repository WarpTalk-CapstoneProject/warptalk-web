/**
 * Which AI-interpreter track a listener should actually hear, for each speaker.
 *
 * WHY VOICE IS ONE-DIRECTIONAL
 *   Whose voice a dub is spoken in is the SPEAKER's decision. What the listener chooses is
 *   the LANGUAGE — and the same voice is rendered once per distinct target language, so a
 *   Vietnamese speaker with a cloned voice is heard in English by an English listener, still
 *   in their own voice.
 *
 *   It did not work that way. TTSWorker._resolve_voice_variants rendered an extra track for
 *   every voice any listener had picked, for EVERY speaker, and the client accepted only the
 *   preference track once a listener had one. So a listener who had ever chosen a voice
 *   silently stopped hearing every cloned speaker in their own voice, while the speaker saw
 *   "My voice", watched the capture succeed, and had no way to learn it was being discarded.
 *
 *   The worker now renders a listener's alternative only for speakers who have no voice of
 *   their own. This is the client half of that rule.
 *
 * WHY THIS IS A WHOLE-ROOM DECISION AND NOT A PREDICATE ON ONE IDENTITY
 *   Because of the above, a cloned speaker publishes the DEFAULT track and nothing else.
 *   Looking at one identity in isolation cannot tell "this speaker's preference track is
 *   elsewhere in the list" apart from "this speaker has no preference track at all" — and
 *   the old code guessed the first, so a cloned speaker's default track was rejected and the
 *   listener fell back to that speaker's RAW MICROPHONE: fluent Vietnamese in a room set to
 *   English, with nothing anywhere saying why.
 */

export const AI_INTERPRETER_PREFIX = "ai-interpreter-";

/**
 * The two identity shapes tts_worker publishes (see LiveKitTTSPublisher):
 *   ai-interpreter-{lang}-{speakerId}                  the shared default track
 *   ai-interpreter-{lang}-voice-{id8}-{speakerId}      one listener-picked voice
 * A GUID speakerId never starts with "voice-", so the two cannot collide.
 */
export type ParsedInterpreter = {
  speakerId: string;
  /** True for a track rendered in a voice some listener explicitly picked. */
  isPreference: boolean;
};

export function parseInterpreterIdentity(
  identity: string,
  targetLanguageNormalized: string,
): ParsedInterpreter | null {
  const languagePrefix = `${AI_INTERPRETER_PREFIX}${targetLanguageNormalized}-`;
  if (!identity.startsWith(languagePrefix)) return null;

  const rest = identity.slice(languagePrefix.length);
  if (!rest) return null;

  if (!rest.startsWith("voice-")) {
    return { speakerId: rest, isPreference: false };
  }

  const separator = rest.indexOf("-", "voice-".length);
  if (separator < 0) return null;
  const speakerId = rest.slice(separator + 1);
  return speakerId ? { speakerId, isPreference: true } : null;
}

/**
 * For every interpreter identity present in the room, the speaker it dubs FOR THIS LISTENER,
 * or null when this listener should not hear it.
 *
 * `identities` must be every track identity currently visible, not just the interpreter ones —
 * the decision for a default track depends on whether a preference track for the same speaker
 * exists anywhere in the room.
 */
export function resolveInterpreterTracks({
  identities,
  targetLanguageNormalized,
  voicePreference,
}: {
  identities: readonly string[];
  targetLanguageNormalized: string;
  /** A Cartesia voice id this listener picked, or null for "whatever the speaker chose". */
  voicePreference: string | null;
}): Map<string, string | null> {
  const languagePrefix = `${AI_INTERPRETER_PREFIX}${targetLanguageNormalized}-`;
  const myPreferencePrefix = voicePreference
    ? `${languagePrefix}voice-${voicePreference.slice(0, 8)}-`
    : null;

  // Speakers for whom a track in THIS listener's chosen voice actually exists. Matched on the
  // listener's own prefix rather than on "is a preference track": the worker publishes one per
  // distinct voice anybody picked, so another listener's choice must not count as ours.
  const speakersWithMyVoice = new Set<string>();
  if (myPreferencePrefix) {
    for (const identity of identities) {
      if (!identity.startsWith(myPreferencePrefix)) continue;
      const parsed = parseInterpreterIdentity(identity, targetLanguageNormalized);
      if (parsed) speakersWithMyVoice.add(parsed.speakerId);
    }
  }

  const resolved = new Map<string, string | null>();
  for (const identity of identities) {
    const parsed = parseInterpreterIdentity(identity, targetLanguageNormalized);
    if (!parsed) continue;

    if (parsed.isPreference) {
      resolved.set(
        identity,
        myPreferencePrefix && identity.startsWith(myPreferencePrefix) ? parsed.speakerId : null,
      );
      continue;
    }

    // The default track carries the speaker's own voice. Declined only when this listener has
    // a genuine alternative for that same speaker — never merely because they have a
    // preference, which is what silently discarded every clone.
    resolved.set(identity, speakersWithMyVoice.has(parsed.speakerId) ? null : parsed.speakerId);
  }

  return resolved;
}
