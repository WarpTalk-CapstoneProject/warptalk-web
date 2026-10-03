#!/usr/bin/env node
/**
 * A bridge recording must never again be a black rectangle with sound. WT-910 follow-up.
 *
 * WHAT HAPPENED
 *
 * The first bridge recording in production was 3:25 of luma-0 video over real audio. The template
 * switched to the Meet-window layout (black stage) the moment the track was subscribed, and the
 * track never delivered a frame: the Meet window was a static Windows Graphics Capture source,
 * published long before the recorder subscribed, simulcast on, nothing to make a keyframe from.
 *
 * The fix lives in two files that each look fine on their own, so this pins both halves:
 *   - the publisher wraps the capture in steadyFrameTrack and publishes one layer;
 *   - the template shows a slate until the first frame is decoded, renews a subscription that
 *     never produced one, and logs both outcomes where the egress logs can see them.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function expect(source, pattern, file, message) {
  if (!pattern.test(source)) failures.push(`${file}: ${message}`);
}

const PUBLISHER = "src/components/rooms/live/persistent-meeting-session.tsx";
const TEMPLATE = "src/app/egress/composite/page.tsx";
const publisher = read(PUBLISHER);
const template = read(TEMPLATE);

expect(
  publisher,
  /const steady = await steadyFrameTrack\(source\);/,
  PUBLISHER,
  "the Meet window must be wrapped in steadyFrameTrack before it is published",
);
expect(
  publisher,
  /publishTrack\(captured, \{\s*name: MEET_WINDOW_TRACK_NAME,\s*source: Track\.Source\.ScreenShare,\s*\.\.\.MEET_WINDOW_PUBLISH_OPTIONS,/,
  PUBLISHER,
  "the Meet window must be published with MEET_WINDOW_PUBLISH_OPTIONS (one layer, VP8)",
);
expect(
  publisher,
  /getDisplayMedia\(\{\s*video: MEET_WINDOW_CAPTURE_CONSTRAINTS,/,
  PUBLISHER,
  "the window capture must ask for MEET_WINDOW_CAPTURE_CONSTRAINTS",
);
expect(
  publisher,
  /source\.addEventListener\("ended", drop\)/,
  PUBLISHER,
  "the capture's end must be heard on the SOURCE track; the wrapper never fires `ended`",
);

// Production bridge recording, 03 Oct: the window was taken down at 0:34 and never came back.
// Re-publishing must not hang on the one "Meet is back on its tab" transition.
expect(
  publisher,
  /const meetWindowSupervised = shouldSuperviseMeetWindow\(\{/,
  PUBLISHER,
  "the session must keep the Meet window up while the recording wants it (shouldSuperviseMeetWindow)",
);
expect(
  publisher,
  /useSupervisedPublish\(\{\s*enabled: meetWindowSupervised,\s*kick: meetWindowRepublish,/,
  PUBLISHER,
  "the supervisor (with its back-off) must be the single re-publisher of the Meet window; B18's return to the tab only kicks it",
);
if (/void meetWindowControlRef\.current\?\.publishMeetWindow\(roomId\)\.then/.test(publisher)) {
  failures.push(`${PUBLISHER}: a second re-publish effect races the supervisor on publishMeetWindow`);
}

expect(
  template,
  /requestVideoFrameCallback/,
  TEMPLATE,
  "the template must detect the Meet window's first decoded frame",
);
expect(
  template,
  /\{stage === "slate" \? <MeetWindowSlate audioLine=\{slateAudioLine\} \/> : null\}/,
  TEMPLATE,
  "the template must show the slate, not a black stage, until the Meet window has a picture",
);
expect(
  template,
  /MEET_WINDOW_FIRST_FRAME[\s\S]*MEET_WINDOW_NO_FRAME/,
  TEMPLATE,
  "the template must log the first frame and its absence to the console (the egress logs)",
);
expect(
  template,
  /publication\.setSubscribed\(false\);[\s\S]{0,120}publication\.setSubscribed\(true\)/,
  TEMPLATE,
  "a Meet window that never produced a frame must have its subscription renewed",
);
expect(
  template,
  /filter\(\(tile\) => tile\.track !== track\)/,
  TEMPLATE,
  "tiles must be dropped by track on unsubscribe, not by whether they are mounted",
);

// Production bridge recording, 03 Oct: the first 3.4 s and 0:34-3:14 were the native grid
// ("External Meeting" + the host, "Camera is off"), because the layout followed the window track
// alone and the track went away. A bridge room must keep the Meet stage for the whole file.
expect(
  template,
  /resolveEgressLayout\(tiles, \{ bridge \}\) === "meet-window"/,
  TEMPLATE,
  "the layout must take the latched bridge flag, so a bridge room never falls back to the grid",
);
expect(
  template,
  /noteBridge\(\);[\s\S]*EgressHelper\.startRecording\(\)/,
  TEMPLATE,
  "the bridge room must be recognised before startRecording, so the first frame is not the grid",
);
expect(
  template,
  /resolveEgressAudioContext\([\s\S]{0,300}\{ latched: bridgeLatched \}/,
  TEMPLATE,
  "the bridge room must be recognised with isBridgeRecording (via resolveEgressAudioContext: stand-in present, or a meet-window/meet-audio track), through the one latch",
);
expect(
  template,
  /pickHeldMeetFrame\(snapshotsRef\.current, lostAtMs\)/,
  TEMPLATE,
  "a lost Meet window must hold a frame from before the B18 lookback, never the very last one",
);
expect(
  template,
  /stage === "held" && heldFrame \? <HeldMeetFrame frame=\{heldFrame\} audioLine=\{slateAudioLine\} \/> : null/,
  TEMPLATE,
  "while the Meet window is away the stage must hold the kept Meet frame",
);
expect(
  template,
  /MEET_WINDOW_LOST/,
  TEMPLATE,
  "the loss of the Meet window must be logged to the console (the egress logs)",
);

if (failures.length > 0) {
  console.error("Egress Meet-window contract FAILED:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log("Egress Meet-window contract passed.");
