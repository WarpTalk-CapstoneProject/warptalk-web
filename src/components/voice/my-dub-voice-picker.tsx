"use client";

import { useMemo, useState } from "react";
import { Fingerprint } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getErrorMessage } from "@/lib/api/errors";
import { useDubVoice, useSetDubVoice, useVoiceCatalog } from "@/hooks/use-voice-profiles";
import { languagesInScope } from "@/lib/language/languages";
import type { VoiceProfileDto } from "@/types/voice-profile";

/** Sentinel for the empty choice. Radix Select cannot hold "" as an item value. */
const LIVE_CLONE = "__live_clone__";

const LANGUAGES = languagesInScope("voiceCatalog").map((language) => ({
  value: language.code,
  label: language.name,
}));

function bareLanguage(language: string) {
  return language.split(/[-_]/)[0]?.toLowerCase() ?? language;
}

/**
 * The voice this person is DUBBED IN — how they sound to everybody else.
 *
 * WHY THIS IS NOT THE PICKER NEXT TO IT
 *     LibraryVoicePicker sets the voice you HEAR other people in. This one sets how YOU sound.
 *     Until WT-396 those were the same stored thing, so somebody who uploaded a recording of
 *     their own voice changed neither: the profile was listed as active, and the dub still came
 *     back in a stock catalogue voice because nothing in the pipeline ever read the choice.
 *
 *     The two controls are therefore worded around the direction, not around the word "voice".
 *     "Your voice" and "voices you hear" is the distinction a person can act on; two dropdowns
 *     both labelled "Voice" is the bug in UI form.
 *
 * WHY "CLONE LIVE" IS AN EXPLICIT OPTION AND THE DEFAULT
 *     Leaving it unset is a real, working choice — the system builds a voice from the first
 *     twenty seconds of what you say in the meeting. Hiding that behind an empty dropdown makes
 *     it look broken; naming it makes "I have not chosen" legible.
 */
export function MyDubVoicePicker({ profiles }: { profiles: VoiceProfileDto[] }) {
  const [language, setLanguage] = useState(LANGUAGES[0]?.value ?? "en");
  const { data: chosen, isLoading } = useDubVoice();
  const { data: catalog = [] } = useVoiceCatalog(bareLanguage(language));
  const setDubVoice = useSetDubVoice();

  // Only profiles that actually have a provider voice behind them can be chosen. An uploaded
  // recording has none until it has been cloned, and offering it would let somebody pick a voice
  // that cannot be used — the same silent nothing this ticket exists to remove.
  const usableProfiles = useMemo(
    () => profiles.filter((profile) => Boolean(profile.providerVoiceId) && profile.isActive),
    [profiles],
  );

  const pendingProfiles = useMemo(
    () => profiles.filter((profile) => !profile.providerVoiceId),
    [profiles],
  );

  function choose(value: string) {
    const voiceId = value === LIVE_CLONE ? null : value;
    // The catalogue needs a language to validate against; a voice of your own does not.
    const fromOwnProfile = usableProfiles.some((p) => p.providerVoiceId === voiceId);

    setDubVoice.mutate(
      { voiceId, language: fromOwnProfile ? null : bareLanguage(language) },
      {
        onSuccess: () =>
          toast.success(
            voiceId ? "Saved. You will be dubbed in this voice." : "Back to cloning your voice live.",
          ),
        onError: (error) =>
          toast.error(getErrorMessage(error, "Could not save the voice you are dubbed in.")),
      },
    );
  }

  return (
    <section className="mx-4 space-y-3 border-b border-border py-4">
      <div className="flex items-center gap-2">
        <Fingerprint size={16} weight="duotone" className="text-ink-muted" />
        <h2 className="text-sm font-semibold text-ink">Your voice</h2>
      </div>
      <p className="text-xs text-ink-muted">
        How you sound to people listening in another language. This is not the same as the voices
        you hear other people in, below.
      </p>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Select value={language} onValueChange={(value) => setLanguage(value ?? language)}>
          <SelectTrigger className="sm:w-44" aria-label="Language for the voice list">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LANGUAGES.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={chosen ?? LIVE_CLONE}
          onValueChange={(value) => choose(value ?? LIVE_CLONE)}
          disabled={isLoading || setDubVoice.isPending}
        >
          <SelectTrigger className="flex-1" aria-label="The voice you are dubbed in">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={LIVE_CLONE}>
              Clone my voice during the meeting (default)
            </SelectItem>

            {usableProfiles.length > 0 && (
              <SelectGroup>
                <SelectLabel>Your voice profiles</SelectLabel>
                {usableProfiles.map((profile) => (
                  <SelectItem key={profile.id} value={profile.providerVoiceId!}>
                    {profile.displayName ?? "My voice"}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}

            {catalog.length > 0 && (
              <SelectGroup>
                <SelectLabel>Library voices</SelectLabel>
                {catalog.map((voice) => (
                  <SelectItem key={voice.id} value={voice.id}>
                    {voice.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
          </SelectContent>
        </Select>
      </div>

      {pendingProfiles.length > 0 && (
        // Named rather than silently omitted. A profile that is uploaded but not yet usable is
        // exactly what the original report was about — somebody uploaded a recording, saw it
        // listed, and reasonably assumed it was in use.
        <p className="text-[11px] text-ink-subtle">
          {pendingProfiles.length === 1 ? "One recording is" : `${pendingProfiles.length} recordings are`}{" "}
          uploaded but not yet turned into a usable voice, so {pendingProfiles.length === 1 ? "it is" : "they are"}{" "}
          not listed above.
        </p>
      )}

      {chosen && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => choose(LIVE_CLONE)}
          disabled={setDubVoice.isPending}
        >
          Use my real voice instead
        </Button>
      )}
    </section>
  );
}
