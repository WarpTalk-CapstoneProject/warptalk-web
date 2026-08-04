import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

const [roomPage, meetingChrome, meetingStage, meetingControlBar, liveSubtitle, appLayout] = await Promise.all([
  source("src/components/rooms/live/persistent-meeting-session.tsx"),
  source("src/components/rooms/live/meeting-top-bar.tsx"),
  source("src/components/rooms/live/meeting-stage.tsx"),
  source("src/components/rooms/live/meeting-control-bar.tsx"),
  source("src/components/rooms/live/live-subtitle-overlay.tsx"),
  source("src/app/(app)/layout.tsx"),
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
assert.match(
  appLayout,
  /const isLiveMeetingRoute = pathname\.startsWith\("\/room\/"\)/,
  "the app shell must identify the active meeting route",
);
assert.match(
  appLayout,
  /<header[\s\S]*cn\([\s\S]*!isLiveMeetingRoute && "border-b border-border"/,
  "the app header divider must be removed only while inside a live meeting",
);
assert.match(
  roomPage,
  /const \[subtitlesEnabled, setSubtitlesEnabled\] = useState\(true\)/,
  "live subtitles must have an explicit local visibility state",
);
assert.match(
  roomPage,
  /<\/section>[\s\S]*subtitlesEnabled[\s\S]*data-meeting-subtitle-lane[\s\S]*<LiveSubtitleOverlay[\s\S]*data-meeting-bottom-dock/,
  "enabled subtitles must render in a reserved lane between camera and controls",
);
assert.doesNotMatch(
  roomPage,
  /data-meeting-bottom-dock[\s\S]{0,180}overflow-x-auto/,
  "the bottom dock must not clip control flyouts with overflow scrolling",
);
assert.match(
  roomPage,
  /subtitlesEnabled=\{subtitlesEnabled\}[\s\S]*onToggleSubtitles=\{\(\) =>[\s\S]*setSubtitlesEnabled/,
  "the room page must wire subtitle state into the control bar",
);
assert.match(
  meetingControlBar,
  /label=\{subtitlesEnabled \? "Hide subtitles" : "Show subtitles"\}[\s\S]*<ClosedCaptioning/,
  "the control bar must expose an accessible subtitle toggle",
);
assert.doesNotMatch(
  meetingControlBar,
  /NetworkQualityIcon|Your connection quality/,
  "the redundant connection-quality icon must not remain in the control bar",
);
assert.doesNotMatch(
  liveSubtitle,
  /absolute inset-x-0 bottom-24/,
  "live subtitles must not overlay the camera view",
);

console.log("Meeting stage layout contract passed.");
