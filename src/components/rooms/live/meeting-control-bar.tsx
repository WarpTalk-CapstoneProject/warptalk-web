"use client";

import { ReactNode, useState } from "react";
import { CaretLeft, CaretRight, ClosedCaptioning, Copy, Fingerprint, GearSix, HandPalm, Hash, Layout, Lock, LockOpen, Play, Record, Screencast, CheckCircle, Microphone, MicrophoneSlash, ShieldCheck, SmileyWink, SpeakerHigh, SpeakerSlash, Stop, Translate, VideoCamera, VideoCameraSlash, WaveSine, UserFocus, UsersFour } from "@phosphor-icons/react/dist/ssr";
import { Track } from "livekit-client";
import { TrackToggle } from "@livekit/components-react";
import { getFlagEmoji } from "@/lib/language-flag";
import { getLanguageName } from "@/lib/languages";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { VoiceOptionDto } from "@/types/realtime";

import { ALLOWED_REACTION_EMOJIS } from "@/constants/realtime";
export { ALLOWED_REACTION_EMOJIS };

export type MeetingLayoutMode = "auto" | "grid" | "spotlight" | "sidebar";

import { motion, AnimatePresence } from "motion/react";

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
  breakoutActive,
  onOpenBreakoutSetup,
  onEndBreakoutRooms,
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
  /** Whether live subtitles are visible in the reserved caption lane. */
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
  /** Toggles the local live-subtitle lane without changing transcript collection. */
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
  /** WT-06, host-only: starts/stops LiveKit Egress recording for the room. Omit to hide the record button. */
  onToggleRecording?: () => void;
  /** Whether breakout rooms are currently in progress for this meeting. */
  breakoutActive?: boolean;
  /** Host-only: opens the breakout room setup modal. Omit to hide the row. */
  onOpenBreakoutSetup?: () => void;
  /** Host-only: ends all active breakout rooms, returning everyone to the main room. Shown only while breakoutActive. */
  onEndBreakoutRooms?: () => void;
}) {
  const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<
    "root" | "layout" | "listenLanguage" | "speakLanguage" | "voice"
  >("root");
  const [isReactionMenuOpen, setIsReactionMenuOpen] = useState(false);
  const [isHostControlsMenuOpen, setIsHostControlsMenuOpen] = useState(false);

  function closeSettingsMenu() {
    setIsSettingsMenuOpen(false);
    setSettingsSection("root");
  }

  return (
    <div className="flex h-12 items-center gap-1.5 rounded-full border border-border/50 bg-surface-1/80 px-2 shadow-sm backdrop-blur-xl">
      {isHost && onStartWarptalk && onStopWarptalk ? (
        <>
          <button
            type="button"
            onClick={warptalkStarted ? onStopWarptalk : onStartWarptalk}
            className={`flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13px] font-medium transition-colors ${
              warptalkStarted
                ? "bg-surface-2 text-ink hover:bg-surface-3"
                : "bg-primary text-primary-foreground hover:bg-primary/80"
            }`}
          >
            {warptalkStarted ? <Stop className="h-3.5 w-3.5" weight="fill" /> : <Play className="h-3.5 w-3.5" weight="fill" />}
            {warptalkStarted ? "Stop Translation" : "Start Translation"}
          </button>
          <div className="h-6 w-[1px] bg-surface-3 mx-1" />
        </>
      ) : null}

      {isHost && onToggleLock ? (
        <div className="relative">
          <MeetControl
            label="Host controls"
            active={Boolean(isLocked) || isHostControlsMenuOpen}
            icon={<ShieldCheck className="h-[18px] w-[18px]" weight={isLocked ? "fill" : "regular"} />}
            onClick={() => setIsHostControlsMenuOpen((current) => !current)}
          />
          <AnimatePresence>
            {isHostControlsMenuOpen ? (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className="absolute bottom-14 left-0 z-50 w-64 overflow-hidden rounded-lg border border-border bg-surface-1 p-1 shadow-lg origin-bottom-left"
              >
                <HostControlRow
                  label={isLocked ? "Room locked" : "Lock room"}
                  description="Blocks new joiners while active."
                  icon={isLocked ? <Lock className="h-4 w-4" weight="fill" /> : <LockOpen className="h-4 w-4" />}
                  active={Boolean(isLocked)}
                  onClick={() => onToggleLock(!isLocked)}
                />
                {onToggleMuteOnEntry ? (
                  <HostControlRow
                    label="Mute on entry"
                    description="New joiners start with mic muted."
                    icon={<MicrophoneSlash className="h-4 w-4" />}
                    active={Boolean(muteOnEntry)}
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
                {onOpenBreakoutSetup ? (
                  <HostControlRow
                    label={breakoutActive ? "Manage breakout rooms" : "Breakout rooms"}
                    description={breakoutActive ? "Breakouts are in progress." : "Split participants into smaller groups."}
                    icon={<UsersFour className="h-4 w-4" />}
                    active={Boolean(breakoutActive)}
                    onClick={() => {
                      onOpenBreakoutSetup();
                      setIsHostControlsMenuOpen(false);
                    }}
                  />
                ) : null}
                {breakoutActive && onEndBreakoutRooms ? (
                  <HostControlRow
                    label="End breakout rooms"
                    description="Move everyone back to the main room now."
                    icon={<Stop className="h-4 w-4" weight="fill" />}
                    onClick={() => {
                      onEndBreakoutRooms();
                      setIsHostControlsMenuOpen(false);
                    }}
                  />
                ) : null}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      ) : null}

      {isHost && onToggleRecording ? (
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

      <MeetControl
        label={subtitlesEnabled ? "Hide subtitles" : "Show subtitles"}
        active={subtitlesEnabled}
        icon={
          <ClosedCaptioning
            className="h-[18px] w-[18px]"
            weight={subtitlesEnabled ? "fill" : "regular"}
          />
        }
        onClick={onToggleSubtitles}
      />

      <MeetControl
        label={isScreenSharing ? "Stop presenting" : "Present now"}
        active={isScreenSharing}
        icon={<Screencast className="h-[18px] w-[18px]" />}
        onClick={onToggleScreenShare}
      />

      {onToggleRaiseHand ? (
        <MeetControl
          label={handRaised ? "Lower hand" : "Raise hand"}
          active={handRaised}
          icon={<HandPalm className="h-[18px] w-[18px]" weight={handRaised ? "fill" : "regular"} />}
          onClick={onToggleRaiseHand}
        />
      ) : null}

      {onSendReaction ? (
        <div className="relative">
          <MeetControl
            label="Send a reaction"
            icon={<SmileyWink className="h-[18px] w-[18px]" />}
            onClick={() => setIsReactionMenuOpen((current) => !current)}
          />
          <AnimatePresence>
            {isReactionMenuOpen ? (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className="absolute bottom-14 right-0 z-50 flex w-52 items-center gap-1 rounded-lg border border-border bg-surface-1 p-2 shadow-lg origin-bottom-right"
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

      <div className="h-6 w-[1px] bg-surface-3 mx-1" />
      
      <div className="relative">
        <MeetControl
          label="Settings"
          active={isSettingsMenuOpen}
          icon={<GearSix className="h-[18px] w-[18px]" />}
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
              className="absolute bottom-14 right-0 z-50 max-h-[70vh] w-64 overflow-y-auto rounded-lg border border-border bg-surface-1 p-1 shadow-lg origin-bottom-right"
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
                  {onChangeListenLanguage && availableListenLanguages && availableListenLanguages.length > 1 ? (
                    <SettingsRow
                      label="Listening in"
                      icon={<Translate className="h-4 w-4" />}
                      value={getLanguageName(listenLanguage)}
                      onClick={() => setSettingsSection("listenLanguage")}
                      hasSubmenu
                    />
                  ) : null}
                  {onChangeSpeakLanguage && availableSpeakLanguages && availableSpeakLanguages.length > 1 ? (
                    <SettingsRow
                      label="Speaking"
                      icon={<Microphone className="h-4 w-4" />}
                      value={speakLanguage && speakLanguage !== "auto" ? getLanguageName(speakLanguage) : "Auto-detect"}
                      onClick={() => setSettingsSection("speakLanguage")}
                      hasSubmenu
                    />
                  ) : null}
                  {onChangeVoiceEnabled || (onChangeVoicePreference && voiceCatalog && voiceCatalog.length > 0) ? (
                    <SettingsRow
                      label="Voice"
                      icon={<SpeakerHigh className="h-4 w-4" />}
                      value={voiceEnabled === false ? "Transcript only" : "On"}
                      onClick={() => setSettingsSection("voice")}
                      hasSubmenu
                    />
                  ) : null}
                  {onChangeVoiceCloneConsent ? (
                    <VoiceCloneRow enabled={Boolean(voiceCloneEnabled)} onToggle={onChangeVoiceCloneConsent} />
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

              {settingsSection === "listenLanguage" && onChangeListenLanguage && availableListenLanguages ? (
                <>
                  <SettingsPanelHeader title="Listening in" onBack={() => setSettingsSection("root")} />
                  {availableListenLanguages.map((language) => (
                    <LanguageOption
                      key={language}
                      label={getLanguageName(language)}
                      value={language}
                      active={listenLanguage === language}
                      onSelect={onChangeListenLanguage}
                      close={closeSettingsMenu}
                    />
                  ))}
                </>
              ) : null}

              {settingsSection === "speakLanguage" && onChangeSpeakLanguage && availableSpeakLanguages ? (
                <>
                  <SettingsPanelHeader title="Speaking" onBack={() => setSettingsSection("root")} />
                  {availableSpeakLanguages.map((language) => (
                    <LanguageOption
                      key={language}
                      label={getLanguageName(language)}
                      value={language}
                      active={speakLanguage === language}
                      onSelect={onChangeSpeakLanguage}
                      close={closeSettingsMenu}
                    />
                  ))}
                </>
              ) : null}

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
                  {onChangeVoicePreference && voiceCatalog && voiceCatalog.length > 0 && voiceEnabled !== false ? (
                    <>
                      <div className="my-1 h-[1px] bg-surface-3" />
                      <VoiceOption
                        label="Automatic"
                        value=""
                        active={!voicePreference}
                        onSelect={onChangeVoicePreference}
                        close={closeSettingsMenu}
                      />
                      {voiceCatalog.map((voice) => (
                        <VoiceOption
                          key={voice.id}
                          label={voice.name}
                          value={voice.id}
                          active={voicePreference === voice.id}
                          onSelect={onChangeVoicePreference}
                          close={closeSettingsMenu}
                        />
                      ))}
                    </>
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
  onClick,
}: {
  label: string;
  description: string;
  icon: ReactNode;
  active?: boolean;
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
      <span className="flex flex-col">
        <span className="font-medium">{label}</span>
        <span className="text-[11px] text-ink-muted">{description}</span>
      </span>
    </button>
  );
}

function VoiceCloneRow({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: (next: boolean) => void;
}) {
  const [showConsentDialog, setShowConsentDialog] = useState(false);

  return (
    <>
      <SettingsRow
        label="Voice Clone"
        icon={<Fingerprint className="h-4 w-4" weight={enabled ? "fill" : "regular"} />}
        active={enabled}
        value={enabled ? "On" : "Off"}
        onClick={() => {
          if (enabled) {
            onToggle(false);
          } else {
            setShowConsentDialog(true);
          }
        }}
      />

      <Dialog open={showConsentDialog} onOpenChange={setShowConsentDialog}>
        <DialogContent className="bg-surface-1 border-border text-ink rounded-xl sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Dùng giọng thật của bạn?</DialogTitle>
            <DialogDescription className="text-ink-subtle pt-2">
              WarpTalk sẽ ghi lại khoảng 10 giây giọng nói của bạn trong cuộc họp này để tạo bản sao giọng nói
              (voice clone) qua Cartesia, dùng để đọc bản dịch thay cho giọng AI mặc định. Dữ liệu giọng nói này
              chỉ dùng cho phiên họp hiện tại — bạn có thể tắt bất cứ lúc nào.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowConsentDialog(false)}
              className="bg-surface-2 hover:bg-surface-3 text-ink border-border"
            >
              Hủy
            </Button>
            <Button
              onClick={() => {
                onToggle(true);
                setShowConsentDialog(false);
              }}
            >
              Đồng ý, dùng giọng của tôi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function VoiceOption({
  label,
  value,
  active,
  onSelect,
  close,
}: {
  label: string;
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
      className={`flex w-full items-center justify-between px-3 py-2 text-[13px] transition-colors ${active ? "bg-canvas text-ink font-medium" : "bg-surface-1 text-ink-muted hover:bg-canvas"}`}
    >
      {label}
      {active ? <CheckCircle className="h-3.5 w-3.5 text-ink" weight="fill" /> : null}
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
function LanguageOption({
  label,
  value,
  active,
  onSelect,
  close,
}: {
  label: string;
  value: string;
  active: boolean;
  onSelect: (language: string) => void;
  close: () => void;
}) {
  const flag = getFlagEmoji(value);

  return (
    <button
      type="button"
      onClick={() => {
        onSelect(value);
        close();
      }}
      aria-pressed={active}
      className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-[13px] transition-colors ${active ? "bg-canvas text-ink font-medium" : "bg-surface-1 text-ink-muted hover:bg-canvas"}`}
    >
      <span className="flex min-w-0 items-center gap-2">
        {flag ? (
          <span aria-hidden className="text-[14px] leading-none">
            {flag}
          </span>
        ) : null}
        <span className="truncate">{label}</span>
      </span>
      {active ? (
        <CheckCircle className="h-4 w-4 shrink-0 text-primary" weight="fill" />
      ) : null}
    </button>
  );
}

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
          icon={microphoneEnabled ? <Microphone className="h-[18px] w-[18px]" /> : <MicrophoneSlash className="h-[18px] w-[18px]" />}
          onClick={onToggleMicrophone}
        />
        <MeetControl
          label={cameraEnabled ? "Turn camera off" : "Turn camera on"}
          active={!cameraEnabled}
          icon={cameraEnabled ? <VideoCamera className="h-[18px] w-[18px]" /> : <VideoCameraSlash className="h-[18px] w-[18px]" />}
          onClick={onToggleCamera}
        />
      </>
    );
  }

  return (
    <>
      <TrackToggle
        source={Track.Source.Microphone}
        className="grid h-8 w-8 place-items-center rounded-md text-ink-muted hover:bg-surface-2 data-[lk-enabled=false]:bg-red-50 data-[lk-enabled=false]:text-red-600"
      />
      <TrackToggle
        source={Track.Source.Camera}
        className="grid h-8 w-8 place-items-center rounded-md text-ink-muted hover:bg-surface-2 data-[lk-enabled=false]:bg-red-50 data-[lk-enabled=false]:text-red-600"
      />
    </>
  );
}

function MeetControl({
  icon,
  label,
  active,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`grid h-8 w-8 place-items-center rounded-md transition-colors ${
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
