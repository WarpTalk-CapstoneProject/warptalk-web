import type { TranslationRoomStatus } from "@/types/translationRoom";

const TERMINAL_ROOM_STATUSES: ReadonlySet<TranslationRoomStatus> = new Set([
  "ended",
  "cancelled",
  "expired",
  "failed",
  "timeout",
]);

const NOT_STARTED_ROOM_STATUSES: ReadonlySet<TranslationRoomStatus> = new Set([
  "scheduled",
  "waiting",
]);

export function canJoinTranslationRoom(
  status: TranslationRoomStatus,
): boolean {
  return !TERMINAL_ROOM_STATUSES.has(status);
}

/**
 * Whether entering this room means entering the lobby rather than the live call (WT-232).
 *
 * A room only carries live audio once the host starts it. Before that the room detail page
 * still offered "Join meeting", which walked the user through device setup and dropped them
 * into an empty session with no indication of what they were waiting for. These two statuses
 * mean "created, not started" — everyone who enters lands in the waiting room instead.
 *
 * WT-273: everyone *except the host*. The host is the person the lobby is waiting for, so
 * telling them "you'll wait in the lobby until the host opens this meeting" is telling them to
 * wait for themselves. Callers that know the viewer's host identity must pass it; omitting it
 * keeps the pre-WT-273 behaviour for viewers whose identity genuinely is not resolved yet.
 */
export function shouldEnterWaitingRoom(
  status: TranslationRoomStatus,
  options?: { isHost?: boolean },
): boolean {
  if (options?.isHost) return false;
  return NOT_STARTED_ROOM_STATUSES.has(status);
}

/** What the room's primary call-to-action should do for this viewer. */
export type RoomEntryMode =
  /** Terminal status — nothing to enter. */
  | "unavailable"
  /** Host of a room that has not started: they open it, they do not queue for it. */
  | "host_start"
  /** Not started, and this viewer is not the host: the lobby is where they wait. */
  | "lobby"
  /** Live: straight through device setup into the call. */
  | "join";

export interface RoomEntryIntent {
  mode: RoomEntryMode;
  /** Button label. */
  label: string;
  /** Supporting line under the button, or null when the label says enough. */
  helpText: string | null;
  /** False only for a room nobody can enter, which is what disables the control. */
  isActionable: boolean;
}

/**
 * WT-273 / WT-197: one decision about the room's primary action, so the promoted header CTA
 * and the "Meeting access" panel can never disagree about what this viewer may do.
 */
export function resolveRoomEntryIntent(input: {
  status: TranslationRoomStatus;
  isHost: boolean;
  statusLabel: string;
  /** Formatted start time, when the room is scheduled. Used only for the lobby copy. */
  scheduledAtLabel?: string | null;
}): RoomEntryIntent {
  if (!canJoinTranslationRoom(input.status)) {
    return {
      mode: "unavailable",
      label: input.statusLabel,
      helpText: null,
      isActionable: false,
    };
  }

  if (shouldEnterWaitingRoom(input.status, { isHost: input.isHost })) {
    return {
      mode: "lobby",
      label: "Enter waiting room",
      helpText: input.scheduledAtLabel
        ? `This meeting starts ${input.scheduledAtLabel}. You'll wait in the lobby until the host opens it.`
        : "You'll wait in the lobby until the host opens this meeting.",
      isActionable: true,
    };
  }

  if (NOT_STARTED_ROOM_STATUSES.has(input.status)) {
    return {
      mode: "host_start",
      label: "Start meeting",
      helpText:
        "You are the host — starting opens the room and admits everyone in the lobby.",
      isActionable: true,
    };
  }

  return {
    mode: "join",
    label: "Join meeting",
    helpText: null,
    isActionable: true,
  };
}
