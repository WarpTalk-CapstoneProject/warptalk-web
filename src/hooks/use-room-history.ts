import { useQuery } from "@tanstack/react-query";
import { roomHistoryService, ROOM_HISTORY_PAGE_SIZE } from "@/services/room-history.service";
import { shouldPollRoomHistory } from "@/lib/meeting/room-history-mapping";
import type { RoomArtifactStatus, RoomHistoryLoadState } from "@/types/roomHistory";

/**
 * How often to re-ask while something is still being produced. The summary artifact lands
 * roughly 40s after a meeting ends, so a 10s poll surfaces it without a manual reload while
 * staying cheap. Stops as soon as nothing is generating — see shouldPollRoomHistory.
 */
const POLL_INTERVAL_MS = 10_000;

type RoomHistoryOptions = {
  state?: Exclude<RoomHistoryLoadState, "loading">;
  artifactStatus?: RoomArtifactStatus;
  /** 1-based. */
  page?: number;
  pageSize?: number;
  status?: "ended" | "cancelled";
  search?: string;
};

/**
 * The query both the workspace list and a single room's record read from.
 *
 * Shared deliberately: the API has no per-room history endpoint, only the workspace list, so
 * a room page that fetched its own would pull the same payload under a second cache key and
 * refetch it independently. One key means one request and one truth.
 */
function roomHistoryQuery(workspaceId: string | null, options?: RoomHistoryOptions) {
  return {
    // Kept on one line and workspace-first on purpose: check-transcript-workspace-isolation
    // reads this shape, and the shape is the guarantee — one workspace's history can never
    // be served from another's cache entry. The paging and filter terms are appended AFTER
    // the workspace for the same reason: they narrow a workspace's cache entry, never cross it.
    queryKey: ["room-history", workspaceId, options?.state ?? "ready", options?.artifactStatus ?? "all", options?.status ?? "all", options?.search?.trim() ?? "", options?.page ?? 1, options?.pageSize ?? ROOM_HISTORY_PAGE_SIZE] as const,
    queryFn: () =>
      roomHistoryService.listEndedRooms({
        workspaceId: workspaceId!,
        state: options?.state,
        artifactStatus: options?.artifactStatus,
        page: options?.page,
        pageSize: options?.pageSize,
        status: options?.status,
        search: options?.search,
      }),
  };
}

export function useRoomHistory(workspaceId: string | null, options?: RoomHistoryOptions) {
  return useQuery({
    ...roomHistoryQuery(workspaceId, options),
    enabled: Boolean(workspaceId),
    // A meeting's summary and recording are produced after it ends, so the first load of the
    // archive routinely shows work in progress. Without this the page sat on "generating"
    // until somebody reloaded, which reads as broken rather than as pending.
    refetchInterval: (query) =>
      shouldPollRoomHistory(query.state.data?.rooms ?? []) ? POLL_INTERVAL_MS : false,
  });
}

/**
 * One meeting's ended record — its AI summary and its retained files.
 *
 * Returns null rather than undefined once the list has loaded and the room is not in it,
 * which is the ordinary case for a meeting that has not ended yet. The caller can then tell
 * "still loading" from "there is nothing here".
 */
export function useEndedRoomRecord(
  workspaceId: string | null,
  roomId: string | null | undefined,
) {
  return useQuery({
    ...roomHistoryQuery(workspaceId),
    enabled: Boolean(workspaceId && roomId),
    select: (data) => data.rooms.find((room) => room.id === roomId) ?? null,
  });
}
