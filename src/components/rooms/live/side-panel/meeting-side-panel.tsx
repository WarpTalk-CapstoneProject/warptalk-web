"use client";

import { ChatPanel } from "@/components/rooms/live/chat-panel";
import type { TranscriptSegmentDto } from "@/types/realtime";
import type {
  TranslationRoomDto,
  TranslationRoomParticipantDto,
} from "@/types/translationRoom";
import { PeoplePanel } from "./people-panel";
import { TranscriptPanel } from "./transcript-panel";

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
  return (
    <aside
      data-meeting-side-panel
      className="flex shrink-0 flex-col overflow-hidden lg:w-[300px] xl:w-[340px] max-lg:fixed max-lg:right-3 max-lg:top-3 max-lg:bottom-24 max-lg:z-50 max-lg:w-[min(340px,calc(100vw-1.5rem))]"
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface-1 rounded-2xl border border-border shadow-sm">
        <div className="flex items-center gap-3 px-3 pt-3 pb-2 shrink-0 border-b border-border overflow-x-auto">
          <TabButton
            active={mode === "transcript"}
            label="Transcript"
            onClick={() => onModeChange("transcript")}
          />
          <TabButton
            active={mode === "chat"}
            label="Chat"
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
            <TranscriptPanel segments={segments} roomId={roomId} baseTime={room.startedAt} />
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
