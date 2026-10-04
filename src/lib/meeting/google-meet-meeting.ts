/**
 * Whether a meeting happens on Google Meet, as the schedule decides it.
 *
 * Both fields, not the provider alone: the server refuses a provider without a link, so a row that
 * has one without the other is from before that rule, and a mark that opens nothing is worse than
 * no mark. One rule shared by the Agenda row, the Week card and the Month chip, so the three views
 * cannot disagree about the same meeting.
 *
 * Kept apart from the mark itself (components/meeting/google-meet-mark) so it can be tested
 * without a component in the way.
 */
export function isGoogleMeetMeeting(meeting: {
  externalProvider?: string | null;
  externalMeetingUrl?: string | null;
}): boolean {
  return meeting.externalProvider?.toUpperCase() === "GOOGLE_MEET" && Boolean(meeting.externalMeetingUrl);
}
