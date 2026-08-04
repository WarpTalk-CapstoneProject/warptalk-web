import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8");

const [hook, historyService, roomService, transcriptsPage, historyPage, workspaceLayout] = await Promise.all([
  read("src/hooks/use-room-history.ts"),
  read("src/services/roomHistory.service.ts"),
  read("src/services/translationRoom.service.ts"),
  read("src/app/(app)/[workspaceSlug]/ai-summaries/page.tsx"),
  read("src/app/(app)/[workspaceSlug]/history/page.tsx"),
  read("src/app/(app)/[workspaceSlug]/layout.tsx"),
]);

const checks = [
  ["history API accepts a workspace id", roomService.includes("workspaceId?: string")],
  ["history service sends the workspace id", historyService.includes("workspaceId: options.workspaceId")],
  ["history cache is isolated per workspace", hook.includes('queryKey: ["room-history", workspaceId')],
  ["history waits for a resolved workspace", hook.includes("enabled: Boolean(workspaceId)")],
  ["transcripts request the active workspace", transcriptsPage.includes("useRoomHistory(activeWorkspaceId)")],
  ["meeting history requests the active workspace", historyPage.includes("useRoomHistory(activeWorkspaceId)")],
  [
    "workspace pages wait until the active id matches the route",
    workspaceLayout.includes("activeWorkspaceId !== targetWorkspace.id"),
  ],
];

const failures = checks.filter(([, passed]) => !passed);
for (const [label, passed] of checks) console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
if (failures.length > 0) process.exitCode = 1;
