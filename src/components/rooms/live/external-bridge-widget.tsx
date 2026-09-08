"use client";

import {
  AlertTriangle,
  Check,
  CircleCheck,
  ExternalLink,
  Mic,
  MicOff,
  Play,
  Square,
} from "lucide-react";

import { openInSystemBrowser } from "@/lib/desktop/bridge";
import type { TranslationRoomDto } from "@/types/translationRoom";
import { MeetingExitControl } from "./meeting-top-bar";

export function ExternalBridgeWidget({
  room,
  isHost,
  isConnecting,
  meetingError,
  microphoneEnabled,
  translationStarted,
  bridgeOutboundReady,
  bridgeInboundLoopback,
  onToggleMicrophone,
  onStartTranslation,
  onStopTranslation,
  onExit,
}: {
  room: TranslationRoomDto;
  isHost: boolean;
  isConnecting: boolean;
  meetingError: string | null;
  microphoneEnabled: boolean;
  translationStarted: boolean;
  bridgeOutboundReady: boolean;
  bridgeInboundLoopback: boolean;
  onToggleMicrophone: () => void;
  onStartTranslation: () => void;
  onStopTranslation: () => void;
  onExit: (action: "leave" | "end") => void;
}) {
  async function openGoogleMeet() {
    const openedInBrowser = await openInSystemBrowser("https://meet.google.com/new");
    if (!openedInBrowser) window.open("https://meet.google.com/new", "_blank", "noopener,noreferrer");
  }

  return (
    <section
      data-external-bridge-widget
      data-mini-drag-handle
      className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-surface-1 text-ink"
    >
      <header className="shrink-0 border-b border-border/60 px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
              External meeting
            </p>
            <h2 className="mt-1 truncate text-[15px] font-semibold">WarpTalk widget</h2>
          </div>
          <MeetingExitControl room={room} isHost={isHost} onExit={onExit} />
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">
          The call stays in Google Meet. WarpTalk runs translation beside it.
        </p>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        <button
          type="button"
          onClick={() => void openGoogleMeet()}
          className="flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-ink px-3 text-xs font-semibold text-canvas transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <ExternalLink className="size-3.5" aria-hidden="true" />
          Open Google Meet
        </button>

        <div className="space-y-2 rounded-lg border border-border/60 bg-surface-2/50 p-3 text-[11px]">
          <StatusRow
            label="WarpTalk microphone"
            detail={microphoneEnabled ? "Ready" : "Muted"}
            ready={microphoneEnabled}
          />
          <StatusRow
            label="Meet microphone"
            detail="CABLE Output"
            ready={bridgeOutboundReady}
          />
          <StatusRow
            label="Meet audio to WarpTalk"
            detail={bridgeInboundLoopback ? "Meet window capture" : "Virtual speaker"}
            ready={bridgeInboundLoopback || bridgeOutboundReady}
          />
        </div>

        {meetingError ? (
          <div className="flex gap-2 rounded-lg border border-red-500/25 bg-red-500/8 p-3 text-[11px] text-red-700 dark:text-red-300">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <p className="leading-relaxed">{meetingError}</p>
          </div>
        ) : null}

        <div className="rounded-lg border border-border/60 p-3">
          <div className="flex items-center gap-2 text-xs font-semibold">
            {translationStarted ? (
              <CircleCheck className="size-3.5 text-emerald-600" aria-hidden="true" />
            ) : (
              <span className="size-3.5 rounded-full border border-ink-muted/40" />
            )}
            {translationStarted ? "Translation is live" : "Translation is ready"}
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-ink-muted">
            {translationStarted
              ? "Speak into your real microphone. The translated voice is sent to Meet."
              : "Create or join the call in Google Meet, then start WarpTalk here."}
          </p>
          <button
            type="button"
            disabled={isConnecting || (!translationStarted && !bridgeOutboundReady)}
            onClick={() => {
              if (translationStarted) onStopTranslation();
              else onStartTranslation();
            }}
            className="mt-3 flex h-8 w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 text-[11px] font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {translationStarted ? (
              <>
                <Square className="size-3" fill="currentColor" aria-hidden="true" />
                Stop translation
              </>
            ) : (
              <>
                <Play className="size-3" fill="currentColor" aria-hidden="true" />
                {isConnecting ? "Connecting…" : "Start translation"}
              </>
            )}
          </button>
        </div>
      </div>

      <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-border/60 px-4 py-3">
        <button
          type="button"
          onClick={onToggleMicrophone}
          title={microphoneEnabled ? "Mute WarpTalk microphone" : "Unmute WarpTalk microphone"}
          aria-label={microphoneEnabled ? "Mute WarpTalk microphone" : "Unmute WarpTalk microphone"}
          className="grid size-8 place-items-center rounded-full border border-border/70 bg-surface-2 text-ink transition hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {microphoneEnabled ? <Mic className="size-3.5" /> : <MicOff className="size-3.5" />}
        </button>
        <span className="flex min-w-0 items-center gap-1.5 truncate text-[10px] text-ink-muted">
          <Check className="size-3 text-emerald-600" aria-hidden="true" />
          Google Meet is the call
        </span>
      </footer>
    </section>
  );
}

function StatusRow({
  label,
  detail,
  ready,
}: {
  label: string;
  detail: string;
  ready: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="min-w-0 text-ink-muted">{label}</span>
      <span className="flex shrink-0 items-center gap-1 font-medium text-ink">
        <span className={`size-1.5 rounded-full ${ready ? "bg-emerald-500" : "bg-amber-500"}`} />
        {detail}
      </span>
    </div>
  );
}
