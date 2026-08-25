"use client";

import { useMemo, useState } from "react";
import { Plus } from "@phosphor-icons/react";

import { ExpandingSearchDock } from "@/components/ui/expanding-search-dock";
import { CreateVoiceProfileDialog } from "@/components/voice/create-voice-profile-dialog";
import { LibraryVoiceList, ListeningVoiceSummary } from "@/components/voice/library-voice-list";
import { MyDubVoicePicker } from "@/components/voice/my-dub-voice-picker";
import { VoiceConsentCard } from "@/components/voice/voice-consent-card";
import {
  profileState,
  VoiceProfileList,
  VoiceProfileSummary,
} from "@/components/voice/voice-profile-list";
import {
  WorkspaceFilterPill,
  WorkspacePage,
  WorkspacePrimaryButton,
  WorkspaceSplit,
  WorkspaceToolbar,
  WorkspaceToolbarDivider,
} from "@/components/workspace/page-chrome";
import { useVoiceProfiles } from "@/hooks/use-voice-profiles";
import { getLanguageLocale } from "@/lib/language/languages";

type VoiceView = "all" | "mine" | "library" | "attention";

/**
 * Voice Profiles, as two things rather than nine rows.
 *
 * WHAT THE PAGE IS FOR
 *     Browsing and choosing voices — your own recordings and the provider's library — and,
 *     separately, the three settings that decide what happens with them. Those are different
 *     kinds of work, so they are laid out differently: lists on the left, state in the rail on
 *     the right, one hairline between them. See WorkspaceSplit for why that is not cards.
 *
 * WHAT WAS REMOVED, AND WHY IT IS NOT MISSING
 *     A three-tile metric strip (Profiles / With sample / Default language) — the first two said
 *     what the list one line below said, and the third was hardcoded to "vi-VN" and so was not a
 *     fact about anybody's account. The count moved into the section eyebrow and the rail's
 *     summary module.
 *
 *     A "readyCount/total sample ready" badge — a third telling of the same number.
 *
 *     Filter pills reading VI / EN / JA — three hardcoded languages out of the fourteen in the
 *     registry. The divisions that actually exist here are yours, the library's, and the ones
 *     that need attention.
 *
 *     Two of the three language dropdowns. The catalogue's language is now the page's: it picks
 *     which library voices are listed, which ones the dub picker offers, and which language the
 *     listening default applies to. Three independent copies of one question could hold three
 *     different answers.
 */
export default function VoiceProfilesPage() {
  const { data, isLoading } = useVoiceProfiles();

  const [view, setView] = useState<VoiceView>("all");
  const [search, setSearch] = useState("");
  // Bare ISO-639-1: what the AI worker keys its catalog by, and what the whole page shares.
  const [language, setLanguage] = useState("vi");
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const profiles = useMemo(() => data ?? [], [data]);
  const needingAttention = useMemo(
    () => profiles.filter((profile) => profileState(profile).tone !== "ready").length,
    [profiles],
  );

  const showMine = view !== "library";
  const showLibrary = view === "all" || view === "library";

  return (
    <WorkspacePage>
      <WorkspaceToolbar
        filters={
          <>
            <WorkspaceFilterPill
              label="All voices"
              selected={view === "all"}
              onClick={() => setView("all")}
            />
            <WorkspaceFilterPill
              label="Mine"
              count={profiles.length}
              selected={view === "mine"}
              onClick={() => setView("mine")}
            />
            <WorkspaceFilterPill
              label="Library"
              selected={view === "library"}
              onClick={() => setView("library")}
            />
            <WorkspaceFilterPill
              label="Needs attention"
              count={needingAttention}
              selected={view === "attention"}
              onClick={() => setView("attention")}
            />
          </>
        }
        actions={
          <>
            <ExpandingSearchDock
              value={search}
              onValueChange={setSearch}
              placeholder="Search voices..."
              ariaLabel="Search voices"
              collapsedWidth={28}
              expandedWidth={220}
              className="h-[28px] border-border/60 bg-surface-2 text-ink shadow-sm backdrop-blur-md focus-within:bg-surface-1"
              iconButtonClassName="ml-0 size-[26px] hover:bg-surface-3"
              clearButtonClassName="mr-0.5 size-5 hover:bg-surface-3"
              inputClassName="h-[26px] text-[12px]"
            />
            <WorkspaceToolbarDivider />
            <WorkspacePrimaryButton
              onClick={() => setIsCreateOpen(true)}
              icon={<Plus size={13} weight="bold" />}
            >
              Add voice profile
            </WorkspacePrimaryButton>
          </>
        }
      />

      <WorkspaceSplit
        rail={
          <>
            {/* Permission first: it is what the rest of the rail is allowed to do. */}
            <VoiceConsentCard />
            <MyDubVoicePicker profiles={profiles} language={language} />
            <ListeningVoiceSummary profiles={profiles} language={language} />
            <VoiceProfileSummary profiles={profiles} />
          </>
        }
      >
        {showMine ? (
          <VoiceProfileList
            profiles={profiles}
            isLoading={isLoading}
            search={search}
            onlyNeedingAttention={view === "attention"}
            onCreate={() => setIsCreateOpen(true)}
          />
        ) : null}

        {showLibrary ? (
          <LibraryVoiceList
            profiles={profiles}
            language={language}
            onLanguageChange={setLanguage}
            search={search}
          />
        ) : null}
      </WorkspaceSplit>

      <CreateVoiceProfileDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        defaultLanguage={getLanguageLocale(language) ?? "vi-VN"}
      />
    </WorkspacePage>
  );
}
