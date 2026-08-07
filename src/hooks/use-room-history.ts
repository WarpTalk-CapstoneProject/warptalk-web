import { useQuery } from "@tanstack/react-query";
import { roomHistoryService, ROOM_HISTORY_PAGE_SIZE } from "@/services/roomHistory.service";
import { shouldPollRoomHistory } from "@/lib/room-history-mapping";
import type { RoomArtifactStatus, RoomHistoryLoadState, RoomHistoryResponse } from "@/types/roomHistory";

/**
 * How often to re-ask while something is still being produced. The summary artifact lands
 * roughly 40s after a meeting ends, so a 10s poll surfaces it without a manual reload while
 * staying cheap.
 */
const POLL_INTERVAL_MS = 10_000;

export function useRoomHistory(workspaceId: string | null, options?: {
  state?: Exclude<RoomHistoryLoadState, "loading">;
  artifactStatus?: RoomArtifactStatus;
  page?: number;
  pageSize?: number;
  status?: "ended" | "cancelled";
  search?: string;
}) {
  const page = options?.page ?? 1;
  const pageSize = options?.pageSize ?? ROOM_HISTORY_PAGE_SIZE;
  const search = options?.search?.trim() || undefined;

  return useQuery({
    queryKey: [
      "room-history",
      workspaceId,
      options?.state ?? "ready",
      options?.artifactStatus ?? "all",
      options?.status ?? "all",
      search ?? "",
      page,
      pageSize,
    ],
    queryFn: () =>
      roomHistoryService.listEndedRooms({
        workspaceId: workspaceId!,
        state: options?.state,
        artifactStatus: options?.artifactStatus,
        status: options?.status,
        search,
        page,
        pageSize,
      }),
    enabled: Boolean(workspaceId),
    // Paging should not blank the table out on every click.
    placeholderData: (previous) => previous,
    /**
     * There was no `refetchInterval` here at all, and nothing else refetched this query —
     * so a summary generated after the page loaded was invisible until a manual reload, and
     * the Transcripts → Summary panel eventually claimed the meeting "ended without a
     * summary artifact" while the artifact sat on the server.
     *
     * Polling is derived from what the data actually says: it runs while an artifact is
     * `processing`, or while a just-ended meeting is still missing its transcript/summary,
     * and it RETURNS FALSE — stopping the interval — as soon as everything has resolved or
     * the meeting is old enough that nothing more is coming. An idle history tab does not
     * poll.
     */
    refetchInterval: (query) => {
      const data = query.state.data as RoomHistoryResponse | undefined;
      if (!data) return false;
      return shouldPollRoomHistory(data.rooms) ? POLL_INTERVAL_MS : false;
    },
    refetchIntervalInBackground: false,
  });
}
