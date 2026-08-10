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
 *
 * WT-341: and except everyone else too, when the meeting does not require the host's approval to
 * join. There is then nothing for the lobby to hold anyone for — no approval is pending, and the
 * server now lets any invited participant open the room. Sending them to a lobby that is waiting
 * on a decision nobody has to make is how a busy host used to strand a whole meeting.
 *
 * `requiresApproval` is deliberately treated as TRUE when it is undefined. An older room, or a
 * payload that predates the field, must keep the host-opens-it behaviour rather than silently
 * become startable by anyone because a property was missing.
 */
export function shouldEnterWaitingRoom(
  status: TranslationRoomStatus,
  options?: { isHost?: boolean; requiresApproval?: boolean },
): boolean {
  if (options?.isHost) return false;
  if (options?.requiresApproval === false) return false;
  return NOT_STARTED_ROOM_STATUSES.has(status);
}

/** What the room's primary call-to-action should do for this viewer. */
export type RoomEntryMode =
  /** Terminal status — nothing to enter. */
  | "unavailable"
  /**
   * A room that has not started, and this viewer may open it — the host always, and (WT-341)
   * anyone else when the meeting does not require the host's approval. They open it; they do not
   * queue for it.
   *
   * Still spelled `host_start` rather than renamed: the string is asserted by name in
   * scripts/check-room-surface-contract.mjs and in the unit tests, and a rename would be a
   * cosmetic diff across three files that changes no behaviour.
   */
  | "host_start"
  /** Not started, approval-gated, and this viewer is not the host: the lobby is where they wait. */
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
  /** Whether the current user is active in this meeting session in the current tab. */
  isActiveInMeeting?: boolean;
  /**
   * WT-341: the room's own `settings.requiresApproval`. Undefined means "assume it does" — see
   * shouldEnterWaitingRoom. When false, a non-host gets the same "Start meeting" action the host
   * gets, because the server now accepts it from them.
   */
  requiresApproval?: boolean;
}): RoomEntryIntent {
  if (!canJoinTranslationRoom(input.status)) {
    return {
      mode: "unavailable",
      label: input.statusLabel,
      helpText: null,
      isActionable: false,
    };
  }

  if (input.isActiveInMeeting && input.status === "in_progress") {
    return {
      mode: "join",
      label: "Return to meeting",
      helpText: "You are currently in this meeting. Click to return.",
      isActionable: true,
    };
  }

  if (
    shouldEnterWaitingRoom(input.status, {
      isHost: input.isHost,
      requiresApproval: input.requiresApproval,
    })
  ) {
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
      // No help text for the host. "You are the host — starting opens the room and admits
      // everyone in the lobby" explained a button labelled "Start meeting" to the one person who
      // cannot be confused about what it does. The lobby count sits beside it and says the rest.
      //
      // A non-host DOES get a line, because for them the button is new and its consequence is not
      // private: clicking it takes the meeting live for everybody and notifies the people invited
      // to it, including the host who is not here.
      helpText: input.isHost
        ? null
        : "The host hasn't started this meeting. Opening it will let everyone invited join.",
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
