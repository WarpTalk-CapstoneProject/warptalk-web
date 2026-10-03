import type { TranslationRoomStatus } from "@/types/translationRoom";

const TERMINAL_ROOM_STATUSES: ReadonlySet<TranslationRoomStatus> = new Set([
  "ended",
  "cancelled",
  "expired",
  "failed",
  "timeout",
]);

/**
 * Created, and nobody has opened the door yet.
 *
 * `open` is DELIBERATELY ABSENT, and both sets on this page are worth stating for it, because
 * `open` (WT-612 / WT-621) is the first status that belongs to neither. It is not terminal — the
 * meeting has not happened, let alone finished — and it is not "not started": the clock unlocked
 * the room at `scheduledAt`, so there is nothing left for anyone to start. It therefore falls
 * through both branches of `resolveRoomEntryIntent` to `join`, which is the whole point: the
 * viewer goes through device setup into the call, exactly as they would for `in_progress`, and is
 * never offered a "Start meeting" button for a door that is already open.
 */
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
 * WT-715: a room's setup (meeting languages, room notes, the title and its edit dialog, the repeat
 * rule) may only change before the meeting starts. The backend's
 * `PUT /translation-rooms/{id}/settings` refuses anything else with ErrorSettingsLocked, so offering
 * those controls on a live or finished room only produced a save the server turned down.
 *
 * `open` (WT-612) is included: the backend keeps the settings window open until the meeting
 * actually starts, and an OPEN room has no session, transcript or artifacts to contradict.
 *
 * A positive allowlist on purpose: a status this build does not know is not editable.
 */
const SETUP_EDITABLE_ROOM_STATUSES: ReadonlySet<string> = new Set([
  "scheduled",
  "waiting",
  "open",
]);

/**
 * WT-715: the statuses the backend's End action accepts (EndableStatuses: IN_PROGRESS, PAUSED,
 * WAITING, OPEN). An allowlist, not "not over yet": a SCHEDULED room cannot be ended.
 */
const ENDABLE_ROOM_STATUSES: ReadonlySet<string> = new Set([
  "waiting",
  "open",
  "in_progress",
  "paused",
]);

/** The least a room has to carry for the host rules below. */
export type RoomHostFacts = {
  status: TranslationRoomStatus | string;
  hostId?: string | null;
  /** The server's own answer for this viewer (the effective host, after any transfer). */
  isHost?: boolean | null;
};

type RoomViewer = { id?: string | null } | null | undefined;

function normalizedRoomStatus(status: string | null | undefined): string {
  return (status ?? "").toLowerCase();
}

/**
 * WT-715: one host rule for the room detail page.
 *
 * The page had two. `isHost` accepted the server's `room.isHost`, while `canEditRoom` compared
 * only `room.hostId` with the viewer, so someone the server marks as host (the room was handed to
 * them) got the notes editor but no edit pencil and no "Stop repeating". Either signal makes the
 * viewer the host here, which is what the page's broader rule already said.
 */
export function isRoomHost(room: RoomHostFacts, viewer: RoomViewer): boolean {
  if (room.isHost) return true;
  const viewerId = viewer?.id;
  return Boolean(viewerId) && room.hostId === viewerId;
}

/** WT-715: the host, on a room that has not started: the only case the settings endpoint accepts. */
export function canEditRoomSetup(room: RoomHostFacts, viewer: RoomViewer): boolean {
  return (
    isRoomHost(room, viewer) &&
    SETUP_EDITABLE_ROOM_STATUSES.has(normalizedRoomStatus(room.status))
  );
}

/** WT-715: the host, on a room in a status the backend's End action accepts. */
export function canEndRoom(room: RoomHostFacts, viewer: RoomViewer): boolean {
  return (
    isRoomHost(room, viewer) &&
    ENDABLE_ROOM_STATUSES.has(normalizedRoomStatus(room.status))
  );
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
  | "join"
  /**
   * WT-904: an external meeting (Google Meet) opened by someone who is not its host. The call is
   * on Meet; WarpTalk's side of it has two seats, the host and the Meet stand-in, so sending this
   * person through device setup ended in "Room full" or a wizard for audio cables they do not
   * need. The button opens the Meet link instead.
   */
  | "external_meeting";

export interface RoomEntryIntent {
  mode: RoomEntryMode;
  /** Button label. */
  label: string;
  /** Supporting line under the button, or null when the label says enough. */
  helpText: string | null;
  /** False only for a room nobody can enter, which is what disables the control. */
  isActionable: boolean;
  /** `external_meeting` only: the Meet link the button opens. */
  href?: string;
}

/** Only an https link is ever opened — the value comes from the database, not from a constant. */
function safeExternalMeetingUrl(value?: string | null): string | null {
  const url = value?.trim();
  return url && /^https:\/\//i.test(url) ? url : null;
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
  /** WT-904: the room is an EXTERNAL_BRIDGE (isExternalBridge on translationRoomType). */
  isExternalBridge?: boolean;
  /** WT-904: the room's `externalMeetingUrl` — where an external meeting actually happens. */
  externalMeetingUrl?: string | null;
}): RoomEntryIntent {
  if (!canJoinTranslationRoom(input.status)) {
    return {
      mode: "unavailable",
      label: input.statusLabel,
      helpText: null,
      isActionable: false,
    };
  }

  // `open` alongside `in_progress`: the person is in this room in this tab, and that is true
  // whether or not anyone has taken it to IN_PROGRESS yet. Without it they would be offered
  // device setup for a call they are already sitting in.
  if (input.isActiveInMeeting && (input.status === "in_progress" || input.status === "open")) {
    return {
      mode: "join",
      label: "Return to meeting",
      helpText: "You are currently in this meeting. Click to return.",
      isActionable: true,
    };
  }

  // WT-904: before the lobby. An external meeting does not wait for anyone on WarpTalk — the call
  // is on Meet whether or not the host has opened WarpTalk's side of it.
  const meetUrl = input.isExternalBridge && !input.isHost
    ? safeExternalMeetingUrl(input.externalMeetingUrl)
    : null;
  if (meetUrl) {
    return {
      mode: "external_meeting",
      label: "Join on Google Meet",
      helpText: "This meeting takes place on Google Meet. WarpTalk translates it from the host's side.",
      isActionable: true,
      href: meetUrl,
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
