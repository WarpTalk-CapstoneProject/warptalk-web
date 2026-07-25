import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const page = await readFile(path.join(root, "src/app/(app)/[workspaceSlug]/rooms/[id]/page.tsx"), "utf8");

const checks = [
  ["room detail renders a thread flow component", page.includes("function RoomThread(")],
  ["thread events include user chips", page.includes("<UserChip user={event.actor}")],
  ["user chips open a popover profile dropdown", page.includes("function UserChip(") && page.includes("<PopoverContent")],
  ["thread content is rendered through markdown", page.includes("function MarkdownContent(")],
  ["room description has a rich-text notes editor", page.includes("function RoomNotesEditor(") && page.includes("Room notes") && page.includes("useEditor(")],
  ["markdown renderer supports tables", page.includes("case \"table\"") && page.includes("<thead") && page.includes("<td")],
  ["markdown renderer supports headings and emphasis", page.includes("case \"h1\"") && page.includes("startsWith(\"**\")") && page.includes("startsWith(\"*\")")],
  ["room logs name the actor with a chip", page.includes("Meeting scheduled") && page.includes("actor: hostUser")],
  ["primary detail surface no longer uses overview/activity/transcript tabs", !page.includes("const [activeTab") && !page.includes("function TabButton(")],
  ["thread does not render placeholder agenda/table content", !page.includes("Align translation setup") && !page.includes("| Field | Value |")],
  ["empty thread state is separate from real events", page.includes("ThreadEmptyState")],
  ["join meeting button keeps white text on purple primary", page.includes("className=\"h-9 justify-between rounded-md text-[13px] !text-white")],
  ["room detail uses a white surface", page.includes("bg-white text-ink")],
  ["activity does not show thread flow heading or step dots", !page.includes("Thread flow") && !page.includes("function ThreadDot(")],
  ["visible host fallback label is removed", !page.includes("\"Host\"") && !page.includes(">Host<")],
];

const failures = checks.filter(([, passed]) => !passed);

for (const [label, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
}

if (failures.length > 0) {
  process.exitCode = 1;
}
