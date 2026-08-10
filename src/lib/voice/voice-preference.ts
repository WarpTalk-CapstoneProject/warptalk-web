/** Minimal shapes so this stays testable without dragging in the full DTOs. */
type SavedVoiceProfile = {
  provider?: string | null;
  providerVoiceId?: string | null;
  language?: string | null;
};

type CatalogVoice = { id: string };

/** In-room pick for one language. `voiceId: null` means "cleared here, use no voice pick". */
type InRoomSelection = { language: string; voiceId: string | null } | null;

/** "vi-VN" and "vi" must match — rooms carry locale tags, the catalog is keyed bare. */
function bare(value: string) {
  return value.split(/[-_]/)[0]?.toLowerCase() ?? value;
}

/**
 * The voice this user picked on the Voice Profiles page for `language`, or null.
 *
 * A saved id that the provider no longer offers for this language is treated as absent:
 * passing it on would have synthesis quietly fall back to a different voice, which looks
 * like the preference being ignored rather than being stale.
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
