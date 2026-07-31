import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const page = await readFile(path.join(root, "src/app/(app)/[workspaceSlug]/rooms/[id]/page.tsx"), "utf8");
const livePage = await readFile(path.join(root, "src/app/(app)/room/[id]/page.tsx"), "utf8");
const sidePanel = await readFile(
  path.join(root, "src/components/rooms/live/side-panel/meeting-side-panel.tsx"),
  "utf8",
);

const checks = [
  ["user chips open a popover profile dropdown", page.includes("function UserChip(") && page.includes("<PopoverContent")],
  ["room description has a rich-text notes editor", page.includes("function RoomNotesEditor(") && page.includes("Room notes") && page.includes("useEditor(")],
  ["room detail does not render inferred activity", !page.includes("function RoomThread(") && !page.includes("buildThreadEvents(")],
  ["room detail does not label synthesized room data as activity", !page.includes("Room events and participant changes.") && !page.includes(">Activity<")],
  ["join meeting button keeps white text on purple primary", page.includes("className=\"h-9 justify-between rounded-md text-[13px] !text-white")],
  ["room detail uses a white surface", page.includes("bg-white text-ink")],
  ["visible host fallback label is removed", !page.includes("\"Host\"") && !page.includes(">Host<")],
  ["live side panel only exposes transcript chat and people modes", sidePanel.includes('"transcript" | "chat" | "participants"') && !sidePanel.includes('"polls"') && !sidePanel.includes('"qa"') && !sidePanel.includes('"notes"')],
  ["live side panel removes notes polls and q-and-a tabs", !sidePanel.includes('label="Notes"') && !sidePanel.includes('label="Polls"') && !sidePanel.includes('label="Q&A"')],
  ["live side panel does not fetch removed feature badges", !sidePanel.includes("usePolls(") && !sidePanel.includes("useQuestions(")],
  ["live room no longer subscribes to removed polls and q-and-a events", !livePage.includes('connection.on("PollCreated"') && !livePage.includes('connection.on("QuestionAsked"')],
  ["live room never auto-starts translation before the host clicks start", !livePage.includes("autoStartedRef") && !livePage.includes("startRoom.mutate(room.id")],
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
