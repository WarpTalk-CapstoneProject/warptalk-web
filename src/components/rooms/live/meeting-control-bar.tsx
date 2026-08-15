"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import { CaretDown, CaretLeft, CaretRight, ClosedCaptioning, Copy, GearSix, HandPalm, Hash, Layout, Lock, LockOpen, Play, Record, Screencast, CheckCircle, Microphone, MicrophoneSlash, ShieldCheck, SmileyWink, SpeakerHigh, SpeakerSlash, Stop, Translate, VideoCamera, VideoCameraSlash, WaveSine, UserFocus } from "@phosphor-icons/react/dist/ssr";
import { Track } from "livekit-client";
import { TrackToggle } from "@livekit/components-react";
import { getFlagEmoji } from "@/lib/language/language-flag";
import { getLanguageName, languagesInScope, normalizeLanguageCode } from "@/lib/language/languages";
import {
  applySingleLanguageChoice,
  describeLanguageChoice,
} from "@/lib/meeting/language-choice";
import { describeVoiceSelection } from "@/lib/meeting/voice-selection";
import { describeCloneCapture } from "@/lib/meeting/clone-capture-state";
// Button, Dialog* and the Fingerprint icon were imported and never used — dead since whatever
// removed their last call site, and invisible because unused imports are a warning here rather
// than an error. `Plus` joined them when AddLanguageRow went.
import type { VoiceCloneStateDto, VoiceOptionDto } from "@/types/realtime";

import { ALLOWED_REACTION_EMOJIS } from "@/constants/realtime";
export { ALLOWED_REACTION_EMOJIS };

export type MeetingLayoutMode = "auto" | "grid" | "spotlight" | "sidebar";

import { motion, AnimatePresence } from "motion/react";

/**
 * WT-272: close a control-bar flyout on Escape or a click outside it.
 *
 * Every flyout in this bar was open-only: the sole way to dismiss one was to hit the same
 * trigger again. That is what the "Host controls" report describes — the panel was clicked
 * twice, which opened it and then immediately closed it again, leaving nothing on screen and
 * nothing in the DOM to find. It also means two flyouts could sit open at once.
 */
function useFlyoutDismiss(open: boolean, close: () => void) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      const container = containerRef.current;
      if (container && !container.contains(event.target as Node)) close();
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, close]);

  return containerRef;
}

/** Sentinel for the "use my own cloned voice" entry, which is not a provider voice id. */
const MY_VOICE_OPTION = "__my_voice__";

