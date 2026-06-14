"use client";

import { ChatPanel } from "@/components/rooms/live/chat-panel";
import type { TranslationRoomDto, TranslationRoomParticipantDto } from "@/types/translationRoom";
import type { TranscriptSegmentDto } from "@/types/realtime";
import { TranscriptPanel } from "./transcript-panel";
import { WarpBotPanel } from "./warpbot-panel";
import { PeoplePanel } from "./people-panel";

export type SidePanelMode = "transcript" | "chat" | "warpbot" | "participants";

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
  meetingStarted,
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
  meetingStarted: boolean;
}) {
  return (
    <aside className="flex w-[340px] shrink-0 flex-col overflow-hidden xl:flex hidden">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface-1 rounded-2xl border border-border shadow-sm">
        <div className="flex items-center gap-4 px-4 pt-3 pb-2 shrink-0 border-b border-border">
          <TabButton active={mode === "transcript"} label="Transcript" onClick={() => onModeChange("transcript")} />
          {meetingStarted ? (
            <TabButton active={mode === "chat"} label="Chat" onClick={() => onModeChange("chat")} />
          ) : null}
          <TabButton active={mode === "warpbot"} label="WarpBot" onClick={() => onModeChange("warpbot")} />
          <TabButton active={mode === "participants"} label="Participants" badge={activeCount} onClick={() => onModeChange("participants")} />
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-transparent">
          {mode === "transcript" ? <TranscriptPanel segments={segments} /> : null}
          {mode === "chat" ? <ChatPanel roomId={roomId} /> : null}
          {mode === "warpbot" ? <WarpBotPanel /> : null}
          {mode === "participants" ? (
            <PeoplePanel
              roomId={roomId}
              room={room}
              isHost={isHost}
              participants={participants}
              participantsLoading={participantsLoading}
              participantsError={participantsError}
              activeCount={activeCount}
              onCopyText={onCopyText}
              joinLink={joinLink}
            />
          ) : null}
        </div>
      </div>
    </aside>
  );
}

function TabButton({ active, label, badge, onClick }: { active: boolean; label: string; badge?: number; onClick: () => void }) {
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
      {active && <div className="absolute inset-x-0 bottom-0 h-0.5 rounded-t-full bg-ink" />}
    </button>
  );
}
