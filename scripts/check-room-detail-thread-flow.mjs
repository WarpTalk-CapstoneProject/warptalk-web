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
  ["markdown renderer supports tables", page.includes("case \"table\"") && page.includes("<thead") && page.includes("<td")],
  ["markdown renderer supports headings and emphasis", page.includes("case \"h1\"") && page.includes("startsWith(\"**\")") && page.includes("startsWith(\"*\")")],
  ["room logs name the actor with a chip", page.includes("Meeting scheduled") && page.includes("actor: hostUser")],
  ["primary detail surface no longer uses overview/activity/transcript tabs", !page.includes("const [activeTab") && !page.includes("function TabButton(")],
];

const failures = checks.filter(([, passed]) => !passed);

for (const [label, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
}

if (failures.length > 0) {
  process.exitCode = 1;
}
