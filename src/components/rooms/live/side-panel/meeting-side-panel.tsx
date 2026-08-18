"use client";

import { useEffect, useState, type PointerEvent as ReactPointerEvent } from "react";

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
            onClick={() => onModeChange("transcript")}
          />
          <TabButton
            active={mode === "chat"}
            label="Chat"
            badge={unreadChatCount || undefined}
            onClick={() => onModeChange("chat")}
          />
          <TabButton
            active={mode === "participants"}
            label="People"
            badge={activeCount}
            onClick={() => onModeChange("participants")}
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-transparent">
          {mode === "transcript" ? (
            <TranscriptPanel
              segments={segments}
              roomId={roomId}
              baseTime={room.startedAt}
              missedCount={missedCount}
              // Same value ChatPanel already translates into — this viewer's listen language.
              readerLanguage={chatTargetLanguage}
            />
          ) : null}
          {mode === "chat" ? (
            <ChatPanel roomId={roomId} targetLanguage={chatTargetLanguage} />
          ) : null}
          {mode === "participants" ? (
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
          ) : null}
        </div>
      </div>
    </aside>
  );
}

function TabButton({
  active,
  label,
  badge,
  onClick,
}: {
  active: boolean;
  label: string;
  badge?: number;
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
