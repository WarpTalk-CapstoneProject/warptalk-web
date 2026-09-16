import type { MeetingTimeState } from "@/types/myMeetings";

/**
 * The one state a calendar row SHOWS for a meeting: its time state, unless it was cancelled.
 *
 * Cancellation outranks the clock — the order the schedule page's `rowToneClass`,
 * `monthChipToneClass` and `stateBadgeClass` each used to spell out for themselves, and now take
 * from here. A cancelled meeting whose slot has passed resolves to `missed`, and one whose slot is
 * now resolves to `live`; neither is true of a meeting that was called off, and a row showing a
 * pulsing dot beside a greyed-out title is two signals giving two answers to "what happened to
 * this meeting?".
 *
 * Pure, so the Agenda row, the Month chip, the Week card, the tone classes and the state icon they
 * share all ask it instead of each re-spelling the `status === "cancelled"` branch — which is how
 * the badge once came to disagree with the card it sat on.
 */
export type MeetingDisplayState = MeetingTimeState | "cancelled";

type StatefulMeeting = { status: string; timeState: MeetingTimeState };

export function meetingDisplayState(meeting: StatefulMeeting): MeetingDisplayState {
  return meeting.status === "cancelled" ? "cancelled" : meeting.timeState;
}

const LABELS: Record<MeetingDisplayState, string> = {
  live: "Live",
  upcoming: "Upcoming",
  joined: "Joined",
  // "Missed", not "Not attended": the word people use, and it says nothing about fault — a
  // meeting that never happened at all is missed too.
  missed: "Missed",
  cancelled: "Cancelled",
};

/** The spoken/printed name of that state — the label half of the same decision. */
export function meetingStateLabel(meeting: StatefulMeeting): string {
  return LABELS[meetingDisplayState(meeting)];
}
