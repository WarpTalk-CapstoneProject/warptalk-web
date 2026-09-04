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