export function MeetingControlBar({
  meetingEnabled,
  cameraEnabled,
  microphoneEnabled,
  noiseSuppressionEnabled,
  backgroundBlurEnabled,
  isScreenSharing,
  layoutMode,
  roomCode,
  joinLink,
  isHost,
  warptalkStarted,
  subtitlesEnabled,
  listenLanguage,
  availableListenLanguages,
  speakLanguage,
  availableSpeakLanguages,
  voicePreference,
  voiceCatalog,
  voiceCloneEnabled,
  voiceCloneHasAudience = false,
  cloneCapture,
  voiceEnabled,
  handRaised,
  isLocked,
  muteOnEntry,
  isRecording,
  recordingPending,
  onCopyText,
  onToggleCamera,
  onToggleMicrophone,
  onToggleNoiseSuppression,
  onToggleBackgroundBlur,
  onToggleScreenShare,
  onLayoutChange,
  onStartWarptalk,
  onStopWarptalk,
  onToggleSubtitles,
  onChangeListenLanguage,
  onChangeSpeakLanguage,
  onChangeVoicePreference,
  onChangeVoiceCloneConsent,
  onChangeVoiceEnabled,
  onToggleRaiseHand,
  onSendReaction,
  onToggleLock,
  onToggleMuteOnEntry,
  onMuteAll,
  onToggleRecording,
}: {
  meetingEnabled: boolean;
  cameraEnabled: boolean;
  microphoneEnabled: boolean;
  /** Krisp noise-filter processor state for the local mic track. */
  noiseSuppressionEnabled: boolean;
  /** Background-blur processor state for the local camera track. */
  backgroundBlurEnabled: boolean;
  isScreenSharing: boolean;
  layoutMode: MeetingLayoutMode;
  roomCode: string;
  joinLink: string;
  /** Whether THIS participant can start/stop translation for the room. Omit (or omit onStartWarptalk/onStopWarptalk) to hide the control. */
  isHost?: boolean;
  /** Whether the AI translation pipeline is currently running for this room. */
  warptalkStarted?: boolean;
  /** Whether live subtitles are visible in the reserved caption lane.
   *
   *  Visibility ONLY. This does not gate transcript capture, receipt or persistence — see the
   *  CC control below and WT-408. */
  subtitlesEnabled: boolean;
  /** The language this participant currently hears translations/captions in. */
  listenLanguage?: string;
  /** Languages selectable in the dropdown — omit or pass a single-item list to hide it. */
  availableListenLanguages?: string[];
  /** The language THIS participant is currently declaring they speak — "auto" means no
   * explicit pick yet (STT falls back to free auto-detect, with a weaker hallucination
   * guard). Distinct from listenLanguage, which is what they hear. */
  speakLanguage?: string;
  /** Languages selectable in the speak-language dropdown — omit or pass a single-item list to hide it. */
  availableSpeakLanguages?: string[];
  /** A real Cartesia voice id this listener explicitly chose, or null/undefined for the automatic default. */
  voicePreference?: string | null;
  /** Voices offered for the CURRENT listenLanguage — empty/omit hides the picker. */
  voiceCatalog?: VoiceOptionDto[];
  /** Whether THIS participant has consented to have their own voice cloned for dubbing. Omit to hide the toggle. */
  voiceCloneEnabled?: boolean;
  /** Whether anybody in the room is listening in a language other than this participant's
   *  speak language. False means no route out of them exists, so consent changes nothing —
   *  see lib/meeting/dub-audience.ts. */
  voiceCloneHasAudience?: boolean;
  /** WT-420: what the clone pipeline is doing to THIS participant's microphone, or null. */
  cloneCapture?: VoiceCloneStateDto | null;
  /** false = this listener wants transcript only, no AI/original audio played. Omit to hide the toggle. */
  voiceEnabled?: boolean;
  /** Whether THIS participant's hand is currently raised. Omit (or omit onToggleRaiseHand) to hide the control. */
  handRaised?: boolean;
  /** WT-04: whether the room is currently locked to new joiners. */
  isLocked?: boolean;
  /** WT-04: whether new joiners default to a muted mic. */
  muteOnEntry?: boolean;
  /** WT-06: whether a LiveKit Egress recording is currently in progress. */
  isRecording?: boolean;
  /** True while the start/stop Egress request is awaiting confirmation. */
  recordingPending?: boolean;
  onCopyText: (value: string, label: string) => void;
  onToggleCamera: () => void;
  onToggleMicrophone: () => void;
  onToggleNoiseSuppression: () => void;
  onToggleBackgroundBlur: () => void;
  onToggleScreenShare: () => void;
  onLayoutChange: (layout: MeetingLayoutMode) => void;
  /** Starts the AI translation pipeline for the room. Host-only; omit to hide the control. */
  onStartWarptalk?: () => void;
  /** Stops the AI translation pipeline for the room. Host-only; omit to hide the control. */
  onStopWarptalk?: () => void;
  /** Toggles the local live-subtitle lane without changing transcript collection.
   *  The tooltip says so out loud (WT-408) — users were reading the CC glyph as a recording
   *  switch. */
  onToggleSubtitles: () => void;
  /** Called when the participant picks a different listen language from the dropdown. */
  onChangeListenLanguage?: (language: string) => void;
  /** Called when the participant picks the language they're speaking from the dropdown. */
  onChangeSpeakLanguage?: (language: string) => void;
  /** Called with a voice id, or "" to clear back to the automatic default. */
  onChangeVoicePreference?: (voiceId: string) => void;
  /** Called with the new consent value after the participant confirms (or turns it off). */
  onChangeVoiceCloneConsent?: (enabled: boolean) => void;
  /** Called with the new value when the participant toggles transcript-only mode. */
  onChangeVoiceEnabled?: (enabled: boolean) => void;
  /** Toggles this participant's raised-hand state. Omit to hide the control. */
  onToggleRaiseHand?: () => void;
  /** Sends an emoji reaction (must be one of ALLOWED_REACTION_EMOJIS). Omit to hide the picker. */
  onSendReaction?: (emoji: string) => void;
  /** WT-04, host-only: toggles the room lock. Omit to hide the "Host controls" panel entirely. */
  onToggleLock?: (locked: boolean) => void;
  /** WT-04, host-only: toggles whether new joiners start muted. */
  onToggleMuteOnEntry?: (enabled: boolean) => void;
  /** WT-04, host-only: force-mutes every other participant (they can unmute themselves). */
  onMuteAll?: () => void;
  /** WT-06: starts/stops LiveKit Egress recording for the room. Any participant may — the room
   * is told by toast either way. Omit to hide the record button. */
  onToggleRecording?: () => void;
}) {
  const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<"root" | "layout" | "voice">("root");
  const [isReactionMenuOpen, setIsReactionMenuOpen] = useState(false);
  const [isHostControlsMenuOpen, setIsHostControlsMenuOpen] = useState(false);
  // WT-272 wrote this hook and then attached it to one flyout of three. The reaction picker
  // and the settings panel stayed open-only — the sole way to dismiss either was to hit its
  // own trigger again, which is the exact complaint the ticket was raised about.
  const hostControlsRef = useFlyoutDismiss(isHostControlsMenuOpen, () =>
    setIsHostControlsMenuOpen(false),
  );
  const reactionRef = useFlyoutDismiss(isReactionMenuOpen, () =>
    setIsReactionMenuOpen(false),
  );
  const settingsRef = useFlyoutDismiss(isSettingsMenuOpen, () => {
    setIsSettingsMenuOpen(false);
    // Back to the top level, so reopening does not resume a submenu nobody asked for.
    setSettingsSection("root");
  });

  // WT-420: the live capture state, in the same panel as the choice it explains.
  const cloneStatus = describeCloneCapture(cloneCapture);

  // What listeners will actually hear, derived in one place — see lib/meeting/voice-selection.ts.
  const voiceSelection = describeVoiceSelection({
    voiceEnabled,
    voiceCloneEnabled,
    voicePreference,
    voiceCatalog,
    hasAudience: voiceCloneHasAudience,
  });

  /**
   * Picking a provider voice means "do not use mine", so consent is withdrawn alongside it.
   *
   * They were independent switches and the clone silently won, which is how somebody could select
   * a voice from the catalog, see it ticked, and hear something else. Revoking is also the safe
   * direction for a biometric permission: the only way to turn cloning back on is to ask for it.
   */
  function selectProviderVoice(voiceId: string) {
    onChangeVoicePreference?.(voiceId);
    if (voiceCloneEnabled) onChangeVoiceCloneConsent?.(false);
  }

  function closeSettingsMenu() {
    setIsSettingsMenuOpen(false);
    setSettingsSection("root");
  }

  return (
    <div className="flex h-[60px] items-center gap-2 rounded-full border border-border/50 bg-surface-1/80 px-3 shadow-sm backdrop-blur-xl">
      {isHost && onStartWarptalk && onStopWarptalk ? (
        <>
          <button
            type="button"
            onClick={warptalkStarted ? onStopWarptalk : onStartWarptalk}
            className={`flex h-11 items-center gap-2 whitespace-nowrap rounded-full px-4 text-[14px] font-medium transition-colors ${
              warptalkStarted
                ? "bg-surface-2 text-ink hover:bg-surface-3"
                : "bg-primary text-primary-foreground hover:bg-primary/80"
            }`}
          >
            {warptalkStarted ? <Stop className="h-3.5 w-3.5" weight="fill" /> : <Play className="h-3.5 w-3.5" weight="fill" />}
            {warptalkStarted ? "Stop Translation" : "Start Translation"}
          </button>
          <div className="h-7 w-[1px] bg-surface-3 mx-1.5" />
        </>
      ) : null}

      {/*
        The two languages that decide whether this person hears anything, next to the control
        that starts it — NOT four levels into the settings menu, which is where they were and why
        "translation is broken" was the conclusion every time somebody had not set them. This is
        deliberately outside the isHost block: a member cannot start translation and is exactly
        who needs these.
      */}
      {onChangeSpeakLanguage && onChangeListenLanguage && availableListenLanguages ? (
        <>
          <LanguagePairPicker
            speakLanguage={speakLanguage}
            listenLanguage={listenLanguage}
            // Union, not one or the other. The two props are the same array today (the room's
            // language set), but the picker now writes BOTH sides from one pick, so a language
            // offered on either side has to be offerable at all — dropping to one list would
            // silently remove options the moment they ever diverge.
            languageOptions={mergeLanguageOptions(availableSpeakLanguages, availableListenLanguages)}
            onChangeSpeakLanguage={onChangeSpeakLanguage}
            onChangeListenLanguage={onChangeListenLanguage}
            highlight={Boolean(warptalkStarted) && (!speakLanguage || !listenLanguage)}
          />
          <div className="h-7 w-[1px] bg-surface-3 mx-1.5" />
        </>
      ) : null}

      {isHost && onToggleLock ? (
        <div className="relative" ref={hostControlsRef}>
          <MeetControl
            label="Host controls"
            active={Boolean(isLocked) || isHostControlsMenuOpen}
            icon={<ShieldCheck className="h-5 w-5" weight={isLocked ? "fill" : "regular"} />}
            hasPopup
            expanded={isHostControlsMenuOpen}
            controls="meeting-host-controls-menu"
            onClick={() => setIsHostControlsMenuOpen((current) => !current)}
          />
          <AnimatePresence>
            {isHostControlsMenuOpen ? (
              <motion.div
                id="meeting-host-controls-menu"
                // WT-272: the panel is announced as a menu. It previously rendered as a bare
                // div, so it was invisible to assistive tech and to the DOM probe that reported
                // this ticket ("0 [role=menu] nodes" could not have matched even while the
                // panel was on screen).
                role="menu"
                aria-label="Host controls"
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className="absolute bottom-[68px] left-0 z-50 w-64 overflow-hidden rounded-lg border border-border bg-surface-1 p-1 shadow-lg origin-bottom-left"
              >
                <HostControlRow
                  label={isLocked ? "Room locked" : "Lock room"}
                  description="Blocks new joiners while active."
                  icon={isLocked ? <Lock className="h-4 w-4" weight="fill" /> : <LockOpen className="h-4 w-4" />}
                  active={Boolean(isLocked)}
                  toggle
                  onClick={() => onToggleLock(!isLocked)}
                />
                {onToggleMuteOnEntry ? (
                  <HostControlRow
                    label="Mute on entry"
                    description="New joiners start with mic muted."
                    icon={<MicrophoneSlash className="h-4 w-4" />}
                    active={Boolean(muteOnEntry)}
                    toggle
                    onClick={() => onToggleMuteOnEntry(!muteOnEntry)}
                  />
                ) : null}
                {onMuteAll ? (
                  <HostControlRow
                    label="Mute all"
                    description="Everyone but you — they can unmute themselves."
                    icon={<Microphone className="h-4 w-4" />}
                    onClick={() => {
                      onMuteAll();
                      setIsHostControlsMenuOpen(false);
                    }}
                  />
                ) : null}
                {/* Breakout rooms were removed from the product; their two rows are gone with
                    them. The menu had outlived the feature and was still offering "Split
                    participants into smaller groups" in the host controls — the one menu a host
                    opens during a live meeting. An entry point to something that no longer
                    exists is worse than no entry point. */}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      ) : null}

      {/* No isHost clause, unlike Host controls above: recording is open to everyone in the
          meeting (MeetingRoomService.IsInMeetingAsync), and every participant is toasted when it
          starts or stops. The caller decides who sees this by passing onToggleRecording or not. */}
      {onToggleRecording ? (
        <MeetControl
          label={
            recordingPending
              ? "Recording request in progress"
              : isRecording
                ? "Stop recording"
                : "Start recording"
          }
          active={isRecording}
          disabled={recordingPending}
          icon={
            <Record
              className={`h-[18px] w-[18px] ${recordingPending ? "animate-pulse" : ""}`}
              weight={isRecording ? "fill" : "regular"}
            />
          }
          onClick={onToggleRecording}
        />
      ) : null}

      <LiveKitTrackControls
        enabled={meetingEnabled}
        cameraEnabled={cameraEnabled}
        microphoneEnabled={microphoneEnabled}
        onToggleCamera={onToggleCamera}
        onToggleMicrophone={onToggleMicrophone}
      />

      {/* WT-408. The label is the tooltip AND the aria-label, and it is the only thing telling
          anyone what this button does. A CC glyph is conventionally read as "captions and
          transcript", so turning it off was being understood as "stop recording what I say" —
          a privacy expectation the code has never met. This control hides the floating subtitle
          lane and nothing else: TranscriptSegmentReceived still fires, the transcript panel
          still fills, and the meeting transcript is still persisted and exportable.
          Saying so in the tooltip is the smallest honest fix.

          NOT a decision that CC should only ever mean this. WT-408 offers a second option where
          CC becomes a real consent control that gates receiving and persisting a participant's
          speech; that needs backend work and a product call, and is deliberately not taken here.
          What this removes is the gap between what the button claims and what it does. */}
      <MeetControl
        label={
          subtitlesEnabled
            ? "Hide captions (transcript keeps recording)"
            : "Show captions"
        }
        active={subtitlesEnabled}
        icon={
          <ClosedCaptioning
            className="h-5 w-5"
            weight={subtitlesEnabled ? "fill" : "regular"}
          />
        }
        onClick={onToggleSubtitles}
      />

      <MeetControl
        label={isScreenSharing ? "Stop presenting" : "Present now"}
        active={isScreenSharing}
        icon={<Screencast className="h-5 w-5" />}
        onClick={onToggleScreenShare}
      />

      {onToggleRaiseHand ? (
        <MeetControl
          label={handRaised ? "Lower hand" : "Raise hand"}
          active={handRaised}
          icon={<HandPalm className="h-5 w-5" weight={handRaised ? "fill" : "regular"} />}
          onClick={onToggleRaiseHand}
        />
      ) : null}

      {onSendReaction ? (
        <div className="relative" ref={reactionRef}>
          <MeetControl
            label="Send a reaction"
            icon={<SmileyWink className="h-5 w-5" />}
            onClick={() => setIsReactionMenuOpen((current) => !current)}
          />
          <AnimatePresence>
            {isReactionMenuOpen ? (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className="absolute bottom-[68px] right-0 z-50 flex w-52 items-center gap-1 rounded-lg border border-border bg-surface-1 p-2 shadow-lg origin-bottom-right"
              >
                {ALLOWED_REACTION_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      onSendReaction(emoji);
                      setIsReactionMenuOpen(false);
                    }}
                    className="grid h-8 w-8 place-items-center rounded-md text-lg transition-colors hover:bg-canvas"
                  >
                    {emoji}
                  </button>
                ))}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      ) : null}

      <div className="h-7 w-[1px] bg-surface-3 mx-1.5" />
      
      <div className="relative" ref={settingsRef}>
        <MeetControl
          label="Settings"
          active={isSettingsMenuOpen}
          icon={<GearSix className="h-5 w-5" />}
          onClick={() =>
            setIsSettingsMenuOpen((current) => {
              if (current) setSettingsSection("root");
              return !current;
            })
          }
        />
        <AnimatePresence>
          {isSettingsMenuOpen ? (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="absolute bottom-[68px] right-0 z-50 max-h-[70vh] w-64 overflow-y-auto rounded-lg border border-border bg-surface-1 p-1 shadow-lg origin-bottom-right"
            >
              {settingsSection === "root" ? (
                <>
                  <SettingsRow
                    label="Noise suppression"
                    icon={<WaveSine className="h-4 w-4" />}
                    active={noiseSuppressionEnabled}
                    value={noiseSuppressionEnabled ? "On" : "Off"}
                    onClick={onToggleNoiseSuppression}
                  />
                  <SettingsRow
                    label="Background blur"
                    icon={<UserFocus className="h-4 w-4" />}
                    active={backgroundBlurEnabled}
                    value={backgroundBlurEnabled ? "On" : "Off"}
                    onClick={onToggleBackgroundBlur}
                  />
                  <SettingsRow
                    label="Layout"
                    icon={<Layout className="h-4 w-4" />}
                    value={layoutModeLabel(layoutMode)}
                    onClick={() => setSettingsSection("layout")}
                    hasSubmenu
                  />
                  {/* "Listening in" and "Speaking" used to live here as two rows, four levels
                      into a menu. The bar picker was built to replace them — its own comment says
                      so: "NOT four levels into the settings menu, which is where they were and why
                      'translation is broken' was the conclusion every time somebody had not set
                      them." The move was made and the old rows were left behind.

                      Two places to set one thing is the defect this whole change is about. The
                      bar picker is always rendered whenever these handlers exist, so nothing is
                      lost by removing the copy — including the submenus below, which only these
                      rows could reach. */}
                  {onChangeVoiceEnabled || onChangeVoiceCloneConsent
                    || (onChangeVoicePreference && voiceCatalog && voiceCatalog.length > 0) ? (
                    <SettingsRow
                      label="Voice"
                      icon={<SpeakerHigh className="h-4 w-4" />}
                      value={voiceSelection.label}
                      onClick={() => setSettingsSection("voice")}
                      hasSubmenu
                    />
                  ) : null}
                  <div className="my-1 h-[1px] bg-surface-3" />
                  <SettingsRow
                    label="Copy join link"
                    icon={<Copy className="h-4 w-4" />}
                    onClick={() => onCopyText(joinLink || roomCode, joinLink ? "Join link" : "Room code")}
                  />
                  <SettingsRow
                    label="Copy room code"
                    icon={<Hash className="h-4 w-4" />}
                    onClick={() => onCopyText(roomCode, "Room code")}
                  />
                </>
              ) : null}

              {settingsSection === "layout" ? (
                <>
                  <SettingsPanelHeader title="Layout" onBack={() => setSettingsSection("root")} />
                  <LayoutOption label="Auto" value="auto" active={layoutMode === "auto"} onSelect={onLayoutChange} close={closeSettingsMenu} />
                  <LayoutOption label="Grid" value="grid" active={layoutMode === "grid"} onSelect={onLayoutChange} close={closeSettingsMenu} />
                  <LayoutOption label="Spotlight" value="spotlight" active={layoutMode === "spotlight"} onSelect={onLayoutChange} close={closeSettingsMenu} />
                  <LayoutOption label="Sidebar" value="sidebar" active={layoutMode === "sidebar"} onSelect={onLayoutChange} close={closeSettingsMenu} />
                </>
              ) : null}

              {/* "Listening in" / "Speaking" and their two "All languages" submenus used to sit
                  here. The root rows that reached them were removed when LanguagePairPicker
                  replaced this whole flow, and these four branches were left behind — reachable
                  only from each other, so nothing could open any of them. Dead code that still
                  reads as a feature is worse than no code: it is why "the language menu" kept
                  being described as if it existed.

                  The one rule they carried that the bar picker did NOT have — a person may choose
                  a language the room does not offer — moved into LanguagePairPicker's "Another
                  language" disclosure rather than going away with them. */}

              {settingsSection === "voice" ? (
                <>
                  <SettingsPanelHeader title="Voice" onBack={() => setSettingsSection("root")} />
                  {onChangeVoiceEnabled ? (
                    <SettingsRow
                      label={voiceEnabled === false ? "Transcript only" : "Voice on"}
                      icon={voiceEnabled === false ? <SpeakerSlash className="h-4 w-4" /> : <SpeakerHigh className="h-4 w-4" />}
                      active={voiceEnabled !== false}
                      value={voiceEnabled === false ? "Tap to hear voice" : "Tap for transcript only"}
                      onClick={() => onChangeVoiceEnabled(voiceEnabled === false)}
                    />
                  ) : null}
                  {voiceEnabled !== false ? (
                    <>
                      <div className="my-1 h-[1px] bg-surface-3" />

                      {/* Right here in the list, not a switch somewhere else. Choosing a voice and
                          choosing YOUR voice are the same question, and separating them is what
                          made a whole test session conclude cloning was broken while the worker
                          was scoring clone samples 1.0.

                          The detail line carries the two facts that were previously unknowable
                          from inside a meeting: whether this is even reaching anyone, and that
                          consent is what turns it on. */}
                      {onChangeVoiceCloneConsent ? (
                        <VoiceOption
                          label="My voice"
                          detail={
                            voiceCloneHasAudience
                              ? "Cloned from how you sound in this meeting"
                              : "Nobody is listening in another language yet"
                          }
                          value={MY_VOICE_OPTION}
                          active={Boolean(voiceCloneEnabled)}
                          onSelect={() => onChangeVoiceCloneConsent(true)}
                          close={closeSettingsMenu}
                        />
                      ) : null}

                      {/* "Assigned, not matched" is the honest description of the default: the
                          worker picks deterministically from this language's catalog by hashing
                          the speaker id, so everyone keeps a stable voice and no two people
                          sound alike — but nothing compares it to how the speaker actually
                          sounds. Saying so is what makes the list below worth opening. */}
                      <VoiceOption
                        label="Automatic"
                        detail="Assigned, not matched to your voice"
                        value=""
                        active={!voicePreference && !voiceCloneEnabled}
                        onSelect={(value) => selectProviderVoice(value)}
                        close={closeSettingsMenu}
                      />
                      {/* Grouped by gender, then by name. The label alone still leaves six
                          mixed rows to read one at a time; clustering them is what turns the
                          list into "here are the masculine ones". */}
                      {[...(voiceCatalog ?? [])]
                        .sort(
                          (a, b) =>
                            (a.gender || "").localeCompare(b.gender || "") ||
                            a.name.localeCompare(b.name),
                        )
                        .map((voice) => (
                        <VoiceOption
                          key={voice.id}
                          label={voice.name}
                          detail={voice.gender || undefined}
                          value={voice.id}
                          active={!voiceCloneEnabled && voicePreference === voice.id}
                          onSelect={(value) => selectProviderVoice(value)}
                          close={closeSettingsMenu}
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
                      {cloneStatus.progress !== null ? (
                        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-3">
                          <div
                            className={`h-full rounded-full transition-[width] duration-500 ${
                              cloneStatus.tone === "done" ? "bg-emerald-500" : "bg-primary"
                            }`}
                            style={{ width: `${Math.round(cloneStatus.progress * 100)}%` }}
                          />
                        </div>
                      ) : null}
                      <p className="mt-1 text-[11px] leading-snug text-ink-muted">
                        {cloneStatus.detail}
                      </p>
                    </div>
                  ) : null}
                </>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}

function layoutModeLabel(mode: MeetingLayoutMode): string {
  switch (mode) {
    case "grid":
      return "Grid";
    case "spotlight":
      return "Spotlight";
    case "sidebar":
      return "Sidebar";
    default:
      return "Auto";
  }
}

function SettingsPanelHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="mb-1 flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[12px] font-semibold text-ink-muted transition-colors hover:bg-canvas hover:text-ink"
    >
      <CaretLeft className="h-3.5 w-3.5" />
      {title}
    </button>
  );
}

function SettingsRow({
  label,
  icon,
  value,
  active,
  hasSubmenu,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  value?: string;
  active?: boolean;
  hasSubmenu?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] transition-colors ${
        active ? "bg-primary/10 text-primary" : "text-ink hover:bg-canvas"
      }`}
    >
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-surface-2">{icon}</span>
      <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
      {value ? <span className="shrink-0 truncate text-[11px] text-ink-muted">{value}</span> : null}
      {hasSubmenu ? <CaretRight className="h-3.5 w-3.5 shrink-0 text-ink-muted" /> : null}
    </button>
  );
}

function HostControlRow({
  label,
  description,
  icon,
  active,
  toggle,
  onClick,
}: {
  label: string;
  description: string;
  icon: ReactNode;
  active?: boolean;
  /** WT-272: rows that flip a persistent room setting announce their on/off state. */
  toggle?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role={toggle ? "menuitemcheckbox" : "menuitem"}
      aria-checked={toggle ? Boolean(active) : undefined}
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] transition-colors ${
        active ? "bg-primary/10 text-primary" : "text-ink hover:bg-canvas"
      }`}
    >
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-surface-2">{icon}</span>
      <span className="flex flex-col">
        <span className="font-medium">{label}</span>
        <span className="text-[11px] text-ink-muted">{description}</span>
      </span>
    </button>
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

/**
 * One row of the in-meeting language menu, styled to match the create-meeting language
 * picker: flag, name, and a filled check on the active one.
 *
 * Single-select on purpose, unlike the create picker. There the set of languages defines the
 * ROOM; here the choice is this participant's own listen (or speak) language, of which there
 * is exactly one.
 */
/**
 * The one list the merged language picker offers, from the two the bar is given.
 *
 * Deduped by normalized code but returning the ORIGINAL values, because the options are locale
 * tags ("vi-VN") in some call paths and bare codes ("vi") in others, and handing a normalized
 * code back to `onChangeSpeakLanguage` would change what gets written to the gateway.
 */
function mergeLanguageOptions(
  speakOptions: string[] | undefined,
  listenOptions: string[] | undefined,
): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const language of [...(speakOptions ?? []), ...(listenOptions ?? [])]) {
    const code = normalizeLanguageCode(language);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    merged.push(language);
  }
  return merged;
}

/** Every meeting language this product knows, minus the ones the room already offers. */
function languagesNotAlreadyOffered(offered: string[] | undefined) {
  const already = new Set((offered ?? []).map(normalizeLanguageCode));
  return languagesInScope("meeting").filter((language) => !already.has(language.code));
}

// AddLanguageRow and LanguageOption lived here to serve the settings menu's four language
// submenus. Those submenus were unreachable and are gone; LanguageColumn is the one row renderer
// now, and it is the picker's own.

function LayoutOption({
  label,
  value,
  active,
  onSelect,
  close,
}: {
  label: string;
  value: MeetingLayoutMode;
  active: boolean;
  onSelect: (layout: MeetingLayoutMode) => void;
  close: () => void;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        onSelect(value);
        close();
      }}
      className={`flex w-full items-center justify-between px-3 py-2 text-[13px] transition-colors ${active ? "bg-canvas text-ink font-medium" : "bg-surface-1 text-ink-muted hover:bg-canvas"}`}
    >
      {label}
      {active ? <CheckCircle className="h-3.5 w-3.5 text-ink" weight="fill" /> : null}
    </button>
  );
}

function LiveKitTrackControls({
  enabled,
  cameraEnabled,
  microphoneEnabled,
  onToggleCamera,
  onToggleMicrophone,
}: {
  enabled: boolean;
  cameraEnabled: boolean;
  microphoneEnabled: boolean;
  onToggleCamera: () => void;
  onToggleMicrophone: () => void;
}) {
  if (!enabled) {
    return (
      <>
        <MeetControl
          label={microphoneEnabled ? "Mute microphone" : "Unmute microphone"}
          active={!microphoneEnabled}
          icon={microphoneEnabled ? <Microphone className="h-5 w-5" /> : <MicrophoneSlash className="h-5 w-5" />}
          onClick={onToggleMicrophone}
        />
        <MeetControl
          label={cameraEnabled ? "Turn camera off" : "Turn camera on"}
          active={!cameraEnabled}
          icon={cameraEnabled ? <VideoCamera className="h-5 w-5" /> : <VideoCameraSlash className="h-5 w-5" />}
          onClick={onToggleCamera}
        />
      </>
    );
  }

  return (
    <>
      <TrackToggle
        source={Track.Source.Microphone}
        // `!` throughout, because `@livekit/components-styles` is imported by
        // persistent-meeting-session and its `.lk-button` rule sets a dark background and its
        // own padding. Our classes named no base background at all, so LiveKit's won: two
        // black squares sitting in a light, rounded bar next to buttons we do style.
        className="grid h-11 w-11 place-items-center rounded-xl !border-0 !bg-transparent !p-0 !text-ink-muted hover:!bg-surface-2 hover:!text-ink data-[lk-enabled=false]:!bg-red-50 data-[lk-enabled=false]:!text-red-600"
      />
      <TrackToggle
        source={Track.Source.Camera}
        // `!` throughout, because `@livekit/components-styles` is imported by
        // persistent-meeting-session and its `.lk-button` rule sets a dark background and its
        // own padding. Our classes named no base background at all, so LiveKit's won: two
        // black squares sitting in a light, rounded bar next to buttons we do style.
        className="grid h-11 w-11 place-items-center rounded-xl !border-0 !bg-transparent !p-0 !text-ink-muted hover:!bg-surface-2 hover:!text-ink data-[lk-enabled=false]:!bg-red-50 data-[lk-enabled=false]:!text-red-600"
      />
    </>
  );
}

function MeetControl({
  icon,
  label,
  active,
  disabled,
  hasPopup,
  expanded,
  controls,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  /** WT-272: this control opens a menu, so say so. */
  hasPopup?: boolean;
  /** Whether that menu is currently open. */
  expanded?: boolean;
  /** id of the menu element, for aria-controls. */
  controls?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-haspopup={hasPopup ? "menu" : undefined}
      aria-expanded={hasPopup ? Boolean(expanded) : undefined}
      aria-controls={hasPopup && expanded ? controls : undefined}
      className={`grid h-11 w-11 place-items-center rounded-xl transition-colors ${
        disabled
          ? "cursor-not-allowed bg-canvas text-ink-tertiary"
          : active
          ? "bg-surface-2 text-primary"
          : "bg-transparent text-ink-muted hover:bg-surface-2"
      }`}
      aria-label={label}
      title={label}
    >
      {icon}
    </button>
  );
}

/**
 * One language per person. One list, one pick, both sides written.
 *
 * WHY IT COLLAPSED TO ONE
 *   This asked for "I speak" and "I hear" separately, which is the routing plumbing rather than
 *   the one fact a participant knows about themselves. In the 15 Aug test the team worked through
 *   every combination they could think of trying to make voice clone work, concluded it was
 *   broken, and were reading a healthy pipeline the whole time — the pairs they had built simply
 *   had no routes between them. Two controls that must agree are two chances to disagree.
 *
 *   Nothing about the mesh changes: a route still exists for (speaker.speak -> listener.hear)
 *   whenever those differ, so one language each derives a VN/EN/JP room's six directions on its
 *   own, and two people sharing a language still correctly hear each other unprocessed.
 *
 * WHY THE SPLIT IS GONE, AND NOT MERELY HIDDEN
 *   It used to live behind a "Hear a different language" disclosure, which opened itself whenever
 *   the stored pair happened to be mismatched. That is how the merged control shipped and was
 *   never seen: a room default of speak=vi / hear=en put people in a split they had not chosen,
 *   the picker read that as deliberate, and everyone got the two-column form anyway. A disclosure
 *   that opens on state nobody selected is not a disclosure.
 *
 *   So the control now offers exactly one decision and RECONCILES what it finds: an inherited
 *   mismatch is corrected on the next pick rather than preserved. The wire format is unchanged —
 *   speak and listen are still two fields, still written independently — so a split configured
 *   elsewhere still routes correctly; there is simply no longer a control in the meeting bar that
 *   can create one.
 *
 * `highlight` rings the button while translation runs and nothing has been chosen — the one
 * moment the choice is urgent.
 */
function LanguagePairPicker({
  speakLanguage,
  listenLanguage,
  languageOptions,
  onChangeSpeakLanguage,
  onChangeListenLanguage,
  highlight,
}: {
  speakLanguage?: string;
  listenLanguage?: string;
  /**
   * The one list this control offers. It was two — speak options and listen options — which the
   * only call site has always fed from the same array anyway; a single pick cannot honour two
   * lists, so taking two would just be a way for them to disagree later.
   */
  languageOptions: string[];
  /**
   * Still two callbacks, because the wire format is still two fields. Every pick writes both:
   * see the onSelect below.
   */
  onChangeSpeakLanguage: (language: string) => void;
  onChangeListenLanguage: (language: string) => void;
  highlight: boolean;
}) {
  const [open, setOpen] = useState(false);
  // Whether the languages the ROOM does not offer are showing.
  //
  // Behind a disclosure rather than in the main list because the room's set is the right answer
  // for almost everybody, and a menu of every language WarpTalk knows buries the two that matter.
  // Opened for somebody already on an off-menu language, so the panel shows the state they are in.
  const [showOtherLanguages, setShowOtherLanguages] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const choice = describeLanguageChoice(speakLanguage, listenLanguage);
  // The face of the control is ONE language even when the stored pair disagrees.
  //
  // `choice.speak` is what this participant's microphone is transcribed as, and that is the
  // language they would name if asked. Showing "vi → en" for an inherited mismatch made the
  // control look like a two-part decision — the exact reading this merge exists to remove — and
  // the mismatch is corrected the moment they pick anything, so displaying it as a split would
  // advertise a state the control can no longer produce.
  const shownLanguage = choice.speak || choice.hear;

  // Every meeting language the room does NOT offer, as plain codes so the list below can treat
  // both halves the same way.
  const otherLanguages = languagesNotAlreadyOffered(languageOptions).map((language) => language.code);

  // Somebody whose current language is not on the room's list is already off-menu — collapsing
  // the section that contains their own selection would hide the state they are in.
  //
  // Derived, not synced through an effect. Writing this into state on mount would be a cascading
  // render for a value that is a pure function of the props, and it would also LATCH: once open it
  // could never close again for a user who then picked a room language.
  const onAnOffMenuLanguage =
    shownLanguage.length > 0 &&
    otherLanguages.some((code) => code === normalizeLanguageCode(shownLanguage));
  const otherLanguagesVisible = showOtherLanguages || onAnOffMenuLanguage;

  // Both sides, always, wherever the language came from. The mesh reads speak and listen
  // independently, so writing one would leave exactly the half-applied state this control exists
  // to remove — and writing both is also what repairs a pair that arrived mismatched from a room
  // default or an older session.
  function pick(language: string) {
    const applied = applySingleLanguageChoice(language);
    onChangeSpeakLanguage(applied.speak);
    onChangeListenLanguage(applied.hear);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Choose your language"
        className={`flex h-11 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13px] font-medium transition-colors ${
          highlight
            ? "bg-amber-500/10 text-amber-600 ring-1 ring-amber-500/40 hover:bg-amber-500/15"
            : "bg-surface-2 text-ink hover:bg-surface-3"
        }`}
      >
        <Translate className="h-4 w-4" />
        {choice.mode === "unset" ? (
          <span>Set language</span>
        ) : (
          <span>{getLanguageName(shownLanguage)}</span>
        )}
        <CaretDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} weight="bold" />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute bottom-[calc(100%+10px)] left-1/2 z-50 w-64 -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-surface-1 p-1.5 shadow-lg"
        >
          <LanguageColumn
            title="My language"
            hint="What you speak, and what everyone else is translated into for you."
            options={languageOptions}
            selected={choice.mode === "unset" ? undefined : shownLanguage}
            onSelect={pick}
          />

          {/* The room's configuration is what gets OFFERED, not what a person is limited to.
              Somebody who speaks Korean in a Vietnamese/Japanese room should be able to say so and
              be understood; the room was configured by whoever booked it, before they knew who
              would turn up.

              That rule used to live four levels into the settings menu ("Listening in" → "All
              languages"). Those rows were removed when this picker replaced them and the submenus
              were left behind — unreachable, because nothing navigated to them any more. The rule
              is worth keeping, so it moved here rather than being deleted with the dead code. */}
          {otherLanguages.length > 0 ? (
            <>
              <div className="my-1 h-[1px] bg-border" />
              {otherLanguagesVisible ? (
                <LanguageColumn
                  title="Other languages"
                  hint="Not offered by this room, but still translated for you."
                  options={otherLanguages}
                  selected={choice.mode === "unset" ? undefined : shownLanguage}
                  onSelect={pick}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setShowOtherLanguages(true)}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
                >
                  <CaretRight className="h-3 w-3" weight="bold" />
                  <span>Another language</span>
                </button>
              )}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function LanguageColumn({
  title,
  hint,
  options,
  selected,
  onSelect,
}: {
  title: string;
  hint: string;
  options: string[];
  selected?: string;
  onSelect: (language: string) => void;
}) {
  return (
    <div>
      <p className="px-2.5 pb-0.5 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
        {title}
      </p>
      <p className="px-2.5 pb-1 text-[11px] leading-snug text-ink-muted">{hint}</p>
      <div className="max-h-40 overflow-y-auto">
        {options.map((language) => (
          <button
            key={language}
            type="button"
            role="menuitemradio"
            aria-checked={selected === language}
            onClick={() => onSelect(language)}
            className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors ${
              selected === language ? "bg-surface-2 text-ink" : "text-ink-muted hover:bg-surface-2 hover:text-ink"
            }`}
          >
            <span>{getFlagEmoji(language)}</span>
            <span className="flex-1 truncate">{getLanguageName(language)}</span>
            {selected === language ? <CheckCircle className="h-3.5 w-3.5" weight="fill" /> : null}
          </button>
        ))}
      </div>
    </div>
  );
}
