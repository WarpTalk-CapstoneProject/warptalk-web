"use client";

import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  CaretDown,
  GlobeHemisphereWest,
  Microphone,
  SpeakerHigh,
  SpeakerSlash,
} from "@phosphor-icons/react/dist/ssr";

import { CloneCaptureMeter } from "@/components/rooms/live/clone-capture-meter";
import { Switch } from "@/components/ui/switch";
import { LanguageFlag } from "@/components/voice/language-flag";
import { VoiceOrb } from "@/components/voice/voice-orb";
import { VoicePreviewButton } from "@/components/voice/voice-preview-button";
import { useVoiceCatalogs } from "@/hooks/use-voice-profiles";
import { getLanguageRegion } from "@/lib/language/languages";
import { describeCloneCapture } from "@/lib/meeting/clone-capture-state";
import { planVoicePanel, type VoicePanelMode } from "@/lib/meeting/voice-panel";
import {
  ALL_LANGUAGES,
  bareLanguage,
  initialLibraryLanguage,
  libraryVoices,
  libraryWindow,
  profileDisplay,
} from "@/lib/meeting/voice-panel-library";
import { voiceLibraryLanguages } from "@/lib/voice/library-languages";
import type { VoiceCloneStateDto, VoiceOptionDto } from "@/types/realtime";

/** Sentinel for the "clone me live in this meeting" entry, which is not a provider voice id. */
const LIVE_CLONING_OPTION = "__live_cloning__";


/**
 * The Voice panel — how you sound, and what you hear other people in — for any surface that has
 * the handlers to drive it.
 *
 * Lifted out of MeetingControlBar so the bridge popup renders the same panel instead of a second
 * one that drifts. The bar still owns everything around it: the "‹ Voice" header, the Room speed
 * section (passed back in as `footer`) and the floating clone-capture card. Which sections show,
 * and what they are called, is not decided here — see planVoicePanel for both modes and why they
 * differ.
 *
 * Calls no LiveKit hook, so it renders in a window with no meeting connection (the bridge popup
 * has none). Its only state is the library's own view (language, Show all) and the catalogues it
 * reads over REST. The microphone strip under a clone capture is therefore sampled by
 * the host and passed in as `cloneLevels`; without it the strip draws progress alone.
 */
