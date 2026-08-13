"use client";

/**
 * What a meeting leaves behind, once it has ended.
 *
 * It used to be a page-wide rounded Card with a title inside it, floating on the workspace
 * background, and its three actions laid out as a full-width three-column grid of stretched
 * pills below. Two things wrong with that. The Card repeated a boundary the app shell already
 * draws, so the page read as a panel bolted onto the product rather than as part of it. And the
 * actions were sized by the grid rather than by themselves, so "View history" was as loud and as
 * wide as "Open artifacts" — a page with three equally weighted primary actions has none.
 *
 * It is the workspace chrome now, like Meetings and Members: square, flat, one toolbar row with
 * the actions ranked in it, and the artifacts as a plain list underneath. See
 * components/workspace/page-chrome.tsx for why that shape is the product's.
 */

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowClockwise,
  CaretDown,
  CaretRight,
  CheckCircle,
  FileText,
  Spinner,
  Star,
  WarningCircle,
} from "@phosphor-icons/react";

import { Badge } from "@/components/ui/badge";
import {
  WorkspaceBody,
  WorkspaceEmptyState,
  WorkspacePage,
  WorkspacePrimaryButton,
  WorkspaceSecondaryButton,
  WorkspaceToolbar,
} from "@/components/workspace/page-chrome";
import { getErrorMessage } from "@/lib/api/errors";
import { translationRoomService } from "@/services/translation-room.service";

const READY_STATUSES = ["active", "completed", "ready"];
const FAILED_STATUSES = ["deleted", "expired", "failed", "missing"];

const TERMINAL_ARTIFACT_STATUSES = new Set([...READY_STATUSES, ...FAILED_STATUSES]);

export default function RoomEndedPage() {
  const { id: roomId, workspaceSlug } = useParams<{ id: string; workspaceSlug: string }>();
  const roomQuery = useQuery({
    queryKey: ["translationRooms", roomId],
    queryFn: async () => (await translationRoomService.get(roomId)).data,
    enabled: Boolean(roomId),
  });
  const artifactsQuery = useQuery({
    queryKey: ["translationRooms", roomId, "artifacts"],
    queryFn: async () => (await translationRoomService.artifacts(roomId)).data,
    enabled: Boolean(roomId),
    refetchInterval: (query) => {
      const artifacts = query.state.data;
      if (!artifacts || artifacts.length === 0) return 5_000;
      return artifacts.some(
        (artifact) => !TERMINAL_ARTIFACT_STATUSES.has(artifact.status.toLowerCase()),
      )
        ? 5_000
        : false;
    },
  });

  // At most one open at a time. Two long transcripts expanded together turn the page into a
  // wall of text with the list that navigates it pushed off screen.
  const [openArtifactId, setOpenArtifactId] = useState<string | null>(null);

  const room = roomQuery.data;
  const artifacts = artifactsQuery.data ?? [];
  const isLoading = roomQuery.isLoading || artifactsQuery.isLoading;
  const error = roomQuery.error ?? artifactsQuery.error;
  const readyCount = artifacts.filter((artifact) =>
    READY_STATUSES.includes(artifact.status.toLowerCase()),
  ).length;

  // The toolbar is rendered in every state, including loading and error, so the page does not
  // rearrange itself under someone who is already reaching for a button.
  return (
    <WorkspacePage>
      <WorkspaceToolbar
        filters={
          <>
            <Badge variant={room?.status === "ended" ? "default" : "secondary"}>
              {room?.status ?? "ended"}
            </Badge>
            {artifacts.length > 0 ? (
              <span className="text-[13px] text-ink-muted">
                {readyCount} of {artifacts.length} ready
              </span>
            ) : null}
          </>
        }
        actions={
          <>
            <Link href={`/${workspaceSlug}/history`}>
              <WorkspaceSecondaryButton>View history</WorkspaceSecondaryButton>
            </Link>
            <Link href={`/${workspaceSlug}/feedback?roomId=${encodeURIComponent(roomId)}`}>
              <WorkspaceSecondaryButton icon={<Star className="h-3.5 w-3.5" />}>
                Feedback
              </WorkspaceSecondaryButton>
            </Link>
            <Link href={`/${workspaceSlug}/rooms/${roomId}/artifacts`}>
              <WorkspacePrimaryButton icon={<FileText className="h-3.5 w-3.5" />}>
                Open artifacts
              </WorkspacePrimaryButton>
            </Link>
          </>
        }
      />

      <WorkspaceBody>
        {isLoading ? (
          <div className="flex min-h-48 items-center justify-center text-[13px] text-ink-muted">
            <Spinner className="mr-2 h-4 w-4 animate-spin" />
            Loading post-meeting status
          </div>
        ) : error ? (
          <WorkspaceEmptyState
            icon={<WarningCircle className="h-6 w-6" />}
            title="Post-meeting status unavailable"
            description={getErrorMessage(error, "Could not load the room processing status.")}
            action={
              <WorkspaceSecondaryButton
                onClick={() => {
                  void roomQuery.refetch();
                  void artifactsQuery.refetch();
                }}
              >
                Retry
              </WorkspaceSecondaryButton>
            }
          />
        ) : artifacts.length === 0 ? (
          <WorkspaceEmptyState
            icon={<ArrowClockwise className="h-6 w-6 animate-spin" />}
            title="Waiting for post-meeting artifacts"
            description="Nothing has been reported yet. This page checks again on its own while the backend is still processing."
          />
        ) : (
          // A list, not a grid of boxes. Every artifact is the same two facts — what it is and
          // whether it is ready — and a row says that in one line where a card spent four.
          <div className="border-y border-hairline">
            {artifacts.map((artifact) => {
              const status = artifact.status.toLowerCase();
              const isReady = READY_STATUSES.includes(status);
              const isFailed = FAILED_STATUSES.includes(status);
              const StatusIcon = isReady ? CheckCircle : isFailed ? WarningCircle : ArrowClockwise;

              const isOpen = openArtifactId === artifact.id;

              return (
                <div key={artifact.id} className="border-b border-hairline last:border-b-0">
                  <button
                    type="button"
                    // Only a finished artifact has anything to show. An in-progress one is a
                    // row that reports its own progress, not a thing to open.
                    disabled={!isReady}
                    aria-expanded={isOpen}
                    onClick={() => setOpenArtifactId(isOpen ? null : artifact.id)}
                    className="flex w-full items-center gap-3 px-1 py-3 text-left transition-colors enabled:hover:bg-surface-2/50 disabled:cursor-default"
                  >
                    {isReady ? (
                      isOpen ? (
                        <CaretDown className="h-3 w-3 shrink-0 text-ink-subtle" weight="bold" />
                      ) : (
                        <CaretRight className="h-3 w-3 shrink-0 text-ink-subtle" weight="bold" />
                      )
                    ) : (
                      <span className="w-3 shrink-0" />
                    )}
                    <StatusIcon
                      className={`h-4 w-4 shrink-0 ${
                        isReady
                          ? "text-emerald-600"
                          : isFailed
                            ? "text-destructive"
                            : "animate-spin text-ink-muted"
                      }`}
                    />
                    {/* The title alone. The server generates it FROM the type — "summary export
                        (TEXT/MARKDOWN)" over "SUMMARY_EXPORT" — so printing both put the same two
                        words on two lines, which the old card hid only by being large enough to
                        absorb it. */}
                    <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
                      {artifact.title || artifact.type.replaceAll("_", " ").toLowerCase()}
                    </p>
                    <Badge variant={isReady ? "default" : isFailed ? "destructive" : "secondary"}>
                      {artifact.status}
                    </Badge>
                  </button>

                  {isOpen ? <ArtifactPreview artifactId={artifact.id} /> : null}
                </div>
              );
            })}
          </div>
        )}
      </WorkspaceBody>
    </WorkspacePage>
  );
}

