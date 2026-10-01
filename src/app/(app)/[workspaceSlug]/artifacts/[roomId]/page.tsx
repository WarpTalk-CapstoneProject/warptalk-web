"use client";

/**
 * One meeting's records, at their own address.
 *
 * Synchronized with Room ID layout:
 * - Room info header (horizontal meta bar, host chip, date, duration, route)
 * - Focused content views:
 *   - Transcript: timeline with avatars, timestamps, and clean/verbatim filter
 *   - Summary: structured prose document without video player mockup
 *   - Minutes: official administrative minutes and signatory blocks
 * - Query param synchronization (?kind=transcript|summary|minutes)
 */

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { use, useState } from "react";
import { SpinnerGap, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { toast } from "sonner";

import { ArtifactRecordView } from "@/components/artifacts/artifact-reader";
import { useArtifactLibrary, useDrawUpMinutes } from "@/hooks/use-artifact-library";
import { useRegisterAssistantContext } from "@/hooks/use-assistant-page-context";
import { groupEntriesByMeeting, parseKindParam, preferredEntry } from "@/lib/meeting/artifact-library";
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
  const searchParams = useSearchParams();
  const router = useRouter();

  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const viewerId = useAuthStore((state) => state.user?.id ?? null);

  const initialKind = parseKindParam(searchParams.get("kind"));
  const [kind, setKind] = useState<ArtifactKind | null>(initialKind);
  // Arrived with a kind already chosen on the list: no second tab bar. Deep links without one keep it.
  const showKindSwitcher = initialKind === null;

  const library = useArtifactLibrary(activeWorkspaceId, { viewerId });
  const group =
    groupEntriesByMeeting(library.entries).find((candidate) => candidate.roomId === roomId) ?? null;

  const entry = group
    ? group.entries.find((candidate) => candidate.kind === kind) ?? preferredEntry(group)
    : null;

  const drawUpMinutes = useDrawUpMinutes(activeWorkspaceId);

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

  function handleSelectKind(newKind: ArtifactKind) {
    setKind(newKind);
    const newParams = new URLSearchParams(searchParams.toString());
    newParams.set("kind", newKind);
    router.replace(`?${newParams.toString()}`, { scroll: false });
  }

  if (!activeWorkspaceId) return null;

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-5xl animate-fade-in flex-col px-4 py-4 pb-6 text-ink">
      {library.isLoading && !group ? (
        <Loading />
      ) : !group || !entry ? (
        <NotFound workspaceSlug={workspaceSlug} />
      ) : (
        <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-surface-1 shadow-xs">
          <ArtifactRecordView
            group={group}
            entry={entry}
            onSelectKind={handleSelectKind}
            workspaceSlug={workspaceSlug}
            showKindSwitcher={showKindSwitcher}
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
