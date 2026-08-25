"use client";

import { useMemo } from "react";
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
import { VoicePreviewButton } from "@/components/voice/voice-preview-button";
import { WorkspaceRailModule } from "@/components/workspace/page-chrome";
import { getLanguageName } from "@/lib/language/languages";
import { getErrorMessage } from "@/lib/api/errors";
import { useDubVoice, useSetDubVoice, useVoiceCatalog } from "@/hooks/use-voice-profiles";
import type { VoiceProfileDto } from "@/types/voice-profile";

/** Sentinel for the empty choice. Radix Select cannot hold "" as an item value. */
const LIVE_CLONE = "__live_clone__";

function bareLanguage(language: string) {
  return language.split(/[-_]/)[0]?.toLowerCase() ?? language;
}

/**
 * The voice this person is DUBBED IN — how they sound to everybody else.
 *
 * WHY THIS IS NOT THE LIST BESIDE IT
 *     The catalogue on the left sets the voice you HEAR other people in. This one sets how YOU
 *     sound. Until WT-396 those were the same stored thing, so somebody who uploaded a recording
 *     of their own voice changed neither: the profile was listed as active, and the dub still
 *     came back in a stock catalogue voice because nothing in the pipeline read the choice.
 *
 *     The two are therefore worded around the direction, not around the word "voice". "You are
 *     dubbed in" and "voices you hear" is a distinction somebody can act on; two controls both
 *     labelled "Voice" is the bug in UI form.
 *
 * WHY THE LANGUAGE IS NOT CHOSEN HERE
 *     It is the page's language — the one the catalogue on the left is showing. This module had
 *     its own language dropdown, the catalogue had a second, and the listening default had a
 *     third, all of them independent, so the page asked the same question three times and could
 *     hold three different answers to it.
 *
 * WHY "CLONE LIVE" IS AN EXPLICIT OPTION AND THE DEFAULT
 *     Leaving it unset is a real, working choice — the meeting builds a voice from the first
 *     seconds of what you say. Hiding that behind an empty dropdown makes it look broken; naming
 *     it makes "I have not chosen" legible.
 */
export function MyDubVoicePicker({
  profiles,
  language,
}: {
  profiles: VoiceProfileDto[];
  /** Bare ISO-639-1, from the page. Decides which library voices are on offer here. */
  language: string;
}) {
  const { data: chosen, isLoading } = useDubVoice();
  const { data: catalog = [] } = useVoiceCatalog(language);
  const setDubVoice = useSetDubVoice();

  // Only profiles with a provider voice behind them can be chosen. An uploaded recording has
  // none until it has been cloned, and offering it would let somebody pick a voice that cannot
  // be used — the same silent nothing this ticket exists to remove.
  const usableProfiles = useMemo(
    () => profiles.filter((profile) => Boolean(profile.providerVoiceId) && profile.isActive),
    [profiles],
  );

  const selectedVoiceName = useMemo(() => {
    if (!chosen) return "Clone my voice live in the meeting";
    const ownMatch = profiles.find((profile) => profile.providerVoiceId === chosen);
    if (ownMatch) return ownMatch.displayName || "My voice";
    const catalogMatch = catalog.find((voice) => voice.id === chosen);
    if (catalogMatch) return catalogMatch.name;
    return chosen;
  }, [chosen, profiles, catalog]);

  function choose(value: string) {
    const voiceId = value === LIVE_CLONE ? null : value;
    // The catalogue needs a language to validate against; a voice of your own does not.
    const fromOwnProfile = usableProfiles.some((profile) => profile.providerVoiceId === voiceId);

    setDubVoice.mutate(
      { voiceId, language: fromOwnProfile ? null : language },
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
    <WorkspaceRailModule
      title="You are dubbed in"
      description="How you sound to people listening in another language."
    >
      <Select
        value={chosen ?? LIVE_CLONE}
        onValueChange={(value) => choose(value ?? LIVE_CLONE)}
        disabled={isLoading || setDubVoice.isPending}
      >
        <SelectTrigger className="h-8 w-full text-[12.5px]" aria-label="The voice you are dubbed in">
          <SelectValue>{selectedVoiceName}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={LIVE_CLONE}>Clone my voice live in the meeting</SelectItem>

          {usableProfiles.length > 0 && (
            <SelectGroup>
              <SelectLabel>Your voices</SelectLabel>
              {usableProfiles.map((profile) => (
                <SelectItem key={profile.id} value={profile.providerVoiceId!}>
                  {profile.displayName ?? "My voice"}
                </SelectItem>
              ))}
            </SelectGroup>
          )}

          {catalog.length > 0 && (
            <SelectGroup>
              <SelectLabel>Library voices · {getLanguageName(language)}</SelectLabel>
              {catalog.map((voice) => (
                <SelectItem key={voice.id} value={voice.id}>
                  {voice.name}
                </SelectItem>
              ))}
            </SelectGroup>
          )}
        </SelectContent>
      </Select>

      {/*
        Beside the choice rather than inside the list: this is where somebody decides how they
        will sound, so it is where they should be able to check. Live cloning has nothing to
        play — the voice does not exist until the meeting builds it.
      */}
      {chosen ? (
        <div className="flex items-center justify-between gap-2">
          <VoicePreviewButton
            voiceId={chosen}
            language={bareLanguage(language)}
            label="the voice you are dubbed in"
            variant="inline"
          />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 px-2 text-[12px] text-ink-muted"
            onClick={() => choose(LIVE_CLONE)}
            disabled={setDubVoice.isPending}
          >
            Clone me live instead
          </Button>
        </div>
      ) : null}
    </WorkspaceRailModule>
  );
}