/**
 * The artifact's own text, read on this page instead of downloaded and opened elsewhere.
 *
 * The summary and transcript are written INTO the artifact row (ArtifactsFinalizer sets
 * Content), so the download endpoint already answers with the text for anything that is not a
 * recording. Sending someone to a file manager to find out what their meeting was about was
 * never a deliberate decision — it is just what a page with only a download button leaves them.
 *
 * Fetched only when opened, and cached from then on: this is the text of a finished meeting, so
 * it cannot change under the reader.
 */
function ArtifactPreview({ artifactId }: { artifactId: string }) {
  const { data, status } = useQuery({
    queryKey: ["translationRooms", "artifact", artifactId, "content"],
    queryFn: async () => (await translationRoomService.artifactDownload(artifactId)).data,
    staleTime: Infinity,
  });

  if (status === "pending") {
    return (
      <div className="flex items-center gap-2 px-1 pb-3 text-[12px] text-ink-muted">
        <Spinner className="h-3.5 w-3.5 animate-spin" />
        Loading preview
      </div>
    );
  }

  if (status === "error") {
    return (
      <p className="px-1 pb-3 text-[12px] text-ink-subtle">
        Couldn&rsquo;t load this artifact&rsquo;s content.
      </p>
    );
  }

  // A recording has a signed URL and no text. Saying which of the two this is beats rendering
  // an empty box that looks like a failure.
  if (!data?.content?.trim()) {
    return (
      <p className="px-1 pb-3 text-[12px] text-ink-subtle">
        {data?.url
          ? "This artifact is a file rather than text — use Open artifacts to download it."
          : "No content was stored for this artifact."}
      </p>
    );
  }

  return (
    <div className="px-1 pb-3">
      {/* Capped and scrollable. A ninety-minute transcript is thousands of lines, and a preview
          that pushes every other artifact off the page is not a preview. */}
      <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded-md border border-hairline bg-surface-1 p-3 font-sans text-[12px] leading-relaxed text-ink-muted">
        {data.content}
      </pre>
    </div>
  );
}
