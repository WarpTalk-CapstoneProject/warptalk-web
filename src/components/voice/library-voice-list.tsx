"use client";

import { useMemo } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VoiceChip, VoiceLine } from "@/components/voice/voice-line";
import { VoicePreviewButton } from "@/components/voice/voice-preview-button";
import {
  WorkspaceListModule,
  WorkspaceRailModule,
} from "@/components/workspace/page-chrome";
import { getErrorMessage } from "@/lib/api/errors";
import { useSetPreferredVoice, useVoiceCatalog } from "@/hooks/use-voice-profiles";
import { describeSavedVoice } from "@/lib/voice/voice-preference";
import { getLanguageName, languagesInScope } from "@/lib/language/languages";
import type { VoiceProfileDto } from "@/types/voice-profile";
import { PagePlaceholder } from "@/components/workspace/page-placeholder";

/**
 * The bare ISO-639-1 code the AI worker keys its catalog by. Voice profiles store locale tags
 * ("vi-VN"), and the backend normalises anyway, but comparing bare codes keeps the react-query
 * cache key stable across both spellings.
 */
function bareLanguage(language: string) {
  return language.split(/[-_]/)[0]?.toLowerCase() ?? language;
}

const LANGUAGES = languagesInScope("voiceCatalog");

/** The stand-in voice this person picked for speakers who chose none, for one language. */
function usePreferredVoiceId(profiles: VoiceProfileDto[], language: string) {
  return useMemo(() => {
    const match = profiles.find(
      (profile) =>
        profile.provider === "cartesia" &&
        profile.providerVoiceId &&
        bareLanguage(profile.language ?? "") === language,
    );
    return match?.providerVoiceId ?? null;
  }, [profiles, language]);
}

/**
 * The provider's public voices for one language, as rows.
 *
 * WHY THIS IS NOT A GRID OF CARDS ANY MORE
 *     Each card carried a name and a gender and nothing else, and a tappable bordered tile per
 *     voice was the loudest thing on a page whose subject is somebody's own recordings. As rows
 *     the play button lands in the same place as it does in the list above, so both read as one
 *     catalogue of voices rather than two unrelated features.
 *
 * Choosing here stores the pick per language and applies it the next time this person joins a
 * room — see the room page, which hands it to TranslationRoomHub.SetVoicePreference when they
 * have not already chosen a voice in that room. It never overrides an in-room choice.
 */
