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
// The border this used to require is gone, on the owner's call. It outlined the frame at
// radius 24 while the tile inside rounded at 16, so the curves never met and the backing
// showed as grey wedges in the corners. The radius and the clip stay — they are what shapes
// the picture — and nothing may draw an edge around them again.
assert.match(
  roomPage,
  /data-meeting-camera-view[\s\S]{0,220}overflow-hidden rounded-\[24px\]/,
  "the outer camera surface must round softly and clip the picture to that radius",
);
assert.doesNotMatch(
  roomPage,
  /data-meeting-camera-view[\s\S]{0,220}border-border/,
  "the outer camera surface must not draw a border around the picture",
);
assert.match(
  meetingStage,
  /visibleTracks\.length === 1[\s\S]{0,900}className: "!rounded-none",\n\s*tileClassName: "!rounded-none"/,
  "a lone participant must fill the frame square and let the frame's clip do the rounding",
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
// The threshold moved from 2 to 5 on the owner's call. Below five, an even grid is the
// better answer: a two- or three-person call has no "main" person, and picking one shrinks
// everyone else for nothing. Above it the grid tiles get too small to read a face.
assert.match(
  meetingStage,
  /layoutMode === "auto" && visibleTracks\.length > AUTO_FEATURED_MIN_PARTICIPANTS[\s\S]*pinnedUserId \|\|[\s\S]*activeSpeakerIdentity \|\|[\s\S]*firstRemoteIdentity \|\|[\s\S]*firstVisibleIdentity/,
  "auto layout must create a featured stage once a meeting outgrows an even grid",
);
assert.match(
  meetingStage,
  /const AUTO_FEATURED_MIN_PARTICIPANTS = 5/,
  "the grid/featured threshold must stay a named number, not a literal buried in a ternary",
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
// The shell used to spell this path itself. It is now one helper, tested on its own,
// because getting it wrong floats the minimised window on top of the live meeting.
assert.match(
  appLayout,
  /const isLiveMeetingRoute = isLiveMeetingPath\(pathname\)/,
  "the app shell must identify the active meeting route",
);
assert.doesNotMatch(
  appLayout,
  /pathname\.startsWith\('\/room\/'\)|pathname\.startsWith\("\/room\/"\)/,
  "the app shell must not re-derive the live meeting path beside the helper",
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
