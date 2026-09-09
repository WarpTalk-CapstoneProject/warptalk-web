import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * WT-655 — a recording frame that fails must say so, and a page with no recording must not
 * pretend it has one.
 *
 * THE FAILURE THIS PINS, BECAUSE IT ALREADY HAPPENED
 *   Clicking a transcript timestamp to seek the recording was built, tested and shipped — and was
 *   dead in production for months, because four different situations all rendered as the same
 *   blank space: nobody pressed record, the recording is still processing, the presigned link had
 *   expired, and the transcript predates the column that stores its time origin. Nothing on screen
 *   distinguished them, so nobody could report the one that was a bug.
 *
 *   These are greps, not tests, and greps are a blunt instrument. They are here because the
 *   guarantees below live in JSX, and this repo's test runner (`node --experimental-strip-types`)
 *   cannot parse JSX — the pure logic underneath is unit-tested in src/lib/meeting/__tests__.
 *   What a grep can still do is notice when a load-bearing line is deleted.
 */

const root = path.resolve(import.meta.dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const player = read("src/components/rooms/meeting-record-panels.tsx");
const rail = read("src/components/rooms/meeting-reading-rail.tsx");
const transcript = read("src/components/rooms/meeting-transcript-panel.tsx");
const roomDetail = read("src/app/(app)/[workspaceSlug]/rooms/[id]/page.tsx");
const seek = read("src/lib/meeting/recording-seek.ts");

// 1. The silence that hid the whole feature: a <video> whose src has stopped opening.
assert.match(
  player,
  /onError=\{/,
  "The recording <video> must handle onError. A presigned link lasts fifteen minutes; without " +
    "this the frame goes black and nothing is reported — the exact silence that let a broken " +
    "seek feature look like a working one.",
);
assert.match(
  player,
  /Reload recording|reloadRecording/,
  "An expired link must offer a fresh one. Expiry is the ordinary outcome of leaving a record " +
    "page open, not a fault, and the reader needs the way forward rather than an apology.",
);

// 2. A reload must genuinely re-fetch. Storage can hand back a byte-identical presigned URL, in
//    which case React sees no src change and the element never retries — dropping `loaded` to null
//    unmounts it so the retry mounts a fresh one.
assert.match(
  player,
  /setLoaded\(null\)/,
  "reloadRecording must clear `loaded` before re-fetching, or an identical URL silently skips " +
    "the retry.",
);

// 3. "Nothing to play" is several different sentences.
assert.match(
  player,
  /unavailableReason\?:\s*"processing"\s*\|\s*"multiple"\s*\|\s*null/,
  "The player must accept why nothing is playable. Collapsing processing, multiple-recordings " +
    "and never-recorded into one blank frame is the bug this ticket existed to fix.",
);
assert.match(
  rail,
  /recordingUnavailableReason === "processing"/,
  "The reading rail's pip must open for a recording that is still processing. It gates on a " +
    "PLAYABLE recording, so without this the person who just left the meeting sees what an " +
    "unrecorded meeting shows.",
);

// 4. A meeting that was never recorded is read as a document. Nothing may look clickable.
assert.match(
  transcript,
  /if \(!onSeek\) \{\s*\n\s*return <span/,
  "TranscriptLineTime must degrade to plain text when no seek is offered. A timestamp that " +
    "still looks like a control on a meeting with no recording invites a click that cannot work.",
);
assert.doesNotMatch(
  roomDetail,
  /Cu.c h.p n.y kh.ng .*ghi h.nh/,
  "A meeting that was simply not recorded gets no notice at all — most meetings are never " +
    "recorded, and announcing the ordinary case turns a reading page into a warning.",
);

// 5. The refusals that keep a wrong seek from looking like a working one.
assert.match(
  seek,
  /return null/,
  "seekTargetSeconds must refuse rather than clamp. A seek to 0:00 for a moment outside the " +
    "recording plays the wrong sentence and nobody can tell.",
);
assert.match(
  roomDetail,
  /canSeekToRecording/,
  "Seeking must be gated on one derived answer. Several call sites each deciding for themselves " +
    "is how one of them ends up seeking into the wrong file.",
);
assert.match(
  roomDetail,
  /playableRecordingCount/,
  "More than one recording must withhold seeking: each file has its own start instant, and " +
    "measuring a late moment against the first file yields a plausible, positive, wrong offset.",
);

// 6. A cited moment resolves to the row that is actually in the DOM.
assert.match(
  roomDetail,
  /resolveCitationRowId/,
  "Jumping to a cited moment must resolve through the row that contains the segment. Rows carry " +
    "the id of their FIRST segment, so a mid-group citation resolves to no element and the jump " +
    "does nothing at all.",
);

console.log("Recording seek contract: PASS");
