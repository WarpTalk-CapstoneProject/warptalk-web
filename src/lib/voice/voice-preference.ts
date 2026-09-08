/** Minimal shapes so this stays testable without dragging in the full DTOs. */
type SavedVoiceProfile = {
  provider?: string | null;
  providerVoiceId?: string | null;
  language?: string | null;
  /** "library" on a PICK. See profile-status.ts `isLibraryVoicePointer`. */
  source?: string | null;
  /** Was null on every pick until the backend started storing the catalogue voice's name, and
   *  is the fallback test for rows written before then. */
  displayName?: string | null;
};

type CatalogVoice = { id: string };

/** A catalogue entry carries a name. An id is not one, and must never stand in for one. */
type NamedCatalogVoice = { id: string; name?: string | null };

/**
 * What a saved voice id can honestly be called on screen.
 *
 * "unavailable" is the one that matters and the one that was missing. The catalogue is a
 * TTL'd cache the AI worker fills on its first synthesis into a language, so an empty or
 * expired catalogue is a NORMAL state, not a failure — and while it lasts, a saved id cannot
 * be named. The readout used to fall back to printing the id, so a person's settings page
 * showed them a raw UUID.
 *
 * It is also not merely cosmetic. `resolveSavedVoiceForLanguage` below treats an id the
 * catalogue does not currently offer as ABSENT and does not send it to the hub at all. So the
 * exact moment the name cannot be resolved is the exact moment the preference is not in
 * effect, and a readout that implies otherwise is telling the reader something untrue.
 */
export type SavedVoiceLabel =
  | { state: "none" }
  | { state: "loading" }
  | { state: "named"; name: string }
  /** Known by name when the row carries one, and still not in effect. Both halves matter. */
  | { state: "unavailable"; name?: string };

export function describeSavedVoice(
  voiceId: string | null | undefined,
  catalog: NamedCatalogVoice[],
  catalogLoading: boolean,
  /**
   * The name stored ON THE ROW when the pick was made, if there is one.
   *
   * The backend captures it from the catalogue at that moment — the one moment the cache is
   * guaranteed warm, because the person is choosing from a list they can see. It is what lets
   * this say "Linh - Soft Presence" months later instead of a UUID.
   *
   * It does NOT promote the voice to "named". A cold catalogue still means the pick is not
   * being applied (see resolveSavedVoiceForLanguage), so naming it outright would go back to
   * implying a setting is in effect when it is not. It names the unavailable state instead.
   */
  savedName?: string | null,
): SavedVoiceLabel {
  if (!voiceId) return { state: "none" };

  const name = catalog.find((voice) => voice.id === voiceId)?.name?.trim();
  if (name) return { state: "named", name };

  // Loading is checked AFTER the lookup, not before: a warm react-query cache hands the
  // catalogue over while a background refetch is still in flight, and flashing "Loading…"
  // over a name we already have reads as the setting flickering.
  if (catalogLoading) return { state: "loading" };

  const stored = savedName?.trim();
  return stored ? { state: "unavailable", name: stored } : { state: "unavailable" };
}

/** In-room pick for one language. `voiceId: null` means "cleared here, use no voice pick". */
type InRoomSelection = { language: string; voiceId: string | null } | null;

/** "vi-VN" and "vi" must match — rooms carry locale tags, the catalog is keyed bare. */
function bare(value: string) {
  return value.split(/[-_]/)[0]?.toLowerCase() ?? value;
}

/**
 * The library voice this user picked on the Voice Profiles page for `language`, or null.
 *
 * A saved id the provider no longer offers for this language is treated as absent: passing it
 * on would have synthesis quietly fall back to a different voice, which looks like the
 * preference being ignored rather than being stale.
 *
 * WHAT THIS USED TO GET WRONG
 *     It matched the person's OWN finished clone. Provider is "cartesia" for both a catalogue
 *     pick and a cloned upload, so the predicate found whichever row came first — and a
 *     personal clone id, not being in the public catalogue, was then dropped by the check
 *     below. Harmless by accident here, and not harmless at all in the rail that displayed it.
 *
 * A COLD CATALOGUE DISCARDS THE PICK, AND THAT IS DELIBERATE
 *     `[].some()` is false, so an empty catalogue reads as "not offered" — see the test
 *     "nothing is applied while the catalog is still cold". It looks like an oversight and is
 *     not: an unverifiable id is not sent, so the meeting falls back to the automatic voice
 *     rather than to a silent Cartesia substitution. What was missing was the UI saying so.
 *     `describeSavedVoice` now reports that state instead of naming the voice confidently, so
 *     the readout and this resolver tell the reader the same story.
 */
export function resolveSavedVoiceForLanguage(
  savedProfiles: SavedVoiceProfile[] | undefined,
  language: string,
  catalog: CatalogVoice[],
): string | null {
  const saved = savedProfiles?.find(
    (profile) =>
      profile.provider === "cartesia" &&
      profile.providerVoiceId &&
      // Source first, name second — the same two-step as isLibraryVoicePointer, and for the
      // same reason: a pick now carries the catalogue voice's name, so "no name" only still
      // identifies rows written before that.
      (profile.source === "library" || !profile.displayName?.trim()) &&
      bare(profile.language ?? "") === bare(language),
  );
  if (!saved?.providerVoiceId) return null;
  return catalog.some((voice) => voice.id === saved.providerVoiceId)
    ? saved.providerVoiceId
    : null;
}

/**
 * Which voice id to send to TranslationRoomHub.SetVoicePreference.
 *
 * Precedence: a choice made in THIS room for THIS language always wins, including an
 * explicit clear. Only when the user has made no choice for this language does the saved
 * profile default apply. That distinction is why the in-room selection is stored as a whole
 * {language, voiceId} object rather than a bare id — `{language, voiceId: null}` ("cleared
 * here") and "no entry for this language" have to mean different things.
 */
export function resolveVoicePreference(
  selection: InRoomSelection,
  language: string,
  savedProfiles: SavedVoiceProfile[] | undefined,
  catalog: CatalogVoice[],
): string | null {
  if (selection?.language === language) return selection.voiceId;
  return resolveSavedVoiceForLanguage(savedProfiles, language, catalog);
}
