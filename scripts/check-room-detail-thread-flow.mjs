import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const page = await readFile(path.join(root, "src/app/(app)/[workspaceSlug]/rooms/[id]/page.tsx"), "utf8");
const livePage = await readFile(path.join(root, "src/components/rooms/live/persistent-meeting-session.tsx"), "utf8");
const sidePanel = await readFile(
  path.join(root, "src/components/rooms/live/side-panel/meeting-side-panel.tsx"),
  "utf8",
);

// The transcript panel's own props, so a host gate cannot be added to it without failing a check.
const transcriptPanelStart = sidePanel.indexOf("<TranscriptPanel");
const transcriptPanelCall = transcriptPanelStart < 0
  ? ""
  : sidePanel.slice(transcriptPanelStart, sidePanel.indexOf("/>", transcriptPanelStart));

const checks = [
  ["user chips open a popover profile dropdown", page.includes("function UserChip(") && page.includes("<PopoverContent")],
  ["room description has a rich-text notes editor", page.includes("function RoomNotesEditor(") && page.includes("Room notes") && page.includes("useEditor(")],
  ["room detail does not render inferred activity", !page.includes("function RoomThread(") && !page.includes("buildThreadEvents(")],
  ["room detail does not label synthesized room data as activity", !page.includes("Room events and participant changes.") && !page.includes(">Activity<")],
  // WT-197 moved this button into a shared `RoomEntryButton` so the promoted header copy and
  // the "Meeting access" copy cannot drift. The styling it must keep is the same as before;
  // only the place it is written down changed.
  ["join meeting button keeps white text on purple primary", page.includes("function RoomEntryButton(") && page.includes("\"rounded-md text-[13px] !text-white [&_svg]:!text-white\"")],
  ["room detail uses a themed surface-1 background", page.includes("bg-surface-1 text-ink")],
  ["visible host fallback label is removed", !page.includes("\"Host\"") && !page.includes(">Host<")],
  // WT-191: an invitee who already joined must appear once, not as a participant row
  // plus a duplicate "pending"/"accepted" invitation row. That needs toUserIdentity to
  // carry an email, and the dedupe to compare emails rather than an email against a UUID.
  ["participant identities carry a resolvable email", page.includes("function resolveUserEmail(") && page.includes("email: resolveUserEmail(")],
  ["invitation dedupe matches on email, never on participant id", page.includes("participant.email?.trim().toLowerCase() === invitationEmail") && !page.includes("participant.id === invitation.email")],
  ["live side panel only exposes transcript chat and people modes", sidePanel.includes('"transcript" | "chat" | "participants"') && !sidePanel.includes('"polls"') && !sidePanel.includes('"qa"') && !sidePanel.includes('"notes"')],
  ["live side panel removes notes polls and q-and-a tabs", !sidePanel.includes('label="Notes"') && !sidePanel.includes('label="Polls"') && !sidePanel.includes('label="Q&A"')],
  ["live side panel does not fetch removed feature badges", !sidePanel.includes("usePolls(") && !sidePanel.includes("useQuestions(")],
  ["live room no longer subscribes to removed polls and q-and-a events", !livePage.includes('connection.on("PollCreated"') && !livePage.includes('connection.on("QuestionAsked"')],
  // This has now flipped twice. 2026-07-30 pinned "never auto-starts"; WT-183 replaced it with
  // auto-start because a room stayed "Waiting" in the list while its host was already inside;
  // WT-248 reverted that, because starting to record and translate a conversation unasked is
  // not an acceptable fix for a status label. The label is handled by the lobby (WT-232) and by
  // the control bar's Start Translation, both of which call the same endpoint deliberately.
  // Do not re-add auto-start to fix a display problem — fix the display.
  ["live room never starts translation on its own", !livePage.includes("autoStartTriggeredRef") && !livePage.includes("startRoom.mutate(room.id")],
  // Transcription and translation are SEPARATE features, and the live session must not read one
  // flag for both. `status === "in_progress"` means the ROOM is open — since WT-339 that
  // deliberately does not start translation — so it answers "is this meeting live?" and nothing
  // more. Reading it as "translation is running" showed Stop from the moment a meeting opened:
  // the host was never offered Start, no TranslationRoomSession was ever created, the audio
  // routes never left READY, and translation could not begin at all.
  ["transcription follows the room being open, not translation", livePage.includes('const meetingLive = room?.status === "in_progress"') && livePage.includes("meetingLiveRef.current")],
  ["translation running is read from an active session, not room status", livePage.includes("useTranslationRoomSessions") && livePage.includes('session.status === "ACTIVE"') && livePage.includes("warptalkStarted={translationStarted}")],
  // Stop must end the translation SESSION, not pause the room. Pausing sets the room to PAUSED,
  // which the AI workers read as "ignore this room's microphone" — so the old Stop took the
  // transcript down with the translation and there was no way back to transcript-only.
  ["stop translation ends the session and leaves the meeting running", livePage.includes("useStopTranslation") && livePage.includes("stopTranslation.mutate(room.id") && !livePage.includes("pauseRoom.mutate")],
  // /resume is the ONLY path that opens a TranslationRoomSession, which is what lets the routes
  // go from READY to BROADCASTING. Sending an already-live room to /start instead — what
  // `room.status === "paused" ? resumeRoom : startRoom` did — started nothing and said it had.
  ["start translation goes through resume, the only path that opens a session", livePage.includes("resumeRoom.mutateAsync(room.id)") && !livePage.includes('room.status === "paused" ? resumeRoom : startRoom')],
  ["starting translation opens the transcript side panel", livePage.includes("setRightSidebarOpen(true)") && livePage.includes('setSidePanelMode("transcript")')],
  ["paused rooms reject transcript broadcasts", livePage.includes("if (!meetingLiveRef.current) return;")],
  // The transcript belongs to everyone in the room, and the backend agrees — TranscriptReadAccess
  // is host OR participant. Starting and stopping TRANSLATION is host-only because it spends a
  // billed pipeline; the transcript panel and the caption lane must not pick up a host gate by
  // association with it.
  ["the live transcript panel is not host-gated", transcriptPanelCall.length > 0 && !transcriptPanelCall.includes("isHost")],
  ["captions follow the meeting, not the viewer's role", livePage.includes("enabled={meetingLive && subtitlesEnabled}")],
  // WT-371 splits the two halves of what used to be one rule.
  //
  // STOPPING stays strictly host-only, and the reason above is why: translation spends a billed
  // pipeline, and letting anyone cut it off takes the meeting's translation away from everybody
  // in it.
  //
  // STARTING is now the room's decision. Host-only blocked a meeting whose host was late or busy
  // — the same trap WT-341 removed from starting the room — so `participants_can_start_
  // translation` exists, defaults to OFF, and has to be turned on by a host. The billing concern
  // survives that: the spend is opened by the person who owns the room, deliberately, per room,
  // rather than by a global relaxation nobody chose.
  //
  // The server enforces the same split in TranslationRoomSessionService.CanStartSessionAsync;
  // this check only pins what the client offers.
  ["stopping translation is host-only, always", livePage.includes("onStopWarptalk={isRoomHost ? handleStopWarptalk : undefined}")],
  ["starting translation is host-only unless the room opened it up", livePage.includes("isRoomHost || room?.settings?.participantsCanStartTranslation") && livePage.includes("handleStartWarptalk")],
];

const failures = checks.filter(([, passed]) => !passed);

for (const [label, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
}

if (failures.length > 0) {
  process.exitCode = 1;
}
