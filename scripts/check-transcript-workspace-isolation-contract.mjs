import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8");

const [hook, historyService, roomService, roomDetailPage, historyPage, workspaceLayout] = await Promise.all([
  read("src/hooks/use-room-history.ts"),
  read("src/services/roomHistory.service.ts"),
  read("src/services/translationRoom.service.ts"),
  read("src/app/(app)/[workspaceSlug]/rooms/[id]/page.tsx"),
  read("src/app/(app)/[workspaceSlug]/history/page.tsx"),
  read("src/app/(app)/[workspaceSlug]/layout.tsx"),
]);

const checks = [
  ["history API accepts a workspace id", roomService.includes("workspaceId?: string")],
  ["history service sends the workspace id", historyService.includes("workspaceId: options.workspaceId")],
  ["history cache is isolated per workspace", hook.includes('queryKey: ["room-history", workspaceId')],
  ["history waits for a resolved workspace", hook.includes("enabled: Boolean(workspaceId)")],
  // The workspace-wide Transcripts page is gone: a meeting's record lives on the meeting.
  // The isolation requirement did not go with it — the room asks for its OWN workspace, so
  // a stale active workspace can never hand it another workspace's summary.
  [
    "a room's record requests that room's workspace",
    roomDetailPage.includes("useEndedRoomRecord(validWorkspaceId ?? null, roomId)"),
  ],
  [
    "the per-room record shares the workspace-isolated cache key",
    hook.includes("export function useEndedRoomRecord") &&
      hook.includes("...roomHistoryQuery(workspaceId)"),
  ],
  ["meeting history requests the active workspace", historyPage.includes("useRoomHistory(activeWorkspaceId)")],
  [
    "workspace pages wait until the active id matches the route",
    workspaceLayout.includes("activeWorkspaceId !== targetWorkspace.id"),
  ],
];

const failures = checks.filter(([, passed]) => !passed);
for (const [label, passed] of checks) console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
if (failures.length > 0) process.exitCode = 1;
