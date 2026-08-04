import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(root, relativePath), "utf8").catch((error) => {
    if (error?.code === "ENOENT") return "";
    throw error;
  });
}

const [appLayout, roomRoute, meetingSession, meetingStore] = await Promise.all([
  source("src/app/(app)/layout.tsx"),
  source("src/app/(app)/room/[id]/page.tsx"),
  source("src/components/rooms/live/persistent-meeting-session.tsx"),
  source("src/stores/active-meeting-store.ts"),
]);

assert.match(
  meetingStore,
  /activeRoomId:[\s\S]*openMeeting:[\s\S]*closeMeeting:/,
  "the app must keep the active meeting id outside the route component",
);
assert.match(
  roomRoute,
  /openMeeting\(roomId\)/,
  "visiting a live room must activate the persistent meeting session",
);
assert.doesNotMatch(
  roomRoute,
  /LiveKitRoom|createHubConnection|useLeaveTranslationRoom/,
  "the route wrapper must not own connections that disappear during navigation",
);
assert.match(
  appLayout,
  /<PersistentMeetingSession[\s\S]*key=\{activeMeetingRoomId\}[\s\S]*compact=\{!isLiveMeetingRoute\}/,
  "the persistent session must stay mounted while its presentation changes",
);
assert.match(
  appLayout,
  /!isLiveMeetingRoute[\s\S]*fixed[\s\S]*bottom-\[72px\][\s\S]*right-5/,
  "the mini meeting must float above the global assistant without covering the page",
);
assert.match(
  meetingSession,
  /export function PersistentMeetingSession\([\s\S]*roomId[\s\S]*compact[\s\S]*onMeetingClosed/,
  "the live meeting implementation must accept layout-owned persistence controls",
);
assert.doesNotMatch(
  meetingSession,
  /useParams/,
  "the persistent session must not be tied to the currently visible route params",
);
assert.match(
  meetingSession,
  /<LiveKitRoom[\s\S]*compact \? \([\s\S]*data-mini-meeting[\s\S]*\) : \([\s\S]*data-meeting-content/,
  "full and mini views must share one mounted LiveKitRoom",
);
assert.match(
  meetingSession,
  /aria-label="Return to meeting"[\s\S]*router\.push\(`\/room\/\$\{roomId\}`\)/,
  "the mini meeting must provide a clear route back to the full meeting",
);
assert.match(
  meetingSession,
  /handleExit[\s\S]*onMeetingClosed\(\)[\s\S]*router\.push/,
  "only an explicit leave or end action should close the persistent meeting",
);

console.log("Persistent meeting contract passed.");
