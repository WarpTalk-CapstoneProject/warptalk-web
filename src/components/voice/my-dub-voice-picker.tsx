"use client";

import { useMemo } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

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
 *     The catalogue on the left sets the STAND-IN voice — what somebody who has chosen nothing
 *     sounds like to this reader. This one sets how YOU sound, to everybody. Until WT-396 those
 *     were the same stored thing, so somebody who uploaded a recording of their own voice
 *     changed neither: the profile was listed as active, and the dub still came back in a stock
 *     catalogue voice because nothing in the pipeline read the choice.
 *
 *     The two are therefore worded around the direction, not around the word "voice". "You are
 *     dubbed in" and "stand-in voice" is a distinction somebody can act on; two controls both
 *     labelled "Voice" is the bug in UI form. The rail said "Voices you hear", which was worse
 *     than vague — it claimed a veto the listener does not have, because a speaker who cloned
 *     or picked a voice is always heard as themselves (TTSWorker._resolve_voice_variants).
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
  const t = useTranslations("voiceProfiles.dubPicker");
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
    if (!chosen) return t("cloneLiveOption");
    const ownMatch = profiles.find((profile) => profile.providerVoiceId === chosen);
    if (ownMatch) return ownMatch.displayName || t("myVoice");
    const catalogMatch = catalog.find((voice) => voice.id === chosen);
    if (catalogMatch) return catalogMatch.name;
    // WT-649: was `return chosen`, which rendered a raw provider UUID into the select. The
    // catalogue is empty while its query is in flight and stays empty for a language the TTS
    // worker has not warmed yet, so this branch is reached in normal use, not just on bad data.
    return t("voiceYouPicked");
  }, [chosen, profiles, catalog, t]);

  function choose(value: string) {
    const voiceId = value === LIVE_CLONE ? null : value;
    // The catalogue needs a language to validate against; a voice of your own does not.
    const fromOwnProfile = usableProfiles.some((profile) => profile.providerVoiceId === voiceId);

    setDubVoice.mutate(
      { voiceId, language: fromOwnProfile ? null : language },
      {
        onSuccess: () =>
          toast.success(
            voiceId ? t("toasts.savedDubbed") : t("toasts.backToLiveClone"),
          ),
        onError: (error) =>
          toast.error(getErrorMessage(error, t("toasts.saveFailed"))),
      },
    );
  }

  return (
    <WorkspaceRailModule
      title={t("title")}
      description={t("description")}
    >
      <Select
        value={chosen ?? LIVE_CLONE}
        onValueChange={(value) => choose(value ?? LIVE_CLONE)}
        disabled={isLoading || setDubVoice.isPending}
      >
        <SelectTrigger className="h-8 w-full text-[12.5px]" aria-label={t("ariaLabel")}>
          <SelectValue>{selectedVoiceName}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={LIVE_CLONE}>{t("cloneLiveOption")}</SelectItem>

          {usableProfiles.length > 0 && (
            <SelectGroup>
              <SelectLabel>{t("yourVoicesGroup")}</SelectLabel>
              {usableProfiles.map((profile) => (
                <SelectItem key={profile.id} value={profile.providerVoiceId!}>
                  {profile.displayName ?? t("myVoice")}
                </SelectItem>
              ))}
            </SelectGroup>
          )}

          {catalog.length > 0 && (
            <SelectGroup>
              <SelectLabel>{t("libraryVoicesGroup", { language: getLanguageName(language) })}</SelectLabel>
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
            label={t("ariaLabel")}
            variant="inline"
          />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 px-2 text-[12px] text-ink-muted"
            onClick={() => choose(LIVE_CLONE)}
            disabled={setDubVoice.isPending}
          >
            {t("cloneMeLiveInstead")}
          </Button>
        </div>
      ) : null}
    </WorkspaceRailModule>
  );
}
