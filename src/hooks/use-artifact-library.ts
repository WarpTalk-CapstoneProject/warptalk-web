"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { meetingMinutesService } from "@/services/meeting-minutes.service";
import { useRoomHistory } from "@/hooks/use-room-history";
import { buildArtifactLibrary } from "@/lib/meeting/artifact-library";
import type { LibraryEntry } from "@/lib/meeting/artifact-library";

/**
 * The workspace's written record, from the two places it is kept.
 *
 * TWO SOURCES, ONE LIST
 *   Transcripts and AI summaries are artifacts of a meeting and arrive with the room history.
 *   A biên bản is not an artifact — it has a number, a lifecycle and a signature — so it has its
 *   own table, its own endpoint and its own page of results. Merging them here rather than in the
 *   page keeps the page from having to know that, and keeps "what is in the library" as one
 *   testable function.
 *
 * WHY BOTH TAKE THE SAME SEARCH TERM
 *   Each server narrows its own list to the meetings whose title, code or number match, and the
 *   browser then searches the BODIES of what came back. Sending the term to only one of them
 *   would make a search return every transcript in the workspace and only the matching minutes.
 */

/** Deliberately below the room history's 100: every minutes row carries its whole document. */
export const MINUTES_PAGE_SIZE = 50;

export function useArtifactLibrary(workspaceId: string | null, options?: { search?: string }) {
  const search = options?.search?.trim() || undefined;

  const history = useRoomHistory(workspaceId, { search });

  const minutes = useQuery({
    // Workspace-first, matching the room-history key: the paging and filter terms narrow ONE
    // workspace's cache entry and can never cross into another's.
    queryKey: ["workspace-minutes", workspaceId, search ?? "", MINUTES_PAGE_SIZE] as const,
    queryFn: async () => {
      const response = await meetingMinutesService.listForWorkspace(workspaceId!, {
        search,
        pageSize: MINUTES_PAGE_SIZE,
      });
      return response.data;
    },
    enabled: Boolean(workspaceId),
  });

  const entries: LibraryEntry[] = useMemo(
    () =>
      buildArtifactLibrary({
        rooms: history.data?.rooms ?? [],
        minutes: minutes.data?.items ?? [],
      }),
    [history.data?.rooms, minutes.data?.items],
  );

  return {
    entries,
    /**
     * Loading only while NOTHING can be shown yet.
     *
     * The two queries finish at different times, and treating either one's pending state as the
     * page's would blank a list that already has half its rows — the transcripts would appear,
     * then vanish behind a spinner when the minutes query refetched.
     */
    isLoading: history.isLoading && minutes.isLoading,
    /**
     * An error only when BOTH failed. One source being down is a partial library, not a broken
     * page, and hiding the half that loaded helps nobody — `failedSource` says which half is
     * missing so the page can admit it.
     */
    isError: history.isError && minutes.isError,
    failedSource: history.isError ? ("meetings" as const) : minutes.isError ? ("minutes" as const) : null,
    refetch: () => {
      void history.refetch();
      void minutes.refetch();
    },
  };
}
