"use client";

import { ChatPanel } from "@/components/rooms/live/chat-panel";
import { usePolls } from "@/hooks/use-polls";
import { useQuestions } from "@/hooks/use-qa";
import type { TranscriptSegmentDto } from "@/types/realtime";
import type { HubConnection } from "@microsoft/signalr";
import type {
  TranslationRoomDto,
  TranslationRoomParticipantDto,
} from "@/types/translationRoom";
import { PeoplePanel } from "./people-panel";
import { PollsPanel } from "./polls-panel";
import { QaPanel } from "./qa-panel";
import { TranscriptPanel } from "./transcript-panel";

import { CollaborativeNotesPanel } from "./collaborative-notes-panel";

export type SidePanelMode =
  "transcript" | "chat" | "participants" | "polls" | "qa" | "notes";

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
  connection,
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
  /** SignalR connection to translationRoom hub */
  connection?: HubConnection | null;
}) {
  // Shared cache with polls-panel.tsx/qa-panel.tsx (same query key) — reused here only to
  // size the tab badges, not an extra network round-trip once a panel has fetched it.
  const openPollCount =
    usePolls(roomId).data?.filter((p) => p.status === "open").length ?? 0;
  const openQuestionCount =
    useQuestions(roomId).data?.filter((q) => q.status === "open").length ?? 0;

  return (
    <aside className="flex w-[340px] shrink-0 flex-col overflow-hidden xl:flex hidden">
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
            active={mode === "notes"}
            label="Notes"
            onClick={() => onModeChange("notes")}
          />
          <TabButton
            active={mode === "participants"}
            label="People"
            badge={activeCount}
            onClick={() => onModeChange("participants")}
          />
          <TabButton
            active={mode === "polls"}
            label="Polls"
            badge={openPollCount || undefined}
            onClick={() => onModeChange("polls")}
          />
          <TabButton
            active={mode === "qa"}
            label="Q&A"
            badge={openQuestionCount || undefined}
            onClick={() => onModeChange("qa")}
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-transparent">
          {mode === "transcript" ? (
            <TranscriptPanel segments={segments} />
          ) : null}
          {mode === "chat" ? (
            <ChatPanel roomId={roomId} targetLanguage={chatTargetLanguage} />
          ) : null}
          {mode === "notes" ? (
            <CollaborativeNotesPanel
              connection={connection ?? null}
              roomId={roomId}
            />
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
          {mode === "polls" ? (
            <PollsPanel roomId={roomId} isHost={isHost} />
          ) : null}
          {mode === "qa" ? <QaPanel roomId={roomId} isHost={isHost} /> : null}
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
