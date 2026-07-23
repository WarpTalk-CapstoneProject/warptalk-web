"use client";

import { ReactNode, useState } from "react";
import { Copy, Fingerprint, HandPalm, Layout, Play, Screencast, CheckCircle, Microphone, MicrophoneSlash, SmileyWink, SpeakerHigh, SpeakerSlash, Stop, Translate, VideoCamera, VideoCameraSlash, WaveSine, UserFocus } from "@phosphor-icons/react/dist/ssr";
import { Track } from "livekit-client";
import { TrackToggle } from "@livekit/components-react";
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
import { NetworkQualityIcon } from "@/components/rooms/live/network-quality-icon";
import type { VoiceOptionDto } from "@/types/realtime";

export type MeetingLayoutMode = "auto" | "grid" | "spotlight" | "sidebar";

// Kept in sync with TranslationRoomHub.AllowedReactionEmojis on the Gateway.
export const ALLOWED_REACTION_EMOJIS = ["👍", "❤️", "😂", "🎉", "👏", "😮"];

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
  listenLanguage,
  availableListenLanguages,
  voicePreference,
  voiceCatalog,
  voiceCloneEnabled,
  voiceEnabled,
  handRaised,
  onCopyText,
  onToggleCamera,
  onToggleMicrophone,
  onToggleNoiseSuppression,
  onToggleBackgroundBlur,
  onToggleScreenShare,
  onLayoutChange,
  onStartWarptalk,
  onStopWarptalk,
  onChangeListenLanguage,
  onChangeVoicePreference,
  onChangeVoiceCloneConsent,
  onChangeVoiceEnabled,
  onToggleRaiseHand,
  onSendReaction,
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
  /** The language this participant currently hears translations/captions in. */
  listenLanguage?: string;
  /** Languages selectable in the dropdown — omit or pass a single-item list to hide it. */
  availableListenLanguages?: string[];
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
  /** Called when the participant picks a different listen language from the dropdown. */
  onChangeListenLanguage?: (language: string) => void;
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
}) {
  const [isLayoutMenuOpen, setIsLayoutMenuOpen] = useState(false);
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false);
  const [isVoiceMenuOpen, setIsVoiceMenuOpen] = useState(false);
  const [isReactionMenuOpen, setIsReactionMenuOpen] = useState(false);

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

      <LiveKitTrackControls
        enabled={meetingEnabled}
        cameraEnabled={cameraEnabled}
        microphoneEnabled={microphoneEnabled}
        onToggleCamera={onToggleCamera}
        onToggleMicrophone={onToggleMicrophone}
      />

      {meetingEnabled ? (
        <span className="grid h-8 w-8 place-items-center" title="Your connection quality">
          <NetworkQualityIcon />
        </span>
      ) : null}

      <MeetControl
        label={noiseSuppressionEnabled ? "Turn off noise suppression" : "Turn on noise suppression"}
        active={noiseSuppressionEnabled}
        icon={<WaveSine className="h-[18px] w-[18px]" />}
        onClick={onToggleNoiseSuppression}
      />

      <MeetControl
        label={backgroundBlurEnabled ? "Turn off background blur" : "Turn on background blur"}
        active={backgroundBlurEnabled}
        icon={<UserFocus className="h-[18px] w-[18px]" />}
        onClick={onToggleBackgroundBlur}
      />

      <div className="h-6 w-[1px] bg-surface-3 mx-1" />

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
      
      <MeetControl
        label="Copy join link"
        icon={<Copy className="h-[18px] w-[18px]" />}
        onClick={() => onCopyText(joinLink || roomCode, joinLink ? "Join link" : "Room code")}
      />

      <div className="relative">
        <MeetControl
          label="Layout options"
          icon={<Layout className="h-[18px] w-[18px]" />}
          onClick={() => setIsLayoutMenuOpen((current) => !current)}
        />
        <AnimatePresence>
          {isLayoutMenuOpen ? (
            <motion.div 
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="absolute bottom-14 right-0 z-50 w-44 overflow-hidden rounded-lg border border-border bg-surface-1 shadow-lg origin-bottom-right"
            >
              <LayoutOption label="Auto" value="auto" active={layoutMode === "auto"} onSelect={onLayoutChange} close={() => setIsLayoutMenuOpen(false)} />
              <LayoutOption label="Grid" value="grid" active={layoutMode === "grid"} onSelect={onLayoutChange} close={() => setIsLayoutMenuOpen(false)} />
              <LayoutOption label="Spotlight" value="spotlight" active={layoutMode === "spotlight"} onSelect={onLayoutChange} close={() => setIsLayoutMenuOpen(false)} />
              <LayoutOption label="Sidebar" value="sidebar" active={layoutMode === "sidebar"} onSelect={onLayoutChange} close={() => setIsLayoutMenuOpen(false)} />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {onChangeListenLanguage && availableListenLanguages && availableListenLanguages.length > 1 ? (
        <>
          <div className="h-6 w-[1px] bg-surface-3 mx-1" />
          <div className="relative">
            <MeetControl
              label={`Listening in ${getLanguageName(listenLanguage)}`}
              icon={<Translate className="h-[18px] w-[18px]" />}
              onClick={() => setIsLanguageMenuOpen((current) => !current)}
            />
            <AnimatePresence>
              {isLanguageMenuOpen ? (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  className="absolute bottom-14 right-0 z-50 w-48 overflow-hidden rounded-lg border border-border bg-surface-1 shadow-lg origin-bottom-right"
                >
                  {availableListenLanguages.map((language) => (
                    <LanguageOption
                      key={language}
                      label={getLanguageName(language)}
                      value={language}
                      active={listenLanguage === language}
                      onSelect={onChangeListenLanguage}
                      close={() => setIsLanguageMenuOpen(false)}
                    />
                  ))}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </>
      ) : null}

      {onChangeVoiceEnabled ? (
        <>
          <div className="h-6 w-[1px] bg-surface-3 mx-1" />
          <MeetControl
            label={voiceEnabled === false ? "Transcript only — click to hear voice" : "Voice on — click for transcript only"}
            active={voiceEnabled === false}
            icon={voiceEnabled === false ? <SpeakerSlash className="h-[18px] w-[18px]" /> : <SpeakerHigh className="h-[18px] w-[18px]" />}
            onClick={() => onChangeVoiceEnabled(voiceEnabled === false)}
          />
        </>
      ) : null}

      {onChangeVoicePreference && voiceCatalog && voiceCatalog.length > 0 && voiceEnabled !== false ? (
        <>
          <div className="h-6 w-[1px] bg-surface-3 mx-1" />
          <div className="relative">
            <MeetControl
              label={
                voicePreference
                  ? `Voice: ${voiceCatalog.find((v) => v.id === voicePreference)?.name ?? "Custom"}`
                  : "Voice: Automatic"
              }
              icon={<SpeakerHigh className="h-[18px] w-[18px]" />}
              onClick={() => setIsVoiceMenuOpen((current) => !current)}
            />
            <AnimatePresence>
              {isVoiceMenuOpen ? (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  className="absolute bottom-14 right-0 z-50 w-48 overflow-hidden rounded-lg border border-border bg-surface-1 shadow-lg origin-bottom-right"
                >
                  <VoiceOption
                    label="Automatic"
                    value=""
                    active={!voicePreference}
                    onSelect={onChangeVoicePreference}
                    close={() => setIsVoiceMenuOpen(false)}
                  />
                  {voiceCatalog.map((voice) => (
                    <VoiceOption
                      key={voice.id}
                      label={voice.name}
                      value={voice.id}
                      active={voicePreference === voice.id}
                      onSelect={onChangeVoicePreference}
                      close={() => setIsVoiceMenuOpen(false)}
                    />
                  ))}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </>
      ) : null}

      {onChangeVoiceCloneConsent ? (
        <>
          <div className="h-6 w-[1px] bg-surface-3 mx-1" />
          <VoiceCloneToggle enabled={Boolean(voiceCloneEnabled)} onToggle={onChangeVoiceCloneConsent} />
        </>
      ) : null}
    </div>
  );
}

function VoiceCloneToggle({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: (next: boolean) => void;
}) {
  const [showConsentDialog, setShowConsentDialog] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (enabled) {
            onToggle(false);
          } else {
            setShowConsentDialog(true);
          }
        }}
        title={enabled ? "Đang dùng giọng thật của bạn — bấm để tắt" : "Dùng giọng thật của bạn khi dịch"}
        className={`flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13px] font-medium transition-colors ${
          enabled
            ? "bg-primary/10 text-primary hover:bg-primary/15"
            : "bg-transparent text-ink-muted hover:bg-surface-2"
        }`}
      >
        <Fingerprint className="h-[18px] w-[18px]" weight={enabled ? "fill" : "regular"} />
        Voice Clone
      </button>

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
