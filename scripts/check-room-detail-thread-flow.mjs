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
  ["translation controls follow persisted room lifecycle", livePage.includes('room?.status === "in_progress"') && livePage.includes('room.status === "paused"')],
  ["stop translation pauses the backend pipeline", livePage.includes("usePauseTranslationRoom") && livePage.includes("pauseRoom.mutate")],
  ["resume translation resumes the backend pipeline", livePage.includes("useResumeTranslationRoom") && livePage.includes('room.status === "paused" ? resumeRoom : startRoom')],
  ["starting translation opens the transcript side panel", livePage.includes("setRightSidebarOpen(true)") && livePage.includes('setSidePanelMode("transcript")')],
  ["pre-start and paused rooms reject transcript broadcasts", livePage.includes("translationActiveRef.current") && livePage.includes("if (!translationActiveRef.current) return;")],
];

const failures = checks.filter(([, passed]) => !passed);

for (const [label, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
}

if (failures.length > 0) {
  process.exitCode = 1;
}
