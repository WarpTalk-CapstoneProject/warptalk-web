"use client";

import { ReactNode, useState } from "react";
import { Copy, Layout, Screencast, CheckCircle, Microphone, MicrophoneSlash, VideoCamera, VideoCameraSlash } from "@phosphor-icons/react/dist/ssr";
import { Track } from "livekit-client";
import { TrackToggle } from "@livekit/components-react";

export type MeetingLayoutMode = "auto" | "grid" | "spotlight" | "sidebar";

import { motion, AnimatePresence } from "motion/react";

export function MeetingControlBar({
  meetingEnabled,
  cameraEnabled,
  microphoneEnabled,
  isScreenSharing,
  layoutMode,
  roomCode,
  onCopyText,
  onToggleCamera,
  onToggleMicrophone,
  onToggleScreenShare,
  onLayoutChange,
}: {
  meetingEnabled: boolean;
  cameraEnabled: boolean;
  microphoneEnabled: boolean;
  isScreenSharing: boolean;
  layoutMode: MeetingLayoutMode;
  roomCode: string;
  onCopyText: (value: string, label: string) => void;
  onToggleCamera: () => void;
  onToggleMicrophone: () => void;
  onToggleScreenShare: () => void;
  onLayoutChange: (layout: MeetingLayoutMode) => void;
}) {
  const [isLayoutMenuOpen, setIsLayoutMenuOpen] = useState(false);

  return (
    <div className="flex h-12 items-center gap-1.5 rounded-full border border-border/50 bg-surface-1/80 px-2 shadow-sm backdrop-blur-xl">
      <LiveKitTrackControls
        enabled={meetingEnabled}
        cameraEnabled={cameraEnabled}
        microphoneEnabled={microphoneEnabled}
        onToggleCamera={onToggleCamera}
        onToggleMicrophone={onToggleMicrophone}
      />
      
      <div className="h-6 w-[1px] bg-surface-3 mx-1" />

      <MeetControl
        label={isScreenSharing ? "Stop presenting" : "Present now"}
        active={isScreenSharing}
        icon={<Screencast className="h-[18px] w-[18px]" />}
        onClick={onToggleScreenShare}
      />
      
      <div className="h-6 w-[1px] bg-surface-3 mx-1" />
      
      <MeetControl 
        label="Copy room code" 
        icon={<Copy className="h-[18px] w-[18px]" />} 
        onClick={() => onCopyText(roomCode, "Room code")} 
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
    </div>
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
