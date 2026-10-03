"use client";

/**
 * The layout of the Meet widget. WT-525, Phase 2.
 *
 *   ┌ Transcript | WarpBot ···· ● Translating  [REC Stop]  [Paused]  Reconnecting… ┐
 *   ├ consent, only while the main window is asking ───────────────────────────────┤
 *   ├ "No sound from Meet yet", only before the main window has heard anything ───┤
 *   ├ credits stop / meeting error / "Disconnected · Rejoin meeting" (WT-901) ─────┤
 *   │                                                                               │
 *   │   TranscriptPane (t2)   or   WarpBotPane (t5)                                 │
 *   │                                                                               │
 *   ├ dock ────────────────────────────────────────────────────────────────────────┤
 *   │ [session t3] │ [language t4]                    [Text | Voice] [settings t4] │
 *   └───────────────────────────────────────────────────────────────────────────────┘
 *
 *   Once the room is ENDED, EndedView (t3) replaces the tabs and the dock.
 *
 *   W4b: a room whose translation has NEVER run opens on BridgeStartStep instead — the meeting's
 *   "My language" picker as one compact step with one Start (PO, 2026-10-01). It gives way to the
 *   tabs and dock once translation has run, or when a member presses Continue.
 *
 * NO END (PO, 2026-10-01)
 *   The popup does not end a bridge meeting: it ends when the Google Meet conference does, which
 *   the backend learns from Google. The End button that used to sit at the right of the tab row is
 *   gone; the dock carries translation controls only (Start/Stop, Pause/Resume transcript).
 *
 * ONE TOP ROW, NOT TWO
 *   The status used to sit in a header row of its own above the tabs. In a window this small,
 *   floating over the call, that was a whole line spent on one word, so it now shares the tab row:
 *   tabs on the left, status on the right.
 *
 * The shell passes its slots NO props — see widget-context.tsx. Adding something a slot needs is
 * a change to the context, never to this file.
 *
 * WHAT IS DELIBERATELY NOT HERE
 *   - Mic, camera, chat, leave. Google Meet owns the call, including in its own PiP window.
 *   - A participant chat tab. Exactly two tabs: Transcript and WarpBot.
 *   - A Leave button. In a bridge room the stand-in never disconnects, so leaving would orphan the
 *     room. Nor an End: see above.
 *   - Colours. Theme tokens only: this window floats among the user's own, and the hardcoded
 *     black background WT-577 removed is the complaint that rule exists for.
 */

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { INBOUND_NO_SIGNAL_TITLE, inboundNoSignalHint } from "@/lib/audio/bridge-inbound-health";
import { cn } from "@/lib/utils";

import { CaptureConsentSlot } from "./capture-consent-slot";
import { CaptureTakeoverNotice } from "./capture-takeover-notice";
import { DockFarSideLanguagePill, FarSideLanguageNotice } from "./dock-far-side-language-pill";
import { DockLanguagePill } from "./dock-language-pill";
import { DockListenSwitch } from "./dock-listen-switch";
import { DockSessionControls } from "./dock-session-controls";
import { EndedView } from "./ended-view";
import { MeetCaptionsNotice } from "./meet-captions-notice";
import { MeetFollowNotices } from "./meet-follow-notices";
import { MeetingNotices } from "./meeting-notices";
import { RecordingChip } from "./recording-chip";
import { RecordingStartNotice } from "./recording-start-notice";
import { BridgeMeetMicNotice } from "./audio-mode-choice";
import { BridgeMeetSpeakerNotice, BridgeRawMicNotice } from "./bridge-mic-notices";
import { SessionDisplacedNotice } from "./session-displaced-notice";
import { RelayCarryNotice } from "./relay-carry-notice";
import { SettingsFlyout } from "./settings-flyout";
import { BridgeStartStep } from "./start-step";
import { TranscriptPane } from "./transcript-pane";
import { WarpBotPane } from "./warpbot-pane";
import type { BridgeWidgetMeetingConnection } from "@/lib/meeting/bridge-widget-relay";

import {
  useBridgeWidget,
  type BridgeWidgetConnectionState,
  type BridgeWidgetTranslationStatus,
} from "./widget-context";

type WidgetTab = "transcript" | "warpbot";

const TABS: ReadonlyArray<{ id: WidgetTab; label: string }> = [
  { id: "transcript", label: "Transcript" },
  { id: "warpbot", label: "WarpBot" },
];

