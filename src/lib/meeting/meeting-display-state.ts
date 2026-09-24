import type { MeetingTimeState } from "@/types/myMeetings";

/**
 * The one state a calendar row SHOWS for a meeting: its time state, unless the meeting never ran.
 *
 * Cancellation outranks the clock — the order the schedule page's `rowToneClass`,
 * `monthChipToneClass` and `stateBadgeClass` each used to spell out for themselves, and now take
 * from here. A cancelled meeting whose slot has passed resolves to `missed`, and one whose slot is
 * now resolves to `live`; neither is true of a meeting that was called off, and a row showing a
 * pulsing dot beside a greyed-out title is two signals giving two answers to "what happened to
 * this meeting?".
 *
 * WT-714 adds `expired` on the same argument. `MeetingTimeState` puts an expired meeting in
 * `missed`, which is where it belongs on the timeline, but "Missed" tells the viewer a meeting
 * happened without them — and an expired meeting is one NOBODY walked into. Same shape of lie
 * cancellation used to tell, so it gets the same shape of fix: a state of its own, decided here,
 * once, rather than a `status === "expired"` branch re-spelled by each surface.
 *
 * Pure, so the Agenda row, the Month chip, the Week card, the tone classes and the state icon they
 * share all ask it instead of each re-spelling the `status === "cancelled"` branch — which is how
 * the badge once came to disagree with the card it sat on.
 */
export type MeetingDisplayState = MeetingTimeState | "cancelled" | "expired";

type StatefulMeeting = { status: string; timeState: MeetingTimeState };

export function meetingDisplayState(meeting: StatefulMeeting): MeetingDisplayState {
  // Cancelled first, and the order is not arbitrary even though no room is ever both: a call-off
  // is a decision somebody made, and it outranks the clock's account of what then failed to
  // happen. Everything else keeps the time state untouched.
  if (meeting.status === "cancelled") return "cancelled";
  if (meeting.status === "expired") return "expired";
  return meeting.timeState;
}

const LABELS: Record<MeetingDisplayState, string> = {
  live: "Live",
  upcoming: "Upcoming",
  joined: "Joined",
  // "Missed", not "Not attended": the word people use, and it says nothing about fault — a
  // meeting that never happened at all is missed too.
  missed: "Missed",
  cancelled: "Cancelled",
  // The one word that separates it from Missed: Missed is "it ran without you", Expired is
  // "nobody came, so it never ran". Neither blames the viewer; only one of them implies a
  // meeting they could have been at.
  expired: "Expired",
};

/**
 * The spoken/printed name of that state — the label half of the same decision.
 *
 * `t` is optional so every caller — and the `node:test` files pinning the English strings —
 * keeps working unchanged. A translated component passes its own `useTranslations("schedules")`
 * lookup (e.g. `(state) => t(`states.${state}`)`) instead of hard-coding English here.
 */
export function meetingStateLabel(
  meeting: StatefulMeeting,
  t?: (state: MeetingDisplayState) => string,
): string {
  const state = meetingDisplayState(meeting);
  return t ? t(state) : LABELS[state];
}
