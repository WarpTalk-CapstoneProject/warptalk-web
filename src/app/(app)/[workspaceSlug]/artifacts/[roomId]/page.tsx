"use client";

/**
 * One meeting's records, at their own address.
 *
 * WHY A PAGE AND NOT THE PANEL IT REPLACES
 *   Opening a card used to slide a 460px rail in beside the grid. Three things were wrong with
 *   that, and only the first is about width: a transcript read through a letterbox while the
 *   library's own filters stayed on screen doing nothing for the reader; a record had no URL, so
 *   it could not be linked to a teammate, opened in a second tab, or returned to with Back; and
 *   the grid kept its selection state, so "which record am I reading" lived in two places.
 *
 *   The documents library already answers this the other way — a card there opens
 *   /documents/{id} — so records now match it rather than being the one library in the product
 *   that reads sideways.
 *
 * WHERE THE DATA COMES FROM
 *   The same `useArtifactLibrary` the list page uses, narrowed to this room. That is deliberate,
 *   not lazy: React Query has already cached it, so arriving from a card renders instantly with
 *   no second round trip, and `useEndedRoomRecord` established the pattern of selecting one room
 *   out of the shared room-history query.
 *
 *   The cost is honest and stated in NotFound below: a meeting past the first page of history is
 *   not in that cache, and a deep link to one says so rather than showing an empty record.
 */

import Link from "next/link";
import { useParams } from "next/navigation";
import { use, useState } from "react";
import { ArrowLeft, SpinnerGap, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

import { ArtifactRecordView } from "@/components/artifacts/artifact-reader";
import { useArtifactLibrary, useDrawUpMinutes } from "@/hooks/use-artifact-library";
import { useRegisterAssistantContext } from "@/hooks/use-assistant-page-context";
import { groupEntriesByMeeting, preferredEntry } from "@/lib/meeting/artifact-library";
import type { ArtifactKind } from "@/lib/meeting/artifact-library";
import { recordsPath } from "@/lib/workspace/workspace-routes";
import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaceStore } from "@/stores/workspace-store";

interface PageProps {
  params: Promise<{ roomId: string }>;
}

export default function RecordDetailPage({ params }: PageProps) {
  const { roomId } = use(params);
  const routeParams = useParams<{ workspaceSlug: string }>();
  const workspaceSlug = routeParams?.workspaceSlug ?? "";
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const viewerId = useAuthStore((state) => state.user?.id ?? null);

  const [kind, setKind] = useState<ArtifactKind | null>(null);

  const library = useArtifactLibrary(activeWorkspaceId);
  const group =
    groupEntriesByMeeting(library.entries).find((candidate) => candidate.roomId === roomId) ?? null;
  // The chosen tab, or the first record that can actually be read. Landing on a withheld
  // transcript would show a lock while the summary beside it was readable all along.
  const entry = group
    ? group.entries.find((candidate) => candidate.kind === kind) ?? preferredEntry(group)
    : null;

  const drawUpMinutes = useDrawUpMinutes(activeWorkspaceId);

  /**
   * Whether the record being read is a summary this viewer could turn into a biên bản.
   *
   * Asked of the WHOLE library, not of this group, for the reason the list page gives: "does this
   * meeting already have minutes?" must be answered from everything loaded, or a meeting whose
   * minutes exist but were filtered out would be offered a second one.
   */
  const canDrawUpMinutes =
    entry?.kind === "summary" &&
    Boolean(entry.body) &&
    entry.hostId === viewerId &&
    !library.entries.some((item) => item.kind === "minutes" && item.roomId === roomId);

  useRegisterAssistantContext(
    group
      ? {
          pageType: "history",
          entityId: group.roomId,
          workspaceId: activeWorkspaceId ?? "",
          snapshot: {
            title: group.roomTitle,
            record: entry?.title ?? "",
            status: entry?.statusLabel ?? "",
          },
        }
      : null,
  );

  if (!activeWorkspaceId) return null;

  return (
    /* h-full + min-h-0, not min-h-full: the page owns the viewport and the record scrolls inside
       it, the same shape the document detail page uses. */
    <div className="mx-auto flex h-full min-h-0 w-full max-w-5xl animate-fade-in flex-col gap-6 px-4 py-4 pb-8 text-ink">
      <Link
        href={recordsPath(workspaceSlug)}
        className="flex w-fit items-center gap-1.5 text-xs text-ink-muted transition hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        <span>Back to Records</span>
      </Link>

      {library.isLoading && !group ? (
        <Loading />
      ) : !group || !entry ? (
        <NotFound workspaceSlug={workspaceSlug} />
      ) : (
        <>
          {/* The MEETING names the page. Which of its records is open is a tab, not a title —
              otherwise the heading would change under the reader every time they switched. */}
          <div className="flex flex-col gap-0.5">
            <h1 className="min-w-0 truncate text-[18px] font-semibold tracking-tight text-ink">
              {group.roomTitle}
            </h1>
            <p className="truncate text-[11px] text-ink-muted">
              {group.roomCode}
              {group.hostName ? ` · ${group.hostName}` : ""}
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border bg-surface-1">
            <ArtifactRecordView
              group={group}
              entry={entry}
              onSelectKind={setKind}
              workspaceSlug={workspaceSlug}
              onDrawUpMinutes={
                canDrawUpMinutes
                  ? () =>
                      drawUpMinutes.mutate(roomId, {
                        onSuccess: (minutes) =>
                          toast.success(`Minutes ${minutes.minutesNo} drawn up.`),
                        onError: () =>
                          toast.error("Could not draw up the minutes for this meeting."),
                      })
                  : undefined
              }
              drawingUpMinutes={drawUpMinutes.isPending}
            />
          </div>
        </>
      )}
    </div>
  );
}

function Loading() {
  return (
    <div className="grid min-h-[420px] flex-1 place-items-center">
      <div className="flex items-center gap-2 text-[11px] text-ink-muted">
        <SpinnerGap size={15} className="animate-spin" />
        Loading this meeting&apos;s records
      </div>
    </div>
  );
}

/**
 * Said plainly, and it is not always "this does not exist".
 *
 * The library holds one page of room history, so a meeting older than that is genuinely not
 * loaded here — which is a different thing from a meeting with no records, and a different thing
 * again from one this viewer may not read. Claiming the first when we only know the third is the
 * defect summary-absence.ts and artifact-denial.ts were both written to stop.
 */
function NotFound({ workspaceSlug }: { workspaceSlug: string }) {
  return (
    <div className="grid min-h-[420px] flex-1 place-items-center px-4">
      <div className="flex max-w-sm flex-col items-center gap-2 text-center">
        <WarningCircle size={22} className="text-ink-subtle" />
        <p className="text-[13px] font-medium text-ink">This meeting is not in the library</p>
        <p className="text-[11px] leading-relaxed text-ink-subtle">
          It may be older than the meetings loaded here, or it may have produced nothing that was
          written down.
        </p>
        <Link
          href={recordsPath(workspaceSlug)}
          className="mt-1 rounded-md border border-border px-3 py-1.5 text-[11px] text-ink-muted transition hover:bg-surface-2 hover:text-ink"
        >
          Back to Records
        </Link>
      </div>
    </div>
  );
}
