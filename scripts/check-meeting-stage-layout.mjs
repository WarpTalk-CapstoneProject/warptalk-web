import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

const [roomPage, meetingChrome, meetingStage] = await Promise.all([
  source("src/app/(app)/room/[id]/page.tsx"),
  source("src/components/rooms/live/meeting-top-bar.tsx"),
  source("src/components/rooms/live/meeting-stage.tsx"),
]);

assert.match(
  roomPage,
  /data-meeting-camera-view[\s\S]*<MeetingStageTimer[\s\S]*<LiveKitMeetingStage/,
  "the meeting timer must render inside the camera view",
);
assert.match(
  roomPage,
  /data-meeting-camera-view[\s\S]*rounded-\[24px\][\s\S]*border-border\/40[\s\S]*shadow-none/,
  "the outer camera surface must use a soft radius, low-contrast border, and no hard shadow",
);
assert.match(
  roomPage,
  /<\/section>[\s\S]*data-meeting-bottom-dock[\s\S]*<MeetingControlBar[\s\S]*<MeetingExitControl/,
  "the control bar and standalone exit control must render below the camera view",
);
assert.doesNotMatch(
  roomPage,
  /absolute bottom-6 left-1\/2/,
  "the meeting control bar must not overlay the camera view",
);
assert.match(
  roomPage,
  /data-meeting-content[\s\S]*<MeetingSidePanel/,
  "the transcript side panel must remain outside the camera view",
);
assert.match(
  meetingChrome,
  /export function MeetingStageTimer/,
  "meeting chrome must expose the stage timer separately",
);
assert.match(
  meetingChrome,
  /export function MeetingExitControl/,
  "meeting chrome must expose a standalone exit control",
);
assert.doesNotMatch(
  meetingChrome,
  /room\.title|getLanguageName|Live Translation|Translation Ready|>Host</,
  "the camera chrome must not reintroduce the removed meeting title metadata",
);
assert.match(
  meetingStage,
  /const firstRemoteIdentity = visibleTracks\.find\([\s\S]*participant\.identity !== localIdentity/,
  "auto layout must prefer a remote participant when nobody is active or pinned",
);
assert.match(
  meetingStage,
  /layoutMode === "auto" && visibleTracks\.length > 1[\s\S]*pinnedUserId \|\|[\s\S]*activeSpeakerIdentity \|\|[\s\S]*firstRemoteIdentity \|\|[\s\S]*firstVisibleIdentity/,
  "auto layout must create a featured stage for meetings with at least two participants",
);
assert.match(
  meetingStage,
  /const thumbnailTracks = orderThumbnailTracks\([\s\S]*otherTracks[\s\S]*localIdentity/,
  "featured layouts must keep every remaining participant in the thumbnail filmstrip",
);
assert.doesNotMatch(
  meetingStage,
  /otherTracks\.slice\(0, 1\)/,
  "the thumbnail filmstrip must not discard participants after the first one",
);

console.log("Meeting stage layout contract passed.");
