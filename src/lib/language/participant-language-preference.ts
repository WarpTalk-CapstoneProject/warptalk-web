/**
 * Which speak/listen language a participant actually gets in a live meeting.
 *
 * A participant configured speak=vi / listen=en, then saw transcripts labelled "en → vi"
 * and heard no dub. Nothing in the direction chain is transposed — the right-hand side of
 * that arrow can only ever be the viewer's own effective listen language, because
 * persistent-meeting-session drops every translation whose targetLang differs from
 * targetLanguageRef.current. Seeing "→ vi" proved their client's listen language WAS "vi".
 *
 * The room default had simply outranked their choice. The room default is a reasonable last
 * resort; the defect was its precedence. This module pins the order in one testable place:
 *
 *   1. in-session pick   — the media-bar dropdown / language picker modal, this tab, right now
 *   2. session storage   — "warptalk.join.preview", written for THIS room at join time and
 *                          re-written on every in-meeting pick
 *   3. participant row   — the server's record of what this user joined with, via
 *                          TranslationRoomParticipantDto (the authority when this tab has no
 *                          session storage: direct navigation, reload, a second tab)
 *   4. room default      — the room's configured languages
 *   5. "en"              — nothing else is known
 *
 * 1 and 2 are the same choice observed at different freshness (an in-meeting pick writes
 * both), so session storage sits above the participant row: it is the only source that
 * carries a change made AFTER joining. 3 is still an explicit user choice and therefore
 * still outranks any room-level default — which is the whole point of this file.
 *
 * WT-297 note (deliberately NOT fixed here — it changes room-creation semantics):
 * create-room-dialog sends targetLanguages INCLUDING sourceLanguage, so a room created as
 * [en, vi] has sourceLanguage="en" and targetLanguages=["en","vi"]. That is what made the
 * room's default listen language "vi" for everyone. The precedence below contains the
 * damage — the default is now only consulted when the user has expressed nothing at all.
 */

/**
 * The sentinel the client used to fall back to for an unknown speak language. It is NOT a
 * user choice: neither the language picker modal nor the media bar's speak dropdown offers
 * it (both are fed from `availableListenLanguages`, a list of real codes). It only ever
 * arrived by defaulting.
 *
 * Written through to the gateway it becomes the literal "auto" in
 * `translationRoom:{id}:speak_languages`, which makes `_language_hint_for_stt` return None
 * and lets STT free-run — and a short Vietnamese utterance mis-detecting as English is its
 * ordinary failure mode. So it is rejected as an input everywhere below.
 */
export const UNRESOLVED_LANGUAGE = "auto";

/** Mirrors the gateway's own NormalizeLanguageCode: `language.Split('-')[0].ToLowerInvariant()`. */
export function normalizeLanguageCode(value?: string | null): string {
  if (!value) return "";
  return value.trim().toLowerCase().split(/[-_]/)[0] ?? "";
}

/**
 * A candidate is usable only if it names a real language. Empty, whitespace and the "auto"
 * sentinel all mean "nothing was chosen" and must fall through to the next source rather
 * than terminate the chain.
 */
function candidate(value?: string | null): string | null {
  const normalized = normalizeLanguageCode(value);
  if (!normalized || normalized === UNRESOLVED_LANGUAGE) return null;
  return normalized;
}

/** First source that names a real language, or null when none do. */
function firstChoice(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const chosen = candidate(value);
    if (chosen) return chosen;
  }
  return null;
}

export type MeetingLanguageSources = {
  /** In-session pick — media bar dropdown or the language picker modal. Highest priority. */
  pick?: string | null;
  /** sessionStorage "warptalk.join.preview", already scoped to this room by readMeetingJoinState. */
  saved?: string | null;
  /** This viewer's own row from GET /translation-rooms/{id}/participants. */
  participant?: string | null;
};

export type RoomLanguageDefaults = {
  sourceLanguage?: string | null;
  targetLanguages?: string[] | null;
};

/**
 * The room's default LISTEN language: the first configured target that is not the room's own
 * source language, else the first target, else English. Unchanged from the previous inline
 * expression — only its position in the chain moved.
 */
export function resolveRoomDefaultListenLanguage(
  room?: RoomLanguageDefaults | null,
): string {
  if (!room) return "en";
  const source = normalizeLanguageCode(room.sourceLanguage);
  const targets = (room.targetLanguages ?? [])
    .map((language) => normalizeLanguageCode(language))
    .filter((language) => language && language !== UNRESOLVED_LANGUAGE);

  return targets.find((language) => language !== source) ?? targets[0] ?? "en";
}

/**
 * Listen (output) language. Always resolves to a concrete code — a listener with no language
 * has nothing to receive, so there is no "unresolved" listen state.
 */
export function resolveListenLanguage(
  sources: MeetingLanguageSources,
  room?: RoomLanguageDefaults | null,
): string {
  return (
    firstChoice(sources.pick, sources.saved, sources.participant) ??
    resolveRoomDefaultListenLanguage(room)
  );
}

/**
 * Speak (source) language. Same precedence, but the room-level last resort is the room's own
 * configured source language rather than a target.
 *
 * Returns UNRESOLVED_LANGUAGE only when literally nothing is known — no pick, no session
 * storage, no participant row (the participants query is gated on an established meeting
 * session, so it can still be in flight during the first seconds of a join) and no loaded
 * room. Callers must not send that value to the gateway; the SetSpeakLanguage effect
 * reconciles once a real value resolves.
 */
export function resolveSpeakLanguage(
  sources: MeetingLanguageSources,
  room?: RoomLanguageDefaults | null,
): string {
  return (
    firstChoice(sources.pick, sources.saved, sources.participant, room?.sourceLanguage) ??
    UNRESOLVED_LANGUAGE
  );
}

/** True when `speakLanguage` names a real language and may be sent to the gateway. */
export function isResolvedSpeakLanguage(speakLanguage?: string | null): boolean {
  return candidate(speakLanguage) !== null;
}