export function WidgetShell() {
  const { ended, neverStarted, roomId } = useBridgeWidget();
  // A member's "Continue" past the language step, for this room only.
  const [continuedRoomId, setContinuedRoomId] = useState<string | null>(null);
  const startStep = !ended && neverStarted && continuedRoomId !== roomId;

  return (
    <main className="flex h-[100dvh] flex-col overflow-hidden bg-canvas text-ink">
      {/* WT-912 / WT-913: "You left the Meet call" and the WarpTalk mic strip (on / off, and who
          decides it). Above both screens (the language step and the tabs). */}
      <MeetFollowNotices />
      {ended ? (
        <EndedView />
      ) : startStep ? (
        <BridgeStartStep onContinue={() => setContinuedRoomId(roomId)} />
      ) : (
        <WidgetTabs>
          {/* W4b: nobody is running this room in the main window — said first, with the way out. */}
          <RelayCarryNotice />
          {/* Another login has the meeting: nothing below is true for this device until it is
              taken back, so the way to do that comes before everything else. */}
          <SessionDisplacedNotice />
          {/* Above the panes, because it is the question that explains why the transcript has only
              one side in it — and it must not be reachable only from whichever tab is open. */}
          <CaptureConsentSlot />
          {/* WT-916: people in Meet cannot see the REC chip, so the host is asked to tell them. */}
          <RecordingStartNotice />
          <CaptureTakeoverNotice />
          <InboundNoSignalNotice />
          <MeetingNotices />
          <BridgeMeetMicNotice />
          <BridgeMeetSpeakerNotice />
          <BridgeRawMicNotice />
          <MeetCaptionsNotice />
        </WidgetTabs>
      )}
      {ended || startStep ? null : <WidgetDock />}
    </main>
  );
}

// ── inbound health, under the consent question ──────────────────────────────

/**
 * The main window has heard nothing at all from Meet yet (lib/audio/bridge-inbound-health).
 *
 * Here and not only in the main window, because this is where the user is looking when it
 * matters: they are in Meet, the far side is talking, and the transcript under this line stays
 * empty. Worded as "yet" and conditioned on someone talking, because a healthy cable in a call
 * where nobody has spoken reads exactly the same — the note must stay true then. The fix, when
 * there is one, is one setting in Meet or one in Windows, so the note names both. It has no
 * button — the device wizard lives in the main window — and draws nothing in every other state,
 * including against a main window old enough not to send the field.
 */
function InboundNoSignalNotice() {
  const {
    relay: { view },
    deviceLabels,
  } = useBridgeWidget();
  const noSignal = view.status === "connected" && view.snapshot?.inboundHealth === "no-signal";
  if (!noSignal) return null;

  return (
    <div
      data-bridge-inbound-no-signal
      role="status"
      className="shrink-0 border-b border-border bg-status-waiting/15 px-3.5 py-2 text-[11px] leading-snug text-ink"
    >
      <span className="font-semibold">{INBOUND_NO_SIGNAL_TITLE}.</span>{" "}
      {inboundNoSignalHint(deviceLabels)}
    </div>
  );
}

// ── status, at the right end of the tab row ─────────────────────────────────

const STATUS: Record<BridgeWidgetTranslationStatus, { label: string; dot: string } | null> = {
  // Nothing until the sessions query answers — see BridgeWidgetTranslationStatus.
  unknown: null,
  ready: { label: "Ready", dot: "bg-primary" },
  translating: { label: "Translating", dot: "bg-semantic-success" },
  stopped: { label: "Translation stopped", dot: "bg-ink-subtle" },
};

/**
 * Said only when something is wrong. "Live" in a window that is working is noise; the hub here
 * only carries this user's language and voice changes (see use-bridge-widget-state.ts), so a
 * dropped connection matters exactly when somebody tries one.
 */
const CONNECTION_NOTE: Partial<Record<BridgeWidgetConnectionState, string>> = {
  reconnecting: "Reconnecting…",
  failed: "Disconnected",
};

/**
 * WT-901 / WT-868: the MEETING's connection, from the main window — the one that carries the
 * user's voice and the dub, which the main window no longer shows anywhere a bridge host looks.
 * It speaks for the call, so it wins over this window's own hub note when both have something to
 * say. "Disconnected" is left to the idle-reaped notice when that is the cause, which says why and
 * what to press.
 */
const MEETING_CONNECTION_NOTE: Partial<Record<BridgeWidgetMeetingConnection, string>> = {
  connecting: "Connecting…",
  reconnecting: "Reconnecting…",
  disconnected: "Disconnected",
};

