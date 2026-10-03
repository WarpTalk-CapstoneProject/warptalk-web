#!/usr/bin/env node
/**
 * A bridge recording must contain the Google Meet call, not WarpTalk's STT taps.
 *
 * WHAT HAPPENED
 *
 * Production, 2026-10-03: a 222 s bridge recording was digital silence from 1.1 s to the end while
 * the user talked in Meet. The template mixed WarpTalk's own tracks, and the user's voice there is
 * their WarpTalk microphone, which was muted while Meet's was on.
 *
 * The fix spans three files that each look fine alone, so this pins the joins:
 *   - the session renders BridgeMeetAudioPublisher, feeds it the inbound leg's track, and publishes
 *     it before asking the server to record;
 *   - the publisher puts it on the wire as `meet-audio`, SCREEN-SHARE AUDIO (the STT ingest reads
 *     only microphone/unknown sources, WT-631; live clients play only microphones);
 *   - the template decides audio subscriptions with shouldRecordAudio and never with a blanket
 *     subscribe, and does not claim audio it does not have.
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

const SESSION = "src/components/rooms/live/persistent-meeting-session.tsx";
const PUBLISHER = "src/components/rooms/live/bridge-meet-audio-publisher.tsx";
const TEMPLATE = "src/app/egress/composite/page.tsx";
const session = read(SESSION);
const publisher = read(PUBLISHER);
const template = read(TEMPLATE);

expect(
  session,
  /<BridgeMeetAudioPublisher[\s\S]*?farSideTrack=\{bridgeInboundTrack\}[\s\S]*?localVoiceOn=\{meetAudioLocalVoice\}/,
  SESSION,
  "the session must render BridgeMeetAudioPublisher with the inbound leg's track and the Meet-mute gate",
);
expect(
  session,
  /setBridgeInboundTrack\(handles\.track\)/,
  SESSION,
  "the far side in meet-audio must be the inbound leg's own track (no second capture of Meet)",
);
expect(
  session,
  /Promise\.allSettled\(\[[\s\S]{0,400}publishMeetWindow\(roomId\)[\s\S]{0,200}publishMeetAudio\(\)[\s\S]{0,1200}startRecordingRef\.current\("start"\)/,
  SESSION,
  "the start chain must open the Meet window and publish meet-audio together (allSettled) before asking the server to record",
);
expect(
  publisher,
  /publishTrack\(mixed, \{\s*name: MEET_AUDIO_TRACK_NAME,\s*source: Track\.Source\.ScreenShareAudio,/,
  PUBLISHER,
  "meet-audio must be published by name, as ScreenShareAudio (never Microphone/Unknown: the STT ingest would read it)",
);
expect(
  publisher,
  /useSupervisedPublish\(\{\s*enabled: wanted,/,
  PUBLISHER,
  "meet-audio must be kept on the wire by the supervisor (a failed publish or a reconnect is retried)",
);
expect(
  publisher,
  /setAttributes\(\{ \[MEET_AUDIO_MIC_ATTRIBUTE\]/,
  PUBLISHER,
  "the publisher must say whether its microphone is in meet-audio (MEET_AUDIO_MIC_ATTRIBUTE)",
);
expect(
  publisher,
  /meetAudioMicGain\(\{/,
  PUBLISHER,
  "the microphone copy must be ducked while the far side sounds (echo of Meet's speakers)",
);
expect(
  publisher,
  /await unpublishEveryMeetAudio\(\);\s*try \{\s*const publication = await room\.localParticipant\.publishTrack\(mixed,/,
  PUBLISHER,
  "every leftover meet-audio must be unpublished before a new mix is published (never two)",
);
if (/RoomEvent\.LocalTrackUnpublished/.test(publisher)) {
  failures.push(
    `${PUBLISHER}: no LocalTrackUnpublished handler may drop the mix (LiveKit's republishAllTracks unpublishes and republishes the same track)`,
  );
}
expect(
  template,
  /ParticipantAttributesChanged/,
  TEMPLATE,
  "the template must re-decide the mix when the meet-audio microphone attribute changes",
);
expect(
  template,
  /shouldRecordAudio\(/,
  TEMPLATE,
  "the template must decide audio subscriptions with shouldRecordAudio",
);
expect(
  template,
  /if \(publication\.kind === Track\.Kind\.Audio\) return;\s*publication\.setSubscribed\(true\);/,
  TEMPLATE,
  "subscribeIfHuman must leave audio to syncAudioSubscriptions",
);
if (/Audio is being recorded\./.test(template)) {
  failures.push(`${TEMPLATE}: the slate must not claim "Audio is being recorded." unconditionally`);
}

if (failures.length > 0) {
  console.error("FAIL bridge recording audio contract:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log("ok bridge recording audio contract");
