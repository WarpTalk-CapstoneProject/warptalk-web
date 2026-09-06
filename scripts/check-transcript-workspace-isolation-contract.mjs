import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8");

const [
  hook,
  historyService,
  roomService,
  roomDetailPage,
  documentsPage,
  documentsHook,
  documentsService,
  workspaceLayout,
] = await Promise.all([
  read("src/hooks/use-room-history.ts"),
  read("src/services/room-history.service.ts"),
  read("src/services/translation-room.service.ts"),
  read("src/app/(app)/[workspaceSlug]/rooms/[id]/page.tsx"),
  read("src/app/(app)/[workspaceSlug]/history/page.tsx"),
  read("src/hooks/use-meeting-documents.ts"),
  read("src/services/meeting-document.service.ts"),
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
  // `/history` is now the meeting-DOCUMENTS grid, not the meeting archive, so the assertion moved
  // with it rather than being dropped. The requirement did not change one bit: that page reads a
  // workspace's transcripts, summaries, minutes and recordings, which is exactly the payload this
  // contract exists to keep from leaking across workspaces.
  [
    "the documents page requests the active workspace",
    documentsPage.includes("useMeetingDocuments(activeWorkspaceId"),
  ],
  [
    "documents cache is isolated per workspace",
    documentsHook.includes('["meeting-documents", workspaceId'),
  ],
  ["documents wait for a resolved workspace", documentsHook.includes("enabled: Boolean(workspaceId)")],
  [
    "the documents service sends the workspace id",
    documentsService.includes("workspaceId: query.workspaceId"),
  ],
  [
    "workspace pages wait until the active id matches the route",
    workspaceLayout.includes("activeWorkspaceId !== targetWorkspace.id"),
  ],
];

const failures = checks.filter(([, passed]) => !passed);
for (const [label, passed] of checks) console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
if (failures.length > 0) process.exitCode = 1;
