"use client";

import {
  AlertTriangle,
  Check,
  CircleCheck,
  ExternalLink,
  Headphones,
  Info,
  Mic,
  MicOff,
  Play,
  SlidersHorizontal,
  Square,
  X,
} from "lucide-react";
import { useState } from "react";

import { MEET_SPEAKER_RESET_NOTICE } from "@/lib/audio/bridge-far-side-monitor";
import {
  INBOUND_NO_SIGNAL_TITLE,
  inboundNoSignalHint,
  type InboundHealth,
} from "@/lib/audio/bridge-inbound-health";
import { currentBridgeDeviceLabels } from "@/lib/audio/virtual-bridge-check";
import { openInSystemBrowser } from "@/lib/desktop/bridge";
import type { BridgeInboundPath } from "@/lib/desktop/bridge-tiers";
import type { TranslationRoomDto } from "@/types/translationRoom";
import { DisplacedSessionNotice } from "./displaced-session-notice";
import { MeetingExitControl } from "./meeting-top-bar";

export function ExternalBridgeWidget({
  room,
  isHost,
  isConnecting,
  meetingError,
  microphoneEnabled,
  translationStarted,
  bridgeOutboundReady,
  inboundPath,
  inboundHealth,
  meetSpeakerResetNotice,
  idleDisconnected,
  onRejoin,
  sessionDisplaced = false,
  onTakeOver,
  onToggleMicrophone,
  onStartTranslation,
  onStopTranslation,
  onOpenDeviceSetup,
  onExit,
}: {
  room: TranslationRoomDto;
  isHost: boolean;
  isConnecting: boolean;
  meetingError: string | null;
  microphoneEnabled: boolean;
  translationStarted: boolean;
  bridgeOutboundReady: boolean;
  /**
   * Where the far side comes in, as the meeting decided it (selectBridgeInboundSource): listening
   * to the browser, the virtual speaker Meet plays into, or nothing.
   *
   * One value rather than the two booleans it replaces. Those were "is there a device" and "can
   * loopback run", and the row picked between them itself — device first — so after WT-898 made
   * loopback the first choice, and a failed loopback fall back to the cable, the row would have
   * named whichever mechanism the widget guessed rather than the one actually carrying the call.
   * The inbound row also used to key on the OUTBOUND device once, reporting "ready" on a machine
   * where nothing from Meet could reach WarpTalk at all; null here is that case, said plainly.
   */
  inboundPath: BridgeInboundPath | null;
  /** Whether sound is actually arriving from Meet; see lib/audio/bridge-inbound-health. */
  inboundHealth: InboundHealth;
  /**
   * WT-898 review: listening to the browser while Hi-Fi Cable is still installed
   * (shouldShowMeetSpeakerResetNotice). The host may still have Meet's Speakers on the cable from
   * the old wizard, and on this path nothing plays the call back to them. Dismissible per room.
   */
  meetSpeakerResetNotice: boolean;
  /**
   * The idle reaper let go of this meeting: no Meet window and no speech for 15 minutes.
   *
   * The session's own "Rejoin meeting" overlay lives in the compact branch this widget replaces, so
   * a reaped bridge used to have no way back short of leaving the room — and went on saying
   * "Translation is live" over a connection that was gone.
   */
  idleDisconnected: boolean;
  onRejoin: () => void;
  /** The same account joined this meeting elsewhere and evicted this session. */
  sessionDisplaced?: boolean;
  /** "Use this device": reconnect here, which evicts the other session. */
  onTakeOver?: () => void;
  onToggleMicrophone: () => void;
  onStartTranslation: () => void;
  onStopTranslation: () => void;
  /**
   * WT-578: reopen the device setup wizard.
   *
   * Always offered, not only while something is broken. Virtual audio devices are taken away by
   * reboots, app updates and other programs grabbing the driver, and the meeting is already
   * running when that happens — so the repair has to be reachable from a healthy-looking widget.
   */
  onOpenDeviceSetup: () => void;
  onExit: (action: "leave" | "end") => void;
}) {
  /**
   * Translation cannot start yet because the outbound device is missing.
   *
   * Only while translation is NOT running: a device that disappears mid-call is a repair, and
   * turning the live Stop button into "Set up audio devices" would take away the one control the
   * user needs to stop a session that is already publishing.
   */
  const needsSetup = !translationStarted && !bridgeOutboundReady;

  // Once per room, not once per mount: the widget remounts with the meeting window, and a note the
  // host already dismissed coming back every time is a note they learn to dismiss unread. React
  // state answers within this mount; sessionStorage carries it across remounts of the same tab.
  const [speakerNoticeDismissedFor, setSpeakerNoticeDismissedFor] = useState<string | null>(null);
  const showSpeakerNotice =
    meetSpeakerResetNotice &&
    speakerNoticeDismissedFor !== room.id &&
    !readSpeakerNoticeDismissed(room.id);

  // The inbound row answers two questions in one line: is there a way in at all, and is anything
  // coming through it. The second only has an answer while a capture is running; before that the
  // row names the mechanism, as it always did.
  const inboundAvailable = inboundPath !== null;
  const inboundNoSignal = inboundAvailable && inboundHealth === "no-signal";
  const inboundDetail = !inboundAvailable
    ? "Not set up"
    : inboundHealth === "listening"
      ? "Listening"
      : inboundHealth === "quiet"
        ? "Quiet"
        : inboundHealth === "no-signal"
          ? INBOUND_NO_SIGNAL_TITLE
          : inboundPath === "loopback"
            ? "Meet window capture"
            : "Virtual speaker";

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
            detail={inboundDetail}
            ready={inboundAvailable && !inboundNoSignal}
          />

          {/*
            Only for "no-signal", which only the virtual-device path can reach, and only before
            anything has come through: a capture that has carried exact digital zeros since its
            first sample. A healthy cable in a call where nobody has spoken yet reads the same, so
            this is a soft note, not a warning — "yet", and conditioned on someone talking. When
            someone IS talking it is almost always one of two settings outside WarpTalk, so the
            hint names them rather than saying "check your audio". The Device settings button
            right below is the action.
          */}
          {inboundNoSignal ? (
            <div
              data-bridge-inbound-no-signal
              role="status"
              className="flex gap-1.5 rounded-md border border-border/60 bg-surface-1 p-2 text-[10.5px] leading-relaxed text-ink-muted"
            >
              <Info className="mt-0.5 size-3 shrink-0 text-ink-muted" aria-hidden="true" />
              <p>{inboundNoSignalHint(currentBridgeDeviceLabels())}</p>
            </div>
          ) : null}

          {/*
            WT-898 review. Non-blocking and dismissible: it is advice about a setting WarpTalk
            cannot read, so it may well be moot for this host — but for one who followed the old
            wizard it is the difference between hearing the call and hearing nothing.
          */}
          {showSpeakerNotice ? (
            <div
              data-bridge-meet-speaker-reset
              role="status"
              className="flex gap-1.5 rounded-md border border-primary/30 bg-primary/5 p-2 text-[10.5px] leading-relaxed text-ink-muted"
            >
              <Headphones className="mt-0.5 size-3 shrink-0 text-primary" aria-hidden="true" />
              <p className="min-w-0 flex-1">{MEET_SPEAKER_RESET_NOTICE}</p>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => {
                  setSpeakerNoticeDismissedFor(room.id);
                  writeSpeakerNoticeDismissed(room.id);
                }}
                className="grid size-4 shrink-0 place-items-center rounded text-ink-muted transition hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </div>
          ) : null}

          {/*
            WT-578. Under the three rows that report the devices, because this is what a reader
            does about what they just read. Those rows have always been able to say "not ready" and
            there was nothing on this widget — or anywhere else a user can reach — that acted on it.
          */}
          <button
            type="button"
            onClick={onOpenDeviceSetup}
            className="flex h-7 w-full items-center justify-center gap-1.5 rounded-md border border-border/70 text-[11px] font-medium text-ink-muted transition hover:bg-surface-3 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <SlidersHorizontal className="size-3" aria-hidden="true" />
            Device settings
          </button>
        </div>

        {meetingError ? (
          <div className="flex gap-2 rounded-lg border border-red-500/25 bg-red-500/8 p-3 text-[11px] text-red-700 dark:text-red-300">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <p className="leading-relaxed">{meetingError}</p>
          </div>
        ) : null}

        {sessionDisplaced && onTakeOver ? (
          <DisplacedSessionNotice variant="card" onTakeOver={onTakeOver} />
        ) : null}

        {idleDisconnected ? (
          <div data-bridge-idle-disconnected className="rounded-lg border border-amber-500/30 bg-amber-500/8 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold">
              <AlertTriangle className="size-3.5 text-amber-600" aria-hidden="true" />
              Disconnected
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-ink-muted">
              No sign of the Google Meet call for 15 minutes, so WarpTalk stopped using your meeting
              minutes. Nothing is being translated.
            </p>
            <button
              type="button"
              onClick={onRejoin}
              className="mt-3 flex h-8 w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 text-[11px] font-semibold text-white transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Rejoin meeting
            </button>
          </div>
        ) : (
          <div className="rounded-lg border border-border/60 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold">
              {translationStarted ? (
                <CircleCheck className="size-3.5 text-emerald-600" aria-hidden="true" />
              ) : needsSetup ? (
                <AlertTriangle className="size-3.5 text-amber-600" aria-hidden="true" />
              ) : (
                <span className="size-3.5 rounded-full border border-ink-muted/40" />
              )}
              {translationStarted
                ? "Translation is live"
                : needsSetup
                  ? "Audio devices not set up"
                  : "Translation is ready"}
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-ink-muted">
              {translationStarted
                ? "Speak into your real microphone. The translated voice is sent to Meet."
                : needsSetup
                  ? "The virtual microphone Meet listens to is not installed yet."
                  : "Create or join the call in Google Meet, then start WarpTalk here."}
            </p>
            {/*
              WT-578. This was one button that disabled itself when the outbound device was missing,
              and a greyed-out "Start translation" is the whole bug in miniature: it names the thing
              the user came to do, refuses to do it, and says nothing about what would change that.
              With no device the button's job is not to start translation, it is to go and get the
              device — so it becomes that button rather than a disabled version of another one.
            */}
            <button
              type="button"
              disabled={isConnecting && !needsSetup}
              onClick={() => {
                if (needsSetup) onOpenDeviceSetup();
                else if (translationStarted) onStopTranslation();
                else onStartTranslation();
              }}
              className="mt-3 flex h-8 w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 text-[11px] font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {needsSetup ? (
                <>
                  <SlidersHorizontal className="size-3" aria-hidden="true" />
                  Set up audio devices
                </>
              ) : translationStarted ? (
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
        )}
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

const SPEAKER_NOTICE_KEY_PREFIX = "warptalk:bridge-meet-speaker-reset-dismissed:";

// sessionStorage can be missing or throw (private windows, blocked site data). A failed read means
// "not dismissed" — the note shows once more — and a failed write leaves the React state to carry
// the dismissal for this mount. Neither is worth an error.
function readSpeakerNoticeDismissed(roomId: string): boolean {
  try {
    return window.sessionStorage.getItem(SPEAKER_NOTICE_KEY_PREFIX + roomId) === "1";
  } catch {
    return false;
  }
}

function writeSpeakerNoticeDismissed(roomId: string): void {
  try {
    window.sessionStorage.setItem(SPEAKER_NOTICE_KEY_PREFIX + roomId, "1");
  } catch {
    // See above.
  }
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
