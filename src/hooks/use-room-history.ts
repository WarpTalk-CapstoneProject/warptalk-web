import { useQuery } from "@tanstack/react-query";
import { roomHistoryService } from "@/services/roomHistory.service";
import type { RoomArtifactStatus, RoomHistoryLoadState } from "@/types/roomHistory";

type RoomHistoryOptions = {
  state?: Exclude<RoomHistoryLoadState, "loading">;
  artifactStatus?: RoomArtifactStatus;
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
    // be served from another's cache entry.
    queryKey: ["room-history", workspaceId, options?.state ?? "ready", options?.artifactStatus ?? "all"] as const,
    queryFn: () =>
      roomHistoryService.listEndedRooms({
        workspaceId: workspaceId!,
        state: options?.state,
        artifactStatus: options?.artifactStatus,
      }),
  };
}

export function useRoomHistory(workspaceId: string | null, options?: RoomHistoryOptions) {
  return useQuery({
    ...roomHistoryQuery(workspaceId, options),
    enabled: Boolean(workspaceId),
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
