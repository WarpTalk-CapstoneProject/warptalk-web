/**
 * How the viewer stands to a meeting on the schedule: they host it, they were invited to it, or
 * they are in it without either.
 *
 * GMCAL1001. The schedule used to know two answers, and "not the host" was spelled "Invited". That
 * stopped being true once a Google Meet call joined through the desktop bridge became a WarpTalk
 * room: two people on the same Meet land in the same room, the second one has a participant row
 * and no invitation, and the calendar told them they had been invited by someone who never did.
 *
 * So "invited" now needs an invitation. `viewerInvitationStatus` is the viewer's own invitation as
 * the server stored it (PENDING / ACCEPTED / DECLINED — any of them is still an invitation); absent,
 * null or blank means there is none, and a non-host with none is a participant.
 *
 * One rule shared by the Agenda row, the Week card and the Month chip, so the three views cannot
 * disagree about the same meeting. Kept free of React and i18n so it can be tested on its own.
 */
export type MeetingRelation = "host" | "invited" | "participant";

export function meetingRelation(meeting: {
  isHost?: boolean | null;
  viewerInvitationStatus?: string | null;
}): MeetingRelation {
  // `=== true`, as the page has always read it: anything short of an explicit yes is not drawn as
  // the viewer's own meeting.
  if (meeting.isHost === true) return "host";
  const invitation =
    typeof meeting.viewerInvitationStatus === "string" ? meeting.viewerInvitationStatus.trim() : "";
  return invitation ? "invited" : "participant";
}
