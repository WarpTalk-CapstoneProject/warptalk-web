"use client";

import { useMemo } from "react";
import { DotsThree } from "@phosphor-icons/react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { VoiceChip, VoiceLine, type VoiceLineTone } from "@/components/voice/voice-line";
import { VoicePreviewButton } from "@/components/voice/voice-preview-button";
import {
  WorkspaceListModule,
  WorkspaceRailModule,
} from "@/components/workspace/page-chrome";
import { getErrorMessage } from "@/lib/api/errors";
import { useDeleteVoiceProfile, useDubVoice, useSetDubVoice } from "@/hooks/use-voice-profiles";
import { getLanguageName } from "@/lib/language/languages";
import type { VoiceProfileDto } from "@/types/voice-profile";
import { PagePlaceholder } from "@/components/workspace/page-placeholder";
import { isVoiceProfileCloning } from "@/lib/voice/profile-status";

/**
 * What has actually become of a recording somebody uploaded.
 *
 * Three states, and the middle one is the one the page kept failing to say out loud: a profile
 * with no provider voice behind it yet has been stored and queued, and is not usable in a
 * meeting. It used to be listed with `status` reading "active" like every other row, which is
 * how somebody uploaded a sample, saw it listed, and reasonably assumed they were being dubbed
 * in it.
 */
/** Optional translator, defaulted to English so `profile.status === "..."` callers that only
 * read `.tone` (e.g. the page's "needs attention" filter) are unaffected either way. */
type ProfileStateTranslator = (key: string) => string;

const DEFAULT_PROFILE_STATE_COPY: Record<string, string> = {
  couldNotClone: "Couldn't clone",
  ready: "Ready",
  cloning: "Cloning",
  cloningDetail: "usually under a minute",
};

export function profileState(
  profile: VoiceProfileDto,
  t: ProfileStateTranslator = (key) => DEFAULT_PROFILE_STATE_COPY[key] ?? key,
): {
  tone: VoiceLineTone;
  label: string;
  detail: string;
} {
  if (profile.status === "clone_failed") {
    return {
      tone: "failed",
      label: t("couldNotClone"),
      // No detail, and not for want of room: the profile row carries no reason. The AI side's
      // failure text is logged and dropped — VoiceProfileService only writes the status — so
      // anything printed here would be a guess dressed as a diagnosis. The Re-record action on
      // the same line is the honest next step.
      detail: "",
    };
  }
  if (!isVoiceProfileCloning(profile)) {
    // Nothing to add. "Ready" is the whole fact, and a second clause repeating it in other words
    // is the kind of filler that made every row look like it had something wrong with it.
    return { tone: "ready", label: t("ready"), detail: "" };
  }
  // WT-598: the same predicate the query polls on — this label and "keep asking the server" have
  // to be the same question, or the row says "Cloning" while nothing is checking.
  return { tone: "pending", label: t("cloning"), detail: t("cloningDetail") };
}

