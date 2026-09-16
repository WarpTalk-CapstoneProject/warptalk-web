"use client";

import {
  useEffect,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { PauseCircle } from "@phosphor-icons/react/dist/ssr";

import { ChatPanel } from "@/components/rooms/live/chat-panel";
import { useTranslationRoomStore } from "@/stores/translationRoom-store";
import type { TranscriptSegmentDto } from "@/types/realtime";
import type {
  TranslationRoomDto,
  TranslationRoomParticipantDto,
} from "@/types/translationRoom";
import { PeoplePanel } from "./people-panel";
import { TranscriptPanel } from "./transcript-panel";
import {
  SIDE_PANEL_WIDTH_STORAGE_KEY,
  clampSidePanelWidth,
  readStoredSidePanelWidth,
} from "@/lib/meeting/side-panel-width";

export type SidePanelMode = "transcript" | "chat" | "participants";

export function MeetingSidePanel({
  roomId,
  room,
  isHost,
  mode,
  onModeChange,
  participants,
  participantsLoading,
  participantsError,
  activeCount,
  segments,
  missedCount,
  transcriptPause,
  transcriptPausePending,
  onToggleTranscriptPause,
  onCopyText,
  joinLink,
  chatTargetLanguage,
  raisedHandUserIds,
  spotlightedUserId,
  onToggleSpotlight,
}: {
  roomId: string;
  room: TranslationRoomDto;
  isHost: boolean;
  mode: SidePanelMode;
  onModeChange: (mode: SidePanelMode) => void;
  participants: TranslationRoomParticipantDto[];
  participantsLoading: boolean;
  participantsError: boolean;
  activeCount: number;
  segments: TranscriptSegmentDto[];
  /** Lines already spoken when this person joined; passed through to the transcript. */
  missedCount?: number;
  /** WT-605: passed straight through to the transcript panel — see its own prop doc. */
  transcriptPause?: { paused: boolean; since: string | null };
  /** The pause/resume request is in flight. Everyone sees the state; only the host sees this. */
  transcriptPausePending?: boolean;
  /**
   * WT-605, host-only: flips the transcript between recording and paused.
   *
   * Omit to hide the control — that is how it is kept to the host, and it must be the ROOM host
   * (isRoomHost). TranscriptRecordingService gates on IsRoomHostAsync, so a workspace admin,
   * host-like on every other control in this meeting, would be handed a button that answers 403.
   *
   * The STATE is not host-only and never travels with this prop: `transcriptPause` above reaches
   * every participant, because a transcript that quietly stops growing looks exactly like a room
   * that has gone quiet and only one of those is worth reacting to.
   */
  onToggleTranscriptPause?: () => void;
  onCopyText: (value: string, label: string) => void;
  joinLink: string;
  /** Viewer's own listen language — passed to ChatPanel for on-click translation. */
  chatTargetLanguage?: string;
  /** userIds with a currently raised hand — see TranslationRoomHub.RaiseHand. */
  raisedHandUserIds?: Set<string>;
  /** Host-forced spotlight target, if any — see TranslationRoomHub.SpotlightChanged. */
  spotlightedUserId?: string | null;
  /** Host-only: toggles spotlight for this participant. Omit to hide the control. */
  onToggleSpotlight?: (userId: string) => void;
}) {
  // The panel used to be `flex w-[340px] shrink-0 flex-col overflow-hidden xl:flex hidden` —
  // with no tailwind.config and no --breakpoint-* override in globals.css, Tailwind v4's default
  // xl is 1280px, so Transcript/Chat/People were display:none on anything narrower. A 1280x720
  // window sits exactly ON that boundary, so a scrollbar, a non-maximised window or 110% zoom
  // silently deleted the live transcript while `rightSidebarOpen` was still true and Start
  // Translation reported success.
  //
  // Two tiers now, and neither can hide the control bar:
  //  - lg (>=1024px): a normal in-flow column, 300px, widening to 340px at xl. The stage is a
  //    `min-w-0 flex-1` sibling, so it just gets narrower.
  //  - below lg: an overlay drawer pinned to the right. top-3/bottom-24 (96px) keeps it clear of
  //    the bottom dock (min-h-12 = 48px, plus the main's p-3), so the control bar and the exit
  //    control stay fully visible and clickable, and the left part of the stage stays on screen.
  // How many chat messages have arrived since this panel last showed the Chat tab.
  //
  // The tab said nothing when a message came in, so a conversation happening in the panel
  // you were not looking at was invisible until you happened to click. The count is derived
  // from the store rather than from a subscription: while Chat is open there is by
  // definition nothing unread, so the mark simply follows the message list.
  const chatMessages = useTranslationRoomStore((state) => state.chatMessages);
  const [seenChatCount, setSeenChatCount] = useState(chatMessages.length);

  // A TAB IS NOT A REMOUNT.
  //
  // The three bodies used to be rendered conditionally, so every click on Transcript or People
  // destroyed the panel you were leaving and rebuilt it when you came back. That threw away
  // everything the panel was holding and nothing warned you: the half-typed chat message in the
  // editor, which messages the reader had opened a translation on, and the scroll offset — the
  // last of which is why the chat replayed itself from the top on the way back in.
  //
  // Inactive tabs now stay mounted and are hidden with `invisible`. NOT `hidden`/display:none:
  // both panels keep themselves pinned to the newest line while they are away, and a
  // display:none subtree measures as scrollHeight 0 / clientHeight 0 (checked in the browser,
  // against 2116/120 for the same box under visibility:hidden) — so that effect would quietly
  // write scrollTop 0 and hand back a panel scrolled to the top, which is the bug this is
  // fixing, by another route. visibility:hidden keeps the box and its measurements and only
  // stops it being painted; it also drops the subtree out of the tab order, so nothing behind
  // the panel is reachable by keyboard.
  //
  // Lazily, though. A tab nobody has opened costs nothing, which is what keeps an untouched
  // transcript from rendering every line of a two-hour meeting in the background.
  const [visitedModes, setVisitedModes] = useState<Set<SidePanelMode>>(
    () => new Set([mode]),
  );

  function selectMode(next: SidePanelMode) {
    setVisitedModes((current) =>
      current.has(next) ? current : new Set(current).add(next),
    );
    onModeChange(next);
  }

  /** Visited at least once — plus whatever is on screen now, which may have been switched to
   *  from outside this component (persistent-meeting-session jumps to the transcript). */
  function isMounted(candidate: SidePanelMode) {
    return candidate === mode || visitedModes.has(candidate);
  }

  useEffect(() => {
    if (mode === "chat") {
      setSeenChatCount(chatMessages.length);
    }
  }, [mode, chatMessages.length]);

  // WT test feedback, 15 Aug: "cửa sổ transcript này cho điều chỉnh kéo to ra ko ... để nhỏ quá
  // nhìn khó". A translated transcript is the thing people READ during a call, and a fixed narrow
  // column wraps every line two or three times. Clamping lives in lib/meeting/side-panel-width.ts
  // — the panel is a flex sibling of the stage, so an unbounded drag would collapse the video and
  // the control bar with it.
  const [panelWidth, setPanelWidth] = useState<number | null>(null);

  useEffect(() => {
    const stored = readStoredSidePanelWidth(window.localStorage.getItem(SIDE_PANEL_WIDTH_STORAGE_KEY));
    if (stored !== null) setPanelWidth(clampSidePanelWidth(stored, window.innerWidth));
  }, []);

  function beginResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = event.currentTarget.parentElement?.getBoundingClientRect().width ?? 340;

    function onMove(move: PointerEvent) {
      // The handle is on the LEFT edge, so dragging left (a falling clientX) widens the panel.
      setPanelWidth(clampSidePanelWidth(startWidth + (startX - move.clientX), window.innerWidth));
    }
    function onUp() {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      // Read back off state rather than recomputing: the last move already clamped it, and
      // persisting an unclamped value would restore a broken layout on the next visit.
      setPanelWidth((current) => {
        if (current !== null) {
          window.localStorage.setItem(SIDE_PANEL_WIDTH_STORAGE_KEY, String(current));
        }
        return current;
      });
    }
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }

  /** Double-click hands the width back to the responsive defaults rather than to a constant. */
  function resetWidth() {
    window.localStorage.removeItem(SIDE_PANEL_WIDTH_STORAGE_KEY);
    setPanelWidth(null);
  }

  const unreadChatCount = mode === "chat" ? 0 : Math.max(0, chatMessages.length - seenChatCount);

  return (
    <aside
      data-meeting-side-panel
      // The inline width only appears once the user has dragged. Until then the responsive
      // classes below own it, so a first-time viewer still gets 300px at lg and 340px at xl
      // rather than one width baked in for every screen the day this shipped.
      style={panelWidth ? { width: `${panelWidth}px` } : undefined}
      className={`relative flex shrink-0 flex-col overflow-hidden max-lg:fixed max-lg:right-3 max-lg:top-3 max-lg:bottom-24 max-lg:z-50 max-lg:w-[min(340px,calc(100vw-1.5rem))] ${
        panelWidth ? "" : "lg:w-[300px] xl:w-[340px]"
      }`}
    >
      {/* Drag to widen the transcript. Hidden below lg, where the panel is an overlay pinned to
          the viewport and there is no stage to take width from. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panel"
        onPointerDown={beginResize}
        onDoubleClick={resetWidth}
        title="Drag to resize · double-click to reset"
        className="absolute left-0 top-0 z-10 hidden h-full w-1.5 -translate-x-1/2 cursor-col-resize touch-none lg:block hover:bg-primary/30 active:bg-primary/50"
      />
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-surface-1 rounded-2xl border border-border shadow-sm">
        <div className="flex items-center gap-3 px-3 pt-3 pb-2 shrink-0 border-b border-border overflow-x-auto">
          <TabButton
            active={mode === "transcript"}
            label="Transcript"
            // WT-605. The control below only exists while this tab is open, so somebody sitting
            // in Chat or People would have no way of knowing the record had stopped. The dot is
            // for THEM: it is on the tab, not on the control, it is shown to every participant
            // rather than only to the host, and it survives the panel being on another tab.
            marked={Boolean(transcriptPause?.paused)}
            markLabel="Transcript paused"
            onClick={() => selectMode("transcript")}
          />
          <TabButton
            active={mode === "chat"}
            label="Chat"
            badge={unreadChatCount || undefined}
            onClick={() => selectMode("chat")}
          />
          <TabButton
            active={mode === "participants"}
            label="People"
            badge={activeCount}
            onClick={() => selectMode("participants")}
          />
          {/* WT-605. Moved here from the bottom dock, where it sat between Stop Translation,
              Record and CC — three switches about the meeting, one about the panel this control
              actually governs. It belongs beside the thing it changes.

              Only while the Transcript tab is showing: a Pause button hovering over the People
              list is a button whose effect is off-screen. The cost of that is somebody in another
              tab losing the switch, which is what the dot on the Transcript tab answers, and
              somebody below `lg` — where this whole panel is a drawer that can be shut — losing
              it entirely, which the row in the dock's Settings menu answers by opening the drawer
              on this tab first. */}
          {onToggleTranscriptPause && mode === "transcript" ? (
            <TranscriptPauseControl
              paused={Boolean(transcriptPause?.paused)}
              pending={Boolean(transcriptPausePending)}
              onClick={onToggleTranscriptPause}
            />
          ) : null}
        </div>

        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-transparent">
          {isMounted("transcript") ? (
            <PanelSlot active={mode === "transcript"}>
              <TranscriptPanel
                segments={segments}
                roomId={roomId}
                baseTime={room.startedAt}
                missedCount={missedCount}
                transcriptPause={transcriptPause}
                // Same value ChatPanel already translates into — this viewer's listen language.
                readerLanguage={chatTargetLanguage}
              />
            </PanelSlot>
          ) : null}
          {isMounted("chat") ? (
            <PanelSlot active={mode === "chat"}>
              <ChatPanel
                roomId={roomId}
                targetLanguage={chatTargetLanguage}
                active={mode === "chat"}
              />
            </PanelSlot>
          ) : null}
          {isMounted("participants") ? (
            <PanelSlot active={mode === "participants"}>
              <PeoplePanel
                roomId={roomId}
                room={room}
                isHost={isHost}
                participants={participants}
                participantsLoading={participantsLoading}
                participantsError={participantsError}
                onCopyText={onCopyText}
                joinLink={joinLink}
                raisedHandUserIds={raisedHandUserIds}
                spotlightedUserId={spotlightedUserId}
                onToggleSpotlight={onToggleSpotlight}
              />
            </PanelSlot>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

/**
 * One tab body, stacked on the others. Inactive slots keep their layout — and therefore their
 * scroll position and their children's state — and lose only their paint.
 */
function PanelSlot({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <div
      aria-hidden={!active}
      className={`absolute inset-0 flex min-h-0 flex-col ${active ? "" : "invisible"}`}
    >
      {children}
    </div>
  );
}

function TabButton({
  active,
  label,
  badge,
  marked,
  markLabel,
  onClick,
}: {
  active: boolean;
  label: string;
  badge?: number;
  /** A state worth knowing about from another tab. Currently only the transcript pause. */
  marked?: boolean;
  /** What the mark means. Required reading for a screen reader, since a dot says nothing. */
  markLabel?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-1.5 pb-2.5 text-[13px] font-medium outline-none transition-colors ${
        active ? "text-ink" : "text-ink-subtle hover:text-ink"
      }`}
    >
      {label}
      {marked ? (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
          title={markLabel}
          aria-label={markLabel}
          role="img"
        />
      ) : null}
      {badge !== undefined && (
        <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-surface-2 px-1 text-[10px] font-semibold text-ink-muted">
          {badge}
        </span>
      )}
      {active && (
        <div className="absolute inset-x-0 bottom-0 h-0.5 rounded-t-full bg-ink" />
      )}
    </button>
  );
}

/**
 * WT-605, host-only: pause or resume the writing-down of the transcript.
 *
 * ICON ONLY, AND THAT IS THE SPEC RATHER THAN A SAVING OF SPACE
 *   The product owner asked for "nút chỉ gồm icon, user rê chuột vào sẽ hiển thị công dụng" — the
 *   tooltip is the ONLY place the words appear. Which makes `aria-label` load-bearing rather than
 *   decorative: an icon with no accessible name is a button a screen reader announces as
 *   "button", and this one changes whether the meeting is being written down. The label and the
 *   tooltip are therefore the same string, so they cannot drift.
 *
 * The state language is the one the dock control already had and readers have already learned:
 * the glyph fills when paused, pulses while the request is in flight, and takes the `active`
 * treatment so it is legible as a switch that is currently ON rather than a button to press.
 */
function TranscriptPauseControl({
  paused,
  pending,
  onClick,
}: {
  paused: boolean;
  pending: boolean;
  onClick: () => void;
}) {
  const label = pending
    ? "Transcript request in progress"
    : paused
      ? "Resume transcript"
      : "Pause transcript";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-label={label}
      title={label}
      aria-pressed={paused}
      className={`ml-auto mb-2.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg transition-colors ${
        pending
          ? "cursor-not-allowed text-ink-tertiary"
          : paused
            ? "bg-amber-500/15 text-amber-600"
            : "text-ink-subtle hover:bg-surface-2 hover:text-ink"
      }`}
    >
      <PauseCircle
        className={`h-[18px] w-[18px] ${pending ? "animate-pulse" : ""}`}
        weight={paused ? "fill" : "regular"}
      />
    </button>
  );
}
