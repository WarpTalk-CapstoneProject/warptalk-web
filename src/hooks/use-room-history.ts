import { useQuery } from "@tanstack/react-query";
import { roomHistoryService } from "@/services/roomHistory.service";
import type { RoomArtifactStatus, RoomHistoryLoadState } from "@/types/roomHistory";

export function useRoomHistory(options?: {
  state?: Exclude<RoomHistoryLoadState, "loading">;
  artifactStatus?: RoomArtifactStatus;
}) {
  return useQuery({
    queryKey: ["room-history", options?.state ?? "ready", options?.artifactStatus ?? "all"],
    queryFn: () =>
      roomHistoryService.listEndedRooms({
        state: options?.state,
        artifactStatus: options?.artifactStatus,
      }),
  });
}