export function VoicePanel({
  mode,
  voiceEnabled,
  onChangeVoiceEnabled,
  voicePreference,
  voiceCatalog,
  onChangeVoicePreference,
  voiceCloneEnabled,
  voiceCloneHasAudience = false,
  onChangeVoiceCloneConsent,
  dubVoice,
  ownVoiceProfiles,
  onChangeDubVoice,
  speakLanguage,
  allowedTargetLanguages,
  cloneCapture,
  cloneLevels,
  onDone,
  footer,
}: {
  mode: VoicePanelMode;
  /** false = this listener wants transcript only, no AI/original audio played. */
  voiceEnabled?: boolean;
  /** Omit to hide the switch. Never rendered in bridge mode, whose dock owns this. */
  onChangeVoiceEnabled?: (enabled: boolean) => void;
  /** A real Cartesia voice id this listener explicitly chose, or null/undefined for the automatic default. */
  voicePreference?: string | null;
  /** Voices offered for the CURRENT listen language — the bridge's "Their voice" list. */
  voiceCatalog?: VoiceOptionDto[];
  /** Called with a voice id, or "" to clear back to the automatic default. */
  onChangeVoicePreference?: (voiceId: string) => void;
  /** Whether THIS participant has consented to have their own voice cloned for dubbing. */
  voiceCloneEnabled?: boolean;
  /** Whether anybody is listening in a language other than this participant's speak language —
   *  see lib/meeting/dub-audience.ts. */
  voiceCloneHasAudience?: boolean;
  /** Called with the new consent value. Omit to hide "Live cloning". */
  onChangeVoiceCloneConsent?: (enabled: boolean) => void;
  /** The voice THIS participant is dubbed in, or null for "clone me live in this meeting". */
  dubVoice?: string | null;
  /** This participant's own saved voices that have a usable provider voice behind them. */
  ownVoiceProfiles?: { id: string; name: string; voiceId: string; language?: string | null }[];
  /**
   * Pass null to go back to cloning live from the meeting. Omit to hide the profiles and library.
   * `language` is the catalogue a library voice was picked from — what the server validates the
   * pick against — and absent for a voice of the person's own.
   */
  onChangeDubVoice?: (voiceId: string | null, language?: string | null) => void;
  /** The language this participant speaks: the library opens on it, and samples are spoken in it. */
  speakLanguage?: string | null;
  /** The workspace's language policy, which limits the library's languages as on Voice Profiles. */
  allowedTargetLanguages?: string[] | null;
  /** WT-420: what the clone pipeline is doing to THIS participant's microphone, or null. */
  cloneCapture?: VoiceCloneStateDto | null;
  /** Peak level per bucket of the local microphone during a capture, sampled by the host. */
  cloneLevels?: number[];
  /** Called after a voice is picked — the control bar closes its menu. */
  onDone?: () => void;
  /** The panel's switches (the bar's Flash mode). Rendered at the top, under the clone status. */
  footer?: ReactNode;
}) {
  const plan = planVoicePanel({
    mode,
    voiceEnabled,
    canToggleVoice: Boolean(onChangeVoiceEnabled),
    canPickDubVoice: Boolean(onChangeDubVoice),
    canConsentClone: Boolean(onChangeVoiceCloneConsent),
  });

  // WT-420: the live capture state. At the TOP of the panel: it is the one thing here that
  // changes while you watch, and under a long list it was scrolled out of sight.
  const cloneStatus = describeCloneCapture(cloneCapture);
  const showStatus = Boolean(voiceCloneEnabled) && (cloneStatus.tone !== "idle" || Boolean(cloneStatus.title));

  const done = onDone ?? (() => {});
  const speakBare = bareLanguage(speakLanguage) || "en";

  // The library: its own catalogues, by language, rather than the listen-language catalogue the
  // hub sends. A dub voice is validated against the language it was picked from, and the hub's
  // list was for the language this person HEARS, which is a different language whenever
  // translation is doing anything.
  const libraryLanguages = useMemo(
    () => voiceLibraryLanguages(allowedTargetLanguages),
    [allowedTargetLanguages],
  );
  const libraryCodes = useMemo(() => libraryLanguages.map((language) => language.code), [libraryLanguages]);
  const [libraryLanguage, setLibraryLanguage] = useState(() => initialLibraryLanguage(speakLanguage, libraryCodes));
  const [libraryExpanded, setLibraryExpanded] = useState(false);
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const showLibrary = Boolean(plan.yourVoice && onChangeDubVoice);
  const catalogs = useVoiceCatalogs(
    libraryLanguage === ALL_LANGUAGES || languageMenuOpen ? libraryCodes : [libraryLanguage],
    showLibrary,
  );
  const voices = useMemo(
    () => libraryVoices(catalogs.byLanguage, libraryCodes, libraryLanguage),
    [catalogs.byLanguage, libraryCodes, libraryLanguage],
  );
  const visible = libraryWindow(voices, libraryExpanded);

  // The five-row box is MEASURED while closed and held at that height while open, so "Show all"
  // fills the same box instead of growing the panel. A fixed pixel guess cut the fifth row in half
  // whenever a detail line or a flag made rows taller than the guess.
  const libraryBoxRef = useRef<HTMLDivElement>(null);
  const [closedLibraryHeight, setClosedLibraryHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (libraryExpanded || !libraryBoxRef.current) return;
    const height = libraryBoxRef.current.getBoundingClientRect().height;
    if (height > 0) setClosedLibraryHeight(height);
  }, [libraryExpanded, voices]);

  // The control bar's rule, kept there as it was; a bridge room turns it off — see
  // `pickWithdrawsConsent` in planVoicePanel for why it is harmful there.
  const pickWithdrawsConsent = plan.listenVoice?.pickWithdrawsConsent ?? false;

  /**
   * Picking a provider voice means "do not use mine", so consent is withdrawn alongside it.
   *
   * They were independent switches and the clone silently won, which is how somebody could select
   * a voice from the catalog, see it ticked, and hear something else. Revoking is also the safe
   * direction for a biometric permission: the only way to turn cloning back on is to ask for it.
   */
  function selectProviderVoice(voiceId: string) {
    onChangeVoicePreference?.(voiceId);
    if (pickWithdrawsConsent && voiceCloneEnabled) onChangeVoiceCloneConsent?.(false);
  }

  // Whether a row in the listen list may read as selected at all. Under the bar's rule a consented
  // clone meant "no listen pick", so none was ticked; without that rule the pick is simply the pick.
  const listenPickShown = !pickWithdrawsConsent || !voiceCloneEnabled;

  const sortedCatalog = [...(voiceCatalog ?? [])].sort(
    (a, b) =>
      (a.gender || "").localeCompare(b.gender || "") ||
      a.name.localeCompare(b.name),
  );

  const currentLanguage = libraryLanguages.find((language) => language.code === libraryLanguage);

  return (
    <>
      {showStatus ? (
        <div className="mx-1 mb-1.5 rounded-lg bg-surface-2 px-2.5 py-2">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[11px] font-medium text-ink">{cloneStatus.title}</p>
            {cloneStatus.quality ? (
              <span
                className={`text-[10px] uppercase tracking-wide ${
                  cloneStatus.quality === "good"
                    ? "text-emerald-600"
                    : cloneStatus.quality === "fair"
                      ? "text-amber-600"
                      : "text-ink-muted"
                }`}
              >
                {cloneStatus.quality}
              </span>
            ) : null}
          </div>
          {cloneStatus.tone === "working" || cloneStatus.progress !== null ? (
            <CloneCaptureMeter
              levels={cloneLevels ?? []}
              progress={cloneStatus.progress}
              tone={cloneStatus.tone}
            />
          ) : null}
          <p className="mt-1 text-[11px] leading-snug text-ink-muted">{cloneStatus.detail}</p>
        </div>
      ) : null}

      {/* The switches next, above every list: they are the controls people come here to flip. */}
      {footer ? (
        <>
          {footer}
          <div className="my-1 h-[1px] bg-surface-3" />
        </>
      ) : null}

      {plan.voiceSwitch && onChangeVoiceEnabled ? (
        <div className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-surface-2">
            {voiceEnabled === false ? <SpeakerSlash className="h-4 w-4" /> : <SpeakerHigh className="h-4 w-4" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-ink">{plan.voiceSwitch.label}</span>
            <span className="block truncate text-[11px] text-ink-muted">{plan.voiceSwitch.detail}</span>
          </span>
          <Switch
            checked={voiceEnabled !== false}
            onCheckedChange={(checked) => onChangeVoiceEnabled(checked)}
            aria-label={plan.voiceSwitch.ariaLabel}
          />
        </div>
      ) : null}

      {plan.dividerAfterSwitch ? <div className="my-1 h-[1px] bg-surface-3" /> : null}

      {/* YOUR VOICE — one direction only. Whose voice a dub is spoken in is the speaker's decision;
          the listener chooses the LANGUAGE, and the same voice is rendered once per language. */}
      {plan.yourVoice ? (
        <>
          <p className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
            {plan.yourVoice.heading}
          </p>
          {plan.yourVoice.note ? (
            <p className="px-2.5 pb-1 text-[11px] leading-snug text-ink-muted">{plan.yourVoice.note}</p>
          ) : null}
          <div role="radiogroup" aria-label={plan.yourVoice.heading} className="space-y-0.5 px-1">
            {onChangeDubVoice ? (
              <VoiceOption
                label={plan.automaticOption.label}
                detail={plan.automaticOption.detail}
                avatar={<IconAvatar icon={<SpeakerSlash className="h-3.5 w-3.5" />} />}
                value=""
                active={!dubVoice && !voiceCloneEnabled}
                onSelect={() => {
                  onChangeDubVoice(null);
                  if (voiceCloneEnabled) onChangeVoiceCloneConsent?.(false);
                }}
                close={done}
              />
            ) : null}
            {onChangeVoiceCloneConsent ? (
              <VoiceOption
                // "Live cloning", not "My voice": a saved profile is often called My voice too,
                // and the two were indistinguishable in this list.
                label="Live cloning"
                detail={
                  voiceCloneHasAudience
                    ? "Cloned from how you sound in this meeting"
                    : "Nobody is listening in another language yet"
                }
                avatar={<IconAvatar icon={<Microphone className="h-3.5 w-3.5" />} />}
                value={LIVE_CLONING_OPTION}
                active={Boolean(voiceCloneEnabled) && !dubVoice}
                onSelect={() => {
                  // Both halves, because they are two different settings that together mean
                  // "clone me": consent is the per-room permission, and a dub voice left set would
                  // win over the clone entirely.
                  onChangeDubVoice?.(null);
                  onChangeVoiceCloneConsent(true);
                }}
                close={done}
              />
            ) : null}
            {onChangeDubVoice
              ? (ownVoiceProfiles ?? []).map((profile) => {
                  const shown = profileDisplay(profile.name, profile.language);
                  return (
                    <VoiceOption
                      key={profile.id}
                      label={shown.name}
                      region={shown.language ? getLanguageRegion(shown.language) : undefined}
                      detail="Your saved voice"
                      avatar={<VoiceOrb voiceId={profile.voiceId} size={28} />}
                      value={profile.voiceId}
                      active={dubVoice === profile.voiceId}
                      onSelect={(voiceId) => onChangeDubVoice(voiceId)}
                      close={done}
                      preview={{ voiceId: profile.voiceId, language: shown.language ?? speakBare }}
                    />
                  );
                })
              : null}
          </div>

          {showLibrary && onChangeDubVoice ? (
            <>
              <div className="relative flex items-center justify-between gap-2 px-2.5 pb-1 pt-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">Library</p>
                {/* A small chip, not a full select: the heading line has room for a flag and "All",
                    and the names live in the list it opens. Drawn in place rather than portalled,
                    so a click in it stays inside the settings flyout instead of closing it. */}
                <button
                  type="button"
                  aria-haspopup="listbox"
                  aria-expanded={languageMenuOpen}
                  aria-label={`Library language: ${currentLanguage?.name ?? "All languages"}`}
                  title={currentLanguage?.name ?? "All languages"}
                  onClick={() => setLanguageMenuOpen((open) => !open)}
                  className="inline-flex h-5 items-center gap-0.5 whitespace-nowrap rounded-[5px] border border-border bg-surface-1 pl-1.5 pr-1 text-[10.5px] font-medium text-ink-muted transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                >
                  {currentLanguage ? (
                    <LanguageFlag region={currentLanguage.region} className="size-3" />
                  ) : (
                    "All"
                  )}
                  <CaretDown className="h-2.5 w-2.5 text-ink-subtle" weight="bold" />
                </button>
                {languageMenuOpen ? (
                  <div
                    role="listbox"
                    aria-label="Library language"
                    className="absolute right-1.5 top-full z-10 mt-1 grid min-w-[168px] gap-px rounded-lg border border-border bg-surface-1 p-1 shadow-lg"
                  >
                    {[...libraryLanguages.map((language) => ({ code: language.code, name: language.name, region: language.region as string | null })), { code: ALL_LANGUAGES, name: "All languages", region: null }].map((option) => {
                      const count = option.code === ALL_LANGUAGES
                        ? Object.values(catalogs.byLanguage).reduce((sum, list) => sum + list.length, 0)
                        : catalogs.byLanguage[option.code]?.length;
                      const selected = option.code === libraryLanguage;
                      return (
                        <button
                          key={option.code}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          onClick={() => {
                            setLibraryLanguage(option.code);
                            setLibraryExpanded(false);
                            setLanguageMenuOpen(false);
                          }}
                          className={`flex items-center gap-2 rounded-[5px] px-2 py-1.5 text-left text-[12.5px] transition-colors ${
                            selected ? "bg-primary/[0.08] font-medium text-primary" : "text-ink hover:bg-surface-2"
                          }`}
                        >
                          {option.region ? (
                            <LanguageFlag region={option.region} className="size-3.5" />
                          ) : (
                            <GlobeHemisphereWest className="h-3.5 w-3.5 text-ink-subtle" />
                          )}
                          {option.name}
                          <span className="ml-auto text-[11px] tabular-nums text-ink-subtle">
                            {count ?? ""}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
              {/* Five rows tall whether or not "Show all" is on, so the panel never grows under the
                  pointer; "Show all" fills the same box and lets it scroll. */}
              <div
                ref={libraryBoxRef}
                className={visible.scrolls ? "overflow-y-auto overscroll-contain" : undefined}
                style={visible.scrolls && closedLibraryHeight ? { height: closedLibraryHeight } : undefined}
              >
                <div role="radiogroup" aria-label="Library voices" className="space-y-0.5 px-1">
                  {catalogs.loading && voices.length === 0 ? (
                    <p className="px-2.5 py-2 text-[11px] text-ink-subtle">Loading voices…</p>
                  ) : voices.length === 0 ? (
                    <p className="px-2.5 py-2 text-[11px] text-ink-subtle">No voices in this language yet.</p>
                  ) : (
                    visible.rows.map((voice) => (
                      <VoiceOption
                        key={`${voice.language}-${voice.id}`}
                        label={voice.name}
                        region={getLanguageRegion(voice.language)}
                        detail={genderLabel(voice.gender)}
                        avatar={<VoiceOrb voiceId={voice.id} size={28} />}
                        value={voice.id}
                        active={dubVoice === voice.id}
                        onSelect={(voiceId) => onChangeDubVoice(voiceId, voice.language)}
                        close={done}
                        preview={{ voiceId: voice.id, language: voice.language }}
                      />
                    ))
                  )}
                </div>
              </div>
              {visible.hiddenCount > 0 ? (
                <button
                  type="button"
                  onClick={() => setLibraryExpanded((expanded) => !expanded)}
                  className="mx-1 mb-1 mt-0.5 flex w-[calc(100%-0.5rem)] items-center justify-between rounded-md px-2.5 py-2 text-left text-[12px] font-medium text-primary transition-colors hover:bg-surface-2"
                >
                  {libraryExpanded ? "Show less" : `Show all ${voices.length} voices`}
                  <CaretDown className={`h-3 w-3 transition-transform ${libraryExpanded ? "rotate-180" : ""}`} weight="bold" />
                </button>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}

      {plan.listenVoice ? (
        <>
          {plan.listenVoice.heading ? (
            <>
              <div className="my-1 h-[1px] bg-surface-3" />
              <p className="px-2.5 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
                {plan.listenVoice.heading.title}
              </p>
              {plan.listenVoice.heading.note ? (
                <p className="px-2.5 pb-1 text-[11px] leading-snug text-ink-muted">
                  {plan.listenVoice.heading.note}
                </p>
              ) : null}
            </>
          ) : null}
          <div
            role="radiogroup"
            aria-label={plan.listenVoice.heading?.title ?? "Voice"}
            className="space-y-0.5 px-1 pb-1"
          >
            <VoiceOption
              label="Automatic"
              detail={plan.listenVoice.automaticDetail}
              value=""
              active={listenPickShown && !voicePreference}
              onSelect={(value) => selectProviderVoice(value)}
              close={done}
            />
            {sortedCatalog.map((voice) => (
              <VoiceOption
                key={voice.id}
                label={voice.name}
                detail={genderLabel(voice.gender)}
                avatar={<VoiceOrb voiceId={voice.id} size={28} />}
                value={voice.id}
                active={listenPickShown && voicePreference === voice.id}
                onSelect={(value) => selectProviderVoice(value)}
                close={done}
              />
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}

/** A round icon in the avatar slot, for the two rows that are not a voice: Off and Live cloning. */
function IconAvatar({ icon }: { icon: ReactNode }) {
  return (
    <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-subtle">
      {icon}
    </span>
  );
}

/** "feminine" → "Feminine". Only the first letter: CSS `capitalize` title-cased every detail line. */
function genderLabel(gender?: string | null) {
  const value = gender?.trim();
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : undefined;
}

/**
 * One choice in a voice list — a radio, because each section holds exactly one answer.
 *
 * WT-927. A radio mark in front of every row says both "this is one of several" and "this one"
 * before the label is read. Rows are 44px tall for a reliable target, and keyboard focus draws a
 * ring instead of nothing. The kind of voice is now said by the section it sits in and by its
 * avatar (an orb for a real voice, an icon for Off and Live cloning), so the old source tags are
 * gone; a flag says which language a voice comes from instead of a locale code.
 *
 * The sample button is a SIBLING of the radio, not inside it: a button cannot contain a button,
 * and playing a sample must not also pick the voice.
 */
function VoiceOption({
  label,
  detail,
  region,
  avatar,
  value,
  active,
  onSelect,
  close,
  preview,
}: {
  label: string;
  detail?: string;
  region?: string | null;
  avatar?: ReactNode;
  value: string;
  active: boolean;
  onSelect: (voiceId: string) => void;
  close: () => void;
  preview?: { voiceId: string; language: string };
}) {
  return (
    <div className={`flex items-center gap-1 rounded-md ${active ? "bg-primary/[0.08]" : "hover:bg-surface-2"}`}>
      <button
        type="button"
        role="radio"
        aria-checked={active}
        onClick={() => {
          onSelect(value);
          close();
        }}
        className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-md px-2.5 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      >
        <span
          aria-hidden
          className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border transition-colors ${
            active ? "border-primary" : "border-ink-subtle/50"
          }`}
        >
          {active ? <span className="h-2 w-2 rounded-full bg-primary" /> : null}
        </span>
        {avatar}
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className={`truncate text-[13px] text-ink ${active ? "font-medium" : ""}`}>{label}</span>
            {region ? <LanguageFlag region={region} className="size-3.5" /> : null}
          </span>
          {detail ? <span className="block text-[11px] leading-snug text-ink-subtle">{detail}</span> : null}
        </span>
      </button>
      {preview ? (
        <VoicePreviewButton
          voiceId={preview.voiceId}
          language={preview.language}
          label={label}
          className="mr-1 h-7 w-7 shrink-0 rounded-full text-ink-muted hover:text-ink"
        />
      ) : null}
    </div>
  );
}