export function LibraryVoiceList({
  profiles,
  language,
  onLanguageChange,
  search,
}: {
  profiles: VoiceProfileDto[];
  language: string;
  onLanguageChange: (language: string) => void;
  search: string;
}) {
  const catalogQuery = useVoiceCatalog(language);
  const setPreferred = useSetPreferredVoice();
  const currentVoiceId = usePreferredVoiceId(profiles, language);

  const voices = useMemo(() => catalogQuery.data ?? [], [catalogQuery.data]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return voices;
    return voices.filter((voice) => voice.name.toLowerCase().includes(query));
  }, [voices, search]);

  function choose(voiceId: string | null) {
    setPreferred.mutate(
      { language, voiceId },
      {
        onSuccess: () =>
          toast.success(
            voiceId
              ? "Saved — used for speakers in this language who have no voice of their own."
              : "Cleared — back to the automatic voice.",
          ),
        onError: (error) =>
          toast.error(getErrorMessage(error, "Could not save the stand-in voice.")),
      },
    );
  }

  return (
    <WorkspaceListModule
      title="Library voices"
      count={catalogQuery.isLoading ? undefined : voices.length}
      actions={
        <Select value={language} onValueChange={(value) => onLanguageChange(value ?? language)}>
          <SelectTrigger
            className="h-[28px] w-[152px] rounded-full text-[12.5px]"
            aria-label="Language for the voice library"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LANGUAGES.map((item) => (
              <SelectItem key={item.code} value={item.code}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    >
      {catalogQuery.isLoading ? (
        <p className="px-1.5 py-4 text-[12.5px] text-ink-subtle">Loading voices…</p>
      ) : voices.length === 0 ? (
        // A cold catalog is the normal state before the AI worker's first synthesis for this
        // language — say so plainly instead of showing it as a failure.
        <div className="pt-3">
          <PagePlaceholder
            kind="voice-profiles"
            className="min-h-[240px]"
            title={`No voices for ${getLanguageName(language)} yet`}
            description="They appear after the first translation into this language in a meeting."
          />
        </div>
      ) : filtered.length === 0 ? (
        <p className="px-1.5 py-4 text-[12.5px] text-ink-subtle">
          No library voice matches that search.
        </p>
      ) : (
        filtered.map((voice) => {
          const active = voice.id === currentVoiceId;
          return (
            <VoiceLine
              key={voice.id}
              tone="library"
              name={voice.name}
              badge={active ? <VoiceChip tone="active">Stand-in</VoiceChip> : undefined}
              secondary={voice.gender ? capitalise(voice.gender) : "—"}
              statusText={active ? "Your stand-in" : undefined}
              actions={
                <>
                  <VoicePreviewButton voiceId={voice.id} language={language} label={voice.name} />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[12px] text-primary hover:text-primary"
                    disabled={setPreferred.isPending}
                    onClick={() => choose(active ? null : voice.id)}
                  >
                    {active ? "Clear" : "Use"}
                  </Button>
                </>
              }
            />
          );
        })
      )}
    </WorkspaceListModule>
  );
}

/**
 * The stand-in voice: what a speaker who has chosen nothing sounds like TO THIS READER.
 *
 * WHY IT IS NOT CALLED "VOICES YOU HEAR" ANY MORE
 *     That title promised something the product deliberately does not do, and a reader who
 *     believed it would conclude the feature was broken. Whose voice a dub is spoken in is the
 *     SPEAKER's decision — TTSWorker._resolve_voice_variants returns early on a speaker who
 *     cloned their voice or picked one, and never renders a listener's alternative for them.
 *     Only the LANGUAGE is the listener's. What is set here replaces the automatic
 *     hashed-from-speaker-id stand-in, and only for people who have expressed no preference at
 *     all. The old title read as a veto over everyone.
 *
 * A readout, not a second picker: the list on the left is the editor, and giving the same
 * setting two controls is how the page ended up with three independent language dropdowns that
 * could each hold a different answer.
 */
export function ListeningVoiceSummary({
  profiles,
  language,
}: {
  profiles: VoiceProfileDto[];
  language: string;
}) {
  const currentVoiceId = usePreferredVoiceId(profiles, language);
  const catalogQuery = useVoiceCatalog(language);
  const setPreferred = useSetPreferredVoice();

  const label = useMemo(
    () => describeSavedVoice(currentVoiceId, catalogQuery.data ?? [], catalogQuery.isLoading),
    [currentVoiceId, catalogQuery.data, catalogQuery.isLoading],
  );

  const headline =
    label.state === "named"
      ? label.name
      : label.state === "loading"
        ? "Loading…"
        : label.state === "unavailable"
          ? "Saved voice"
          : "Automatic";

  return (
    <WorkspaceRailModule
      title="Stand-in voice"
      description={`Used for a speaker in ${getLanguageName(language)} who has not picked a voice of their own. Anyone who has, you hear as themselves.`}
    >
      <p className="text-[13px] font-medium text-ink">{headline}</p>
      {label.state === "unavailable" ? (
        // Said plainly instead of shown as a name, because it is not one and because the
        // preference genuinely is not being applied — resolveSavedVoiceForLanguage drops an id
        // the catalogue does not currently offer rather than sending a voice that would
        // silently fall back. The id itself is not shown: a UUID is not an answer to "which
        // voice is this".
        <p className="text-[11.5px] leading-snug text-ink-subtle">
          Not offered for {getLanguageName(language)} right now, so the automatic voice is used
          until it is. The catalogue fills after the first translation into this language.
        </p>
      ) : null}
      {currentVoiceId ? (
        <div className="flex items-center justify-between gap-2">
          {/* Only when the catalogue can name it: previewing an id the catalogue does not
              offer is refused by IsVoiceChoosableByAsync, so the button could only fail. */}
          {label.state === "named" ? (
            <VoicePreviewButton
              voiceId={currentVoiceId}
              language={language}
              label="the stand-in voice"
              variant="inline"
            />
          ) : (
            <span />
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 px-2 text-[12px] text-ink-muted"
            disabled={setPreferred.isPending}
            onClick={() =>
              setPreferred.mutate(
                { language, voiceId: null },
                {
                  onSuccess: () => toast.success("Cleared — back to the automatic voice."),
                  onError: (error) =>
                    toast.error(getErrorMessage(error, "Could not clear the stand-in voice.")),
                },
              )
            }
          >
            Clear
          </Button>
        </div>
      ) : (
        <p className="text-[11.5px] text-ink-subtle">
          Press Use on a library voice to pick one for this language.
        </p>
      )}
    </WorkspaceRailModule>
  );
}

function capitalise(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
