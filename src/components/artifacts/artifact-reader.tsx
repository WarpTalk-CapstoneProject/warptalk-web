"use client";

import { ArtifactRecordHeader } from "./artifact-record-header";
import { TranscriptTimelineReader } from "./transcript-timeline-reader";
import { SummaryReadingReader } from "./summary-reading-reader";
import { MinutesReadingReader } from "./minutes-reading-reader";
import type { ArtifactKind, LibraryEntry, MeetingRecordGroup } from "@/lib/meeting/artifact-library";

/**
 * Unified record reader view for one meeting's artifacts (Transcript, AI Summary, Minutes).
 *
 * Synchronized with the Room ID design language:
 * - Transcript: Timeline layout with speaker avatars, speaker color rings, left timestamps, and clean/verbatim toggle.
 * - Summary: Centered structured prose reading surface with no video player mockup.
 * - Minutes: Official minutes layout with signatory blocks and legal status.
 * - Header: Sleek horizontal meta bar with room code, host avatar, duration, and language route.
 */
export function ArtifactRecordView({
  group,
  entry,
  onSelectKind,
  workspaceSlug,
  onDrawUpMinutes,
  drawingUpMinutes = false,
}: {
  group: MeetingRecordGroup;
  /** The one currently open. Always a member of `group.entries`. */
  entry: LibraryEntry;
  onSelectKind: (kind: ArtifactKind) => void;
  workspaceSlug: string;
  onDrawUpMinutes?: () => void;
  drawingUpMinutes?: boolean;
}) {
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
      />

      {/* Main Content Area - Scrollable */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {entry.kind === "transcript" ? (
          <TranscriptTimelineReader entry={entry} roomId={group.roomId} />
        ) : entry.kind === "summary" ? (
          <SummaryReadingReader entry={entry} roomId={group.roomId} />
        ) : (
          <MinutesReadingReader entry={entry} roomId={group.roomId} />
        )}
      </div>
    </div>
  );
}
