"use client";

import type { ReactNode } from "react";
import { CheckCircle, SpeakerHigh, SpeakerSlash } from "@phosphor-icons/react/dist/ssr";

import { CloneCaptureMeter } from "@/components/rooms/live/clone-capture-meter";
import { Switch } from "@/components/ui/switch";
import { describeCloneCapture } from "@/lib/meeting/clone-capture-state";
import { describeVoiceSelection } from "@/lib/meeting/voice-selection";
import { planVoicePanel, type VoicePanelMode } from "@/lib/meeting/voice-panel";
import type { VoiceCloneStateDto, VoiceOptionDto } from "@/types/realtime";

/** Sentinel for the "use my own cloned voice" entry, which is not a provider voice id. */
const MY_VOICE_OPTION = "__my_voice__";

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
 * Holds no state and calls no LiveKit hook, so it renders in a window with no meeting connection
 * (the bridge popup has none). The microphone strip under a clone capture is therefore sampled by
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
  /** Voices offered for the CURRENT listen language. */
  voiceCatalog?: VoiceOptionDto[];
  /** Called with a voice id, or "" to clear back to the automatic default. */
  onChangeVoicePreference?: (voiceId: string) => void;
  /** Whether THIS participant has consented to have their own voice cloned for dubbing. */
  voiceCloneEnabled?: boolean;
  /** Whether anybody is listening in a language other than this participant's speak language —
   *  see lib/meeting/dub-audience.ts. */
  voiceCloneHasAudience?: boolean;
  /** Called with the new consent value. Omit to hide "My voice". */
  onChangeVoiceCloneConsent?: (enabled: boolean) => void;
  /** The voice THIS participant is dubbed in, or null for "clone me live in this meeting". */
  dubVoice?: string | null;
  /** This participant's own uploaded voice profiles that have a usable provider voice behind them. */
  ownVoiceProfiles?: { id: string; name: string; voiceId: string }[];
  /** Pass null to go back to cloning live from the meeting. Omit to hide the library and profiles. */
  onChangeDubVoice?: (voiceId: string | null) => void;
  /** WT-420: what the clone pipeline is doing to THIS participant's microphone, or null. */
  cloneCapture?: VoiceCloneStateDto | null;
  /** Peak level per bucket of the local microphone during a capture, sampled by the host. */
  cloneLevels?: number[];
  /** Called after a voice is picked — the control bar closes its menu. */
  onDone?: () => void;
  /** Rendered between the closing sentence and the capture status. The bar's Room speed. */
  footer?: ReactNode;
}) {
  const plan = planVoicePanel({
    mode,
    voiceEnabled,
    canToggleVoice: Boolean(onChangeVoiceEnabled),
    canPickDubVoice: Boolean(onChangeDubVoice),
    canConsentClone: Boolean(onChangeVoiceCloneConsent),
  });

  // WT-420: the live capture state, in the same panel as the choice it explains.
  const cloneStatus = describeCloneCapture(cloneCapture);

  // What listeners will actually hear, derived in one place — see lib/meeting/voice-selection.ts.
  const voiceSelection = describeVoiceSelection({
    // Only where the switch is on screen may the closing sentence report it (see planVoicePanel).
    voiceEnabled: plan.summaryReadsVoiceEnabled ? voiceEnabled : undefined,
    voiceCloneEnabled,
    // The DUB voice, not voicePreference. This row answers "how do I sound", and voicePreference
    // answers the opposite question — which is why it used to claim listeners heard a speaker in
    // a voice that speaker had only ever chosen for their own listening.
    dubVoice,
    voiceCatalog,
    ownVoiceProfiles,
    hasAudience: voiceCloneHasAudience,
  });

  const done = onDone ?? (() => {});

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

  return (
    <>
      {plan.voiceSwitch && onChangeVoiceEnabled ? (
        // A switch, not a tap-row. The old row was a button whose LABEL was the
        // current state and whose VALUE was an instruction to invert it ("Voice on ·
        // Tap for transcript only") — three phrases a reader has to reconcile before
        // knowing which state they are in, for what is a boolean. A switch carries
        // its state and its affordance in one control, and cannot be misread as a
        // caption.
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

      {/* Right here in the list, not a switch somewhere else. Choosing a voice and
          choosing YOUR voice are the same question, and separating them is what
          made a whole test session conclude cloning was broken while the worker
          was scoring clone samples 1.0.

          The detail line carries the two facts that were previously unknowable
          from inside a meeting: whether this is even reaching anyone, and that
          consent is what turns it on. */}
      {/* YOUR VOICE — one direction only.
          Whose voice a dub is spoken in is the speaker's decision; the listener
          chooses the LANGUAGE, and the same voice is rendered once per language.
          These options used to be mixed into the list below, which points the
          other way, so picking a library voice to LISTEN in silently turned off
          your own cloned voice for everybody else in the room. */}
      {plan.yourVoice ? (
        <>
          <p className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
            {plan.yourVoice.heading}
          </p>
          {plan.yourVoice.note ? (
            <p className="px-2.5 pb-1 text-[11px] leading-snug text-ink-muted">
              {plan.yourVoice.note}
            </p>
          ) : null}
          {onChangeVoiceCloneConsent ? (
            <VoiceOption
              label="My voice"
              detail={
                voiceCloneHasAudience
                  ? "Cloned from how you sound in this meeting"
                  : "Nobody is listening in another language yet"
              }
              value={MY_VOICE_OPTION}
              active={Boolean(voiceCloneEnabled) && !dubVoice}
              onSelect={() => {
                // Both halves, because they are two different settings that
                // together mean "clone me": consent is the per-room permission,
                // and a dub voice left set would win over the clone entirely.
                onChangeDubVoice?.(null);
                onChangeVoiceCloneConsent(true);
              }}
              close={done}
            />
          ) : null}
          {onChangeDubVoice
            ? (ownVoiceProfiles ?? []).map((profile) => (
                <VoiceOption
                  key={profile.id}
                  label={profile.name}
                  detail="A recording you uploaded"
                  value={profile.voiceId}
                  active={dubVoice === profile.voiceId}
                  onSelect={(voiceId) => onChangeDubVoice(voiceId)}
                  close={done}
                />
              ))
            : null}
          {onChangeDubVoice
            ? sortedCatalog.map((voice) => (
                <VoiceOption
                  key={`dub-${voice.id}`}
                  label={voice.name}
                  detail={`A library voice${voice.gender ? ` · ${voice.gender}` : ""}`}
                  value={voice.id}
                  active={dubVoice === voice.id}
                  onSelect={(voiceId) => onChangeDubVoice(voiceId)}
                  close={done}
                />
              ))
            : null}
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
              {/* Said out loud because it is not guessable, and because getting it
                  wrong is invisible: a voice picked here replaces the stand-in for
                  people who have NOT chosen how they sound. Anyone who cloned their
                  voice or picked their own is heard as themselves regardless — see
                  TTSWorker._resolve_voice_variants. */}
              {plan.listenVoice.heading.note ? (
                <p className="px-2.5 pb-1 text-[11px] leading-snug text-ink-muted">
                  {plan.listenVoice.heading.note}
                </p>
              ) : null}
            </>
          ) : null}

          {/* "Assigned, not matched" is the honest description of the default: the
              worker picks deterministically from this language's catalog by hashing
              the speaker id, so everyone keeps a stable voice and no two people
              sound alike — but nothing compares it to how the speaker actually
              sounds. Saying so is what makes the list below worth opening. */}
          <VoiceOption
            label="Automatic"
            detail={plan.listenVoice.automaticDetail}
            value=""
            active={listenPickShown && !voicePreference}
            onSelect={(value) => selectProviderVoice(value)}
            close={done}
          />
          {/* Grouped by gender, then by name. The label alone still leaves six
              mixed rows to read one at a time; clustering them is what turns the
              list into "here are the masculine ones". */}
          {sortedCatalog.map((voice) => (
            <VoiceOption
              key={voice.id}
              label={voice.name}
              detail={voice.gender || undefined}
              value={voice.id}
              active={listenPickShown && voicePreference === voice.id}
              onSelect={(value) => selectProviderVoice(value)}
              close={done}
            />
          ))}
        </>
      ) : null}

      {/* What listeners actually get, spelled out under the list. The choice above is
          stored either way; this is the only place that says whether it is reaching
          anybody. */}
      <p className="px-2.5 pb-2 pt-1 text-[11px] leading-snug text-ink-muted">
        {voiceSelection.detail}
      </p>

      {footer}

      {/* WT-420. The capture itself, live. Everything below was already known to the
          TTS worker and written only to a log — which is why an entire test session
          concluded cloning was broken while the worker scored the clip 1.0. */}
      {cloneStatus.tone !== "idle" || cloneStatus.title ? (
        <div className="mx-2.5 mb-2 rounded-lg bg-surface-2 px-2.5 py-2">
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
          <p className="mt-1 text-[11px] leading-snug text-ink-muted">
            {cloneStatus.detail}
          </p>
        </div>
      ) : null}
    </>
  );
}

function VoiceOption({
  label,
  detail,
  value,
  active,
  onSelect,
  close,
}: {
  label: string;
  detail?: string;
  value: string;
  active: boolean;
  onSelect: (voiceId: string) => void;
  close: () => void;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        onSelect(value);
        close();
      }}
      className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-[13px] transition-colors ${active ? "bg-canvas text-ink font-medium" : "bg-surface-1 text-ink-muted hover:bg-canvas"}`}
    >
      <span className="min-w-0 text-left">
        <span className="block truncate">{label}</span>
        {detail ? (
          <span className="block truncate text-[11px] capitalize text-ink-subtle">{detail}</span>
        ) : null}
      </span>
      {active ? <CheckCircle className="h-3.5 w-3.5 shrink-0 text-ink" weight="fill" /> : null}
    </button>
  );
}
