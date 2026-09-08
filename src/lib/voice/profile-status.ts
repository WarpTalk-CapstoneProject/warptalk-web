import type { VoiceProfileDto } from "@/types/voice-profile";

/**
 * Whether a profile is still being built by the provider.
 *
 * The row carries no explicit "cloning" status — it is inferred from the absence of a provider
 * voice, because that is the field that decides whether the profile can be used in a meeting at
 * all. `clone_failed` is the one terminal state that also has no provider voice, so it has to be
 * excluded or a failed clone polls forever.
 *
 * WT-598: this lives on its own so the list that LABELS a row "Cloning" and the query that decides
 * whether to keep asking the server cannot disagree. They did: the label was right and nothing
 * refetched, so a finished clone kept reading "Cloning" until the reader navigated away and back.
 */
export function isVoiceProfileCloning(profile: VoiceProfileDto): boolean {
  return profile.status !== "clone_failed" && !profile.providerVoiceId;
}

/** True when any profile in the list is still being built. */
export function hasCloningVoiceProfile(profiles: VoiceProfileDto[] | undefined): boolean {
  return (profiles ?? []).some(isVoiceProfileCloning);
}

/**
 * A row that is not a voice of this person's at all — it is their PICK of a catalogue voice,
 * kept in the same table as their own recordings.
 *
 * WHY THE MARKER IS A MISSING NAME, OF ALL THINGS
 *     Because nothing else separates them any more. `SetPreferredVoiceAsync` writes
 *     `Provider = "cartesia"`, and so does `CollectFinishedClonesAsync` when somebody's OWN
 *     uploaded recording finishes cloning — a clone lives in the Cartesia account too. `Source`
 *     does not help either: the entity defaults it to "upload" and the preference path never
 *     sets it. The one field that differs is DisplayName, which is null for a preference and is
 *     required for an upload ("Display name is required.") and generated for a carry-over
 *     clone ("My voice (vi-VN)"). So a nameless row IS the marker, for now.
 *
 * WHAT IT COST TO NOT HAVE THIS
 *     Every "is this the library voice I picked?" predicate matched on provider and language,
 *     so a person's OWN cloned voice answered yes. The stand-in rail then showed their own
 *     clone's provider id — a raw UUID, because a personal clone is not in the public catalogue
 *     and cannot be named from it. The same rows also appeared under "Your voices" as
 *     "Untitled profile", counted toward the "Mine" total, and were offered in the
 *     be-dubbed-in-this picker.
 *
 *     This is WT-396 recurring in the read path: two different things in one table, told apart
 *     by a field that stopped telling them apart. The durable fix is an explicit source on the
 *     row; until the backend carries one, this is the honest test.
 *
 * The provider-voice condition is deliberate belt-and-braces: it makes the failure direction
 * "show a stray row" rather than "hide a real voice of somebody's".
 */
export function isLibraryVoicePointer(profile: VoiceProfileDto): boolean {
  return !profile.displayName?.trim() && Boolean(profile.providerVoiceId);
}

/** Only the voices this person actually made — what "Your voices" and "Mine" mean. */
export function ownVoiceProfiles(profiles: VoiceProfileDto[]): VoiceProfileDto[] {
  return profiles.filter((profile) => !isLibraryVoicePointer(profile));
}