export function VoiceProfileList({
  profiles,
  isLoading,
  search,
  onlyNeedingAttention,
  onCreate,
}: {
  profiles: VoiceProfileDto[];
  isLoading: boolean;
  search: string;
  /** The "Needs attention" filter: everything that is not a usable voice yet. */
  onlyNeedingAttention: boolean;
  onCreate: () => void;
}) {
  const t = useTranslations("voiceProfiles.yourVoices");
  const tRoot = useTranslations("voiceProfiles");
  const deleteProfile = useDeleteVoiceProfile();
  const setDubVoice = useSetDubVoice();
  const { data: dubVoiceId } = useDubVoice();

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return profiles.filter((profile) => {
      const state = profileState(profile);
      if (onlyNeedingAttention && state.tone === "ready") return false;
      if (!query) return true;
      return (
        profile.displayName?.toLowerCase().includes(query) ||
        getLanguageName(profile.language ?? "").toLowerCase().includes(query)
      );
    });
  }, [profiles, search, onlyNeedingAttention]);

  function remove(profile: VoiceProfileDto) {
    deleteProfile.mutate(profile.id, {
      onSuccess: () => toast.success(t("toasts.deleted")),
      onError: (error) => toast.error(getErrorMessage(error, t("toasts.deleteFailed"))),
    });
  }

  function beDubbedIn(profile: VoiceProfileDto, on: boolean) {
    setDubVoice.mutate(
      // A voice of your own needs no language to validate against — see SetDubVoiceRequest.
      { voiceId: on ? profile.providerVoiceId! : null, language: null },
      {
        onSuccess: () =>
          toast.success(
            on ? t("toasts.savedDubbed") : t("toasts.backToLiveClone"),
          ),
        onError: (error) =>
          toast.error(getErrorMessage(error, t("toasts.saveFailed"))),
      },
    );
  }

  return (
    <WorkspaceListModule title={t("title")} count={isLoading ? undefined : profiles.length}>
      {isLoading ? (
        <p className="px-1.5 py-4 text-[12.5px] text-ink-subtle">{t("loading")}</p>
      ) : profiles.length === 0 ? (
        <div className="pt-3">
          <PagePlaceholder
            kind="voice-profiles"
            className="min-h-[240px]"
            title={t("emptyTitle")}
            description={t("emptyDescription")}
            action={
              <Button variant="outline" size="sm" className="h-8 text-[12.5px]" onClick={onCreate}>
                {tRoot("createProfile")}
              </Button>
            }
          />
        </div>
      ) : filtered.length === 0 ? (
        <p className="px-1.5 py-4 text-[12.5px] text-ink-subtle">
          {t("noMatch")}
        </p>
      ) : (
        filtered.map((profile) => {
          const state = profileState(profile, t);
          const isDub = Boolean(profile.providerVoiceId) && profile.providerVoiceId === dubVoiceId;

          return (
            <VoiceLine
              key={profile.id}
              tone={state.tone}
              name={profile.displayName || t("untitledProfile")}
              badge={isDub ? <VoiceChip tone="active">{t("dubbingYou")}</VoiceChip> : undefined}
              secondary={profile.language ? getLanguageName(profile.language) : t("noLanguage")}
              statusText={[state.label, state.detail].filter(Boolean).join(" · ")}
              status={
                <>
                  {state.tone === "ready" ? (
                    <span>{t("ready")}</span>
                  ) : (
                    <VoiceChip tone={state.tone === "failed" ? "failed" : "pending"}>
                      {state.label}
                    </VoiceChip>
                  )}
                  <span className="truncate">{state.detail}</span>
                </>
              }
              actions={
                <>
                  {/*
                    Only once there is a voice behind the profile. An uploaded recording has none
                    until it has been cloned, and offering a play button that cannot play is the
                    same silent nothing this page keeps having to remove.
                  */}
                  {profile.providerVoiceId && profile.language ? (
                    <VoicePreviewButton
                      voiceId={profile.providerVoiceId}
                      language={profile.language}
                      label={profile.displayName || t("untitledProfile")}
                    />
                  ) : null}

                  {state.tone === "failed" ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-[12px] text-primary hover:text-primary"
                      onClick={onCreate}
                    >
                      {t("reRecord")}
                    </Button>
                  ) : null}

                  <DropdownMenu>
                    <DropdownMenuTrigger
                      aria-label={t("actionsFor", { name: profile.displayName || t("untitledProfile") })}
                      className="grid size-7 place-items-center rounded-md text-ink-subtle outline-none transition-colors hover:bg-surface-3 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/40"
                    >
                      <DotsThree size={16} weight="bold" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" sideOffset={6} className="w-56 rounded-[10px]">
                      {profile.providerVoiceId ? (
                        <>
                          <DropdownMenuItem
                            className="cursor-pointer px-2 py-1.5"
                            disabled={setDubVoice.isPending}
                            onClick={() => beDubbedIn(profile, !isDub)}
                          >
                            {isDub ? t("stopBeingDubbed") : t("beDubbedIn")}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                        </>
                      ) : null}
                      <DropdownMenuItem
                        variant="destructive"
                        className="cursor-pointer px-2 py-1.5"
                        disabled={deleteProfile.isPending}
                        onClick={() => remove(profile)}
                      >
                        {t("deleteProfile")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
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
 * The count, and how much of it is actually usable.
 *
 * This replaces a three-tile metric strip that said "Profiles", "With sample" and a "Default
 * language" hardcoded to vi-VN. The first two repeated what the list one line below already
 * showed, and the third was not a fact about this account at all.
 */
export function VoiceProfileSummary({ profiles }: { profiles: VoiceProfileDto[] }) {
  const t = useTranslations("voiceProfiles.yourVoices");
  const counted = useMemo(() => {
    const tally = { ready: 0, pending: 0, failed: 0 };
    for (const profile of profiles) {
      const { tone } = profileState(profile);
      if (tone === "ready") tally.ready += 1;
      else if (tone === "failed") tally.failed += 1;
      else tally.pending += 1;
    }
    return tally;
  }, [profiles]);

  const total = profiles.length;
  const share = (value: number) => (total === 0 ? 0 : (value / total) * 100);

  return (
    <WorkspaceRailModule title={t("title")}>
      <p className="flex items-baseline gap-2">
        <span className="text-[22px] leading-[1.1] font-semibold tracking-tight text-ink tabular-nums">
          {total}
        </span>
        <span className="text-[12px] text-ink-subtle">
          {t("profileCount", { count: total })}
          {total > 0 ? t("usableToday", { count: counted.ready }) : ""}
        </span>
      </p>

      <div className="flex h-1 overflow-hidden rounded-full bg-surface-3">
        {total === 0 ? null : (
          <>
            <span className="bg-emerald-500" style={{ width: `${share(counted.ready)}%` }} />
            <span className="bg-amber-500" style={{ width: `${share(counted.pending)}%` }} />
            <span className="bg-destructive" style={{ width: `${share(counted.failed)}%` }} />
          </>
        )}
      </div>

      {total > 0 ? (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-subtle">
          <Tally colour="bg-emerald-500" count={counted.ready} label={t("tally.ready")} />
          <Tally colour="bg-amber-500" count={counted.pending} label={t("tally.cloning")} />
          <Tally colour="bg-destructive" count={counted.failed} label={t("tally.failed")} />
        </div>
      ) : null}
    </WorkspaceRailModule>
  );
}

/** Rendered only when non-zero: a legend entry reading "0 failed" is noise pretending to be news. */
function Tally({ colour, count, label }: { colour: string; count: number; label: string }) {
  if (count === 0) return null;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={`size-1.5 rounded-full ${colour}`} />
      {count} {label}
    </span>
  );
}
