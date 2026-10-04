import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { roomHistoryService, ROOM_HISTORY_PAGE_SIZE } from "@/services/room-history.service";
import { shouldPollRoomHistory } from "@/lib/meeting/room-history-mapping";
import {
  endedRecordRefetchInterval,
  finalizingDeadlineDelayMs,
  ROOM_HISTORY_POLL_MS,
} from "@/lib/meeting/record-finalizing-poll";
import type { RoomArtifactStatus, RoomHistoryLoadState } from "@/types/roomHistory";

/**
 * How often to re-ask while something is still being produced. The summary artifact lands
 * roughly 40s after a meeting ends, so a 10s poll surfaces it without a manual reload while
 * staying cheap. Stops as soon as nothing is generating — see shouldPollRoomHistory.
 */
const POLL_INTERVAL_MS = ROOM_HISTORY_POLL_MS;

type RoomHistoryOptions = {
  state?: Exclude<RoomHistoryLoadState, "loading">;
  artifactStatus?: RoomArtifactStatus;
  /** 1-based. */
  page?: number;
  pageSize?: number;
  status?: "ended" | "cancelled";
  search?: string;
  /** "mine": the caller's own meetings even for an Owner/Admin (the Artifacts library). */
  scope?: "mine";
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
    queryKey: ["room-history", workspaceId, options?.state ?? "ready", options?.artifactStatus ?? "all", options?.status ?? "all", options?.search?.trim() ?? "", options?.page ?? 1, options?.pageSize ?? ROOM_HISTORY_PAGE_SIZE, options?.scope ?? "workspace"] as const,
    queryFn: () =>
      roomHistoryService.listEndedRooms({
        workspaceId: workspaceId!,
        state: options?.state,
        artifactStatus: options?.artifactStatus,
        page: options?.page,
        pageSize: options?.pageSize,
        status: options?.status,
        search: options?.search,
        scope: options?.scope,
      }),
    // WT-509: the poll belongs to the QUERY, not to one of its two callers.
    //
    // A meeting's summary and recording are produced after it ends, so the first load of either
    // surface routinely shows work in progress. `useRoomHistory` carried this and
    // `useEndedRoomRecord` did not — so the archive list updated itself while the meeting-record
    // page, which is the page somebody actually opens after their meeting, sat on "Generating
    // summary…" until a manual reload. The room page even documents the behaviour it was not
    // getting: "useEndedRoomRecord already polls while anything is generating, so this clears
    // itself."
    //
    // Both hooks build on this object, so neither can be the one that forgets.
    //
    // `query.state.data` is the RAW list, before either hook's `select` narrows it, which is why
    // the same predicate serves both. It stops on its own once nothing is generating, so an idle
    // tab does not sit on an unbounded interval.
    refetchInterval: (query: {
      state: { data?: Awaited<ReturnType<typeof roomHistoryService.listEndedRooms>> };
    }) => (shouldPollRoomHistory(query.state.data?.rooms ?? []) ? POLL_INTERVAL_MS : false),
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
 *
 * `room` is the room's OWN status and end time (from the room lookup). B4: while the room is
 * finalizing (WT-930), this view of the query polls every few seconds even when the room is not
 * in the list — the shared list rule only sees rooms that are in it, so a cached or first answer
 * without the just-ended room used to stop all polling and leave the finalizing screen up forever.
 * The poll is the observer's own, so it stops when the page unmounts and once the record resolves.
 */
export function useEndedRoomRecord(
  workspaceId: string | null,
  roomId: string | null | undefined,
  room?: { status?: string | null; endedAt?: string | null } | null,
) {
  const status = room?.status ?? null;
  const endedAt = room?.endedAt ?? null;
  return useQuery({
    ...roomHistoryQuery(workspaceId),
    enabled: Boolean(workspaceId && roomId),
    select: (data) => data.rooms.find((item) => item.id === roomId) ?? null,
    refetchInterval: (query: {
      state: { data?: Awaited<ReturnType<typeof roomHistoryService.listEndedRooms>> };
    }) => endedRecordRefetchInterval({ rooms: query.state.data?.rooms, roomId, status, endedAt }),
  });
}

/**
 * B4: re-renders the caller once the WT-930 finalizing window closes.
 *
 * isRecordFinalizing's five-minute cap is evaluated on render, and a page with nothing
 * re-rendering it never re-evaluated it. One timer to the end of the window makes the screen
 * resolve on its own. Re-armed after it fires (a client clock behind the server's can need a
 * second leg), cleared on unmount or when the room's status or end time changes.
 */
export function useFinalizingDeadline(room?: { status?: string | null; endedAt?: string | null } | null) {
  const status = room?.status ?? null;
  const endedAt = room?.endedAt ?? null;
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const delay = finalizingDeadlineDelayMs({ status, endedAt });
    if (delay === null) return;
    const timer = setTimeout(() => setTick((value) => value + 1), delay);
    return () => clearTimeout(timer);
  }, [status, endedAt, tick]);

  return tick;
}
