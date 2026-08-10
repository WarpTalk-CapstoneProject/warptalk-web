"use client";

import { useMemo } from "react";

import { mergeParticipants } from "@/lib/meeting/merge-participants";
import { roomOccupancy, type RoomOccupancy } from "@/lib/meeting/room-occupancy";
import { useTranslationRoomStore } from "@/stores/translationRoom-store";
import type {
  TranslationRoomDto,
  TranslationRoomParticipantDto,
} from "@/types/translationRoom";

type RoomOccupancyInput = Pick<TranslationRoomDto, "id" | "maxParticipants"> &
  Partial<Pick<TranslationRoomDto, "participantCount">>;

/**
 * WT-274: the single hook every "who is in this room" surface reads.
 *
 * It resolves the roster once — API rows, overlaid with the live TranslationRoomHub presence
 * snapshot when that snapshot belongs to *this* room — and hands it to `roomOccupancy`, which
 * owns the seat rule. Callers get a number and a label; they never see a status string, which
 * is what stopped the three surfaces from drifting apart again.
 *
 * `apiParticipants` is optional because the meetings list has no per-row roster. For those
 * rows the hook falls back to the server's `participantCount` (see BACKEND note in the PR:
 * that aggregate is not seat-based today), except for the one room the viewer is actually in,
 * which the live snapshot can answer exactly.
 */
export function useRoomOccupancy(
  room: RoomOccupancyInput | null | undefined,
  apiParticipants?: TranslationRoomParticipantDto[] | null,
): RoomOccupancy<TranslationRoomParticipantDto> {
  const liveParticipants = useTranslationRoomStore((state) => state.participants);
  const liveRoomState = useTranslationRoomStore(
    (state) => state.translationRoomState,
  );

  // The store holds whichever room the viewer is currently in. A snapshot for another room
  // must never be read as this room's presence.
  const liveForThisRoom =
    room && liveRoomState?.translationRoomId === room.id ? liveParticipants : null;

  return useMemo(() => {
    const roster =
      apiParticipants && liveForThisRoom?.length
        ? mergeParticipants(apiParticipants, liveForThisRoom)
        : apiParticipants
          ? apiParticipants
          : liveForThisRoom?.length
            ? mergeParticipants([], liveForThisRoom)
            : null;

    return roomOccupancy<TranslationRoomParticipantDto>({
      capacity: room?.maxParticipants,
      participants: roster,
      fallbackCount: room?.participantCount,
    });
  }, [
    apiParticipants,
    liveForThisRoom,
    room?.maxParticipants,
    room?.participantCount,
  ]);
}
