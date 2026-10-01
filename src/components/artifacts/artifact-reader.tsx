"use client";

import { ArtifactRecordHeader } from "./artifact-record-header";
import { TranscriptTimelineReader } from "./transcript-timeline-reader";
import { SummaryReadingReader } from "./summary-reading-reader";
import { MinutesPanel } from "@/components/rooms/minutes-panel";
import { useAuthStore } from "@/stores/auth-store";
import type { ArtifactKind, LibraryEntry, MeetingRecordGroup } from "@/lib/meeting/artifact-library";

/**
 * Unified record reader view for one meeting's artifacts (Transcript, AI Summary, Minutes).
 *
 * Synchronized with the Room ID design language:
 * - Transcript: Timeline layout with speaker avatars, speaker color rings, left timestamps, and clean/verbatim toggle.
 * - Summary: Centered structured prose reading surface with no video player mockup.
 * - Minutes: Reuses the complete official MinutesPanel from Room ID with full print, docx/pdf export, share, and A4 document signing features.
 * - Header: Sleek horizontal meta bar with room code, host avatar, duration, and language route.
 */
export function ArtifactRecordView({
  group,
  entry,
  onSelectKind,
  workspaceSlug,
  onDrawUpMinutes,
  drawingUpMinutes = false,
  showKindSwitcher = true,
}: {
  group: MeetingRecordGroup;
  /** The one currently open. Always a member of `group.entries`. */
  entry: LibraryEntry;
  onSelectKind: (kind: ArtifactKind) => void;
  workspaceSlug: string;
  onDrawUpMinutes?: () => void;
  drawingUpMinutes?: boolean;
  showKindSwitcher?: boolean;
}) {
  const viewerId = useAuthStore((state) => state.user?.id);
  const isHost = entry.hostId === viewerId;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-surface-1">
      {/* Top Header & Horizontal Meta Bar */}
      <ArtifactRecordHeader
        group={group}
        entry={entry}
        onSelectKind={onSelectKind}
        workspaceSlug={workspaceSlug}
        onDrawUpMinutes={onDrawUpMinutes}
        drawingUpMinutes={drawingUpMinutes}
        showKindSwitcher={showKindSwitcher}
      />

      {/* Main Content Area - Scrollable */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {entry.kind === "transcript" ? (
          <TranscriptTimelineReader entry={entry} roomId={group.roomId} />
        ) : entry.kind === "summary" ? (
          <SummaryReadingReader entry={entry} roomId={group.roomId} />
        ) : (
          <div className="mx-auto w-full max-w-5xl px-4 py-6">
            <MinutesPanel
              roomId={group.roomId}
              canManage={isHost}
              generatableLanguages={group.entries.find((e) => e.kind === "transcript")?.targetLanguages}
              onSeek={() => onSelectKind("transcript")}
            />
          </div>
        )}
      </div>
    </div>
  );
}
