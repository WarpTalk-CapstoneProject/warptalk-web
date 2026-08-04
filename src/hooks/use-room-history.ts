import { useQuery } from "@tanstack/react-query";
import { roomHistoryService } from "@/services/roomHistory.service";
import type { RoomArtifactStatus, RoomHistoryLoadState } from "@/types/roomHistory";

export function useRoomHistory(workspaceId: string | null, options?: {
  state?: Exclude<RoomHistoryLoadState, "loading">;
  artifactStatus?: RoomArtifactStatus;
}) {
  return useQuery({
    queryKey: ["room-history", workspaceId, options?.state ?? "ready", options?.artifactStatus ?? "all"],
    queryFn: () =>
      roomHistoryService.listEndedRooms({
        workspaceId: workspaceId!,
        state: options?.state,
        artifactStatus: options?.artifactStatus,
      }),
    enabled: Boolean(workspaceId),
  });
}