function WidgetStatus() {
  const {
    translationStatus,
    transcriptPaused,
    connectionState,
    meetingConnection,
    idleReaped,
    sessionDisplaced,
  } = useBridgeWidget();
  const status = STATUS[translationStatus];
  // A notice below already says why (reaped, or displaced by another login) and what to press.
  const meetingNote =
    meetingConnection && !((idleReaped || sessionDisplaced) && meetingConnection === "disconnected")
      ? MEETING_CONNECTION_NOTE[meetingConnection]
      : undefined;
  const connectionNote = meetingNote ?? CONNECTION_NOTE[connectionState];

  return (
    <div
      className="ml-auto flex min-w-0 items-center gap-2 py-1.5"
      data-slot="bridge-widget-header-actions"
    >
      {status ? (
        <span className="flex min-w-0 items-center gap-1.5" role="status">
          <span className={cn("size-2 shrink-0 rounded-full", status.dot)} aria-hidden="true" />
          <span className="truncate text-[12px] font-semibold">{status.label}</span>
        </span>
      ) : null}

      {/* WT-910: a bridged call is recorded by default, and this is the only window a bridge user
          sees — so the standing "being recorded" notice lives here, with Stop for host/capturer. */}
      <RecordingChip />

      {transcriptPaused ? (
        // Text in ink, amber on the wash only: the amber token is too light to carry 10px text
        // on a light surface by itself.
        <span className="shrink-0 rounded border border-status-waiting/50 bg-status-waiting/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink">
          Paused
        </span>
      ) : null}

      {connectionNote ? (
        <span className="shrink-0 text-[11px] text-ink-subtle" role="status">
          {connectionNote}
        </span>
      ) : null}
    </div>
  );
}

// ── tabs ─────────────────────────────────────────────────────────────────────

function WidgetTabs({ children }: { children?: ReactNode }) {
  const [tab, setTab] = useState<WidgetTab>("transcript");
  const baseId = useId();
  const tabRefs = useRef<Record<WidgetTab, HTMLButtonElement | null>>({
    transcript: null,
    warpbot: null,
  });

  /** WAI-ARIA tabs: arrows move between tabs and select, Home/End jump to the ends. */
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = TABS.findIndex((entry) => entry.id === tab);
    let next: number | null = null;
    if (event.key === "ArrowRight") next = (index + 1) % TABS.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TABS.length - 1;
    if (next === null) return;
    event.preventDefault();
    const target = TABS[next].id;
    setTab(target);
    tabRefs.current[target]?.focus();
  }

  return (
    <>
      <div className="flex min-h-11 shrink-0 items-center gap-2 border-b border-border bg-surface-1 pl-3 pr-3">
        <div
          role="tablist"
          aria-label="WarpTalk"
          onKeyDown={onKeyDown}
          className="flex shrink-0 gap-0.5 self-end"
        >
          {TABS.map((entry) => {
            const selected = entry.id === tab;
            return (
              <button
                key={entry.id}
                ref={(element) => {
                  tabRefs.current[entry.id] = element;
                }}
                type="button"
                role="tab"
                id={`${baseId}-tab-${entry.id}`}
                aria-selected={selected}
                aria-controls={`${baseId}-panel-${entry.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setTab(entry.id)}
                className={cn(
                  "-mb-px border-b-2 px-2.5 pb-[9px] pt-2.5 text-xs font-semibold transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
                  selected
                    ? "border-primary text-ink"
                    : "border-transparent text-ink-subtle hover:text-ink",
                )}
              >
                {entry.label}
              </button>
            );
          })}
        </div>
        <WidgetStatus />
      </div>

      {children}

      {/* Both panes stay mounted and the inactive one is `hidden`: switching tabs must not throw
          away the transcript's scroll position or a half-typed WarpBot question. */}
      {TABS.map((entry) => (
        <div
          key={entry.id}
          role="tabpanel"
          id={`${baseId}-panel-${entry.id}`}
          aria-labelledby={`${baseId}-tab-${entry.id}`}
          hidden={entry.id !== tab}
          // `flex` only on the visible one: a display utility on the element would otherwise
          // compete with the `hidden` attribute for whether the pane shows at all.
          className={cn("relative min-h-0 flex-1 flex-col", entry.id === tab ? "flex" : "hidden")}
        >
          {entry.id === "transcript" ? <TranscriptPane /> : <WarpBotPane />}
        </div>
      ))}
    </>
  );
}

// ── dock ─────────────────────────────────────────────────────────────────────

/**
 * One row: session controls │ my language, they speak ··· Text | Voice, settings.
 *
 * `relative` so the slots' flyouts can open upward from it (`bottom-full`). The left group may
 * shrink — the host's language pill is the one flexible item; "They speak" shows only a code — and
 * the right group never does, so the listening switch and the settings button cannot be pushed out
 * of a 320px-wide window.
 *
 * Above the row, and only when it applies: the notice that host and far side share one language,
 * which is a room that translates nothing.
 */
function WidgetDock() {
  return (
    <>
    <FarSideLanguageNotice />
    <section
      aria-label="WarpTalk controls"
      data-slot="bridge-widget-dock"
      className="relative flex shrink-0 items-center gap-1.5 border-t border-border bg-surface-2 px-3 py-2.5"
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <DockSessionControls />
        <span aria-hidden="true" className="mx-0.5 h-[22px] w-px shrink-0 bg-border" />
        <DockLanguagePill />
        <DockFarSideLanguagePill />
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <DockListenSwitch />
        <SettingsFlyout />
      </div>
    </section>
    </>
  );
}
