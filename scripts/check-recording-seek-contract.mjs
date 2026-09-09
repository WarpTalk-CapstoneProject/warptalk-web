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

/* ───────────────────────────────────────────────────────────────────────────────────────────────
   WAVE 2 — the transcript follows the recording as it plays.

   Wave 1 was transcript → video. This is video → transcript, and everything below is a rule about
   RESTRAINT rather than about capability: the feature is easy to build and easy to make hateful.
   Each assertion pins a decision that a later, reasonable-looking edit would undo.
   ─────────────────────────────────────────────────────────────────────────────────────────────── */

const sync = read("src/components/rooms/transcript-reading-sync.tsx");

// 7. Two clocks, two functions, one file. An inverse computed at a call site is an inverse that
//    drifts — and a drifting one renders as a highlight a sentence behind the audio, which reads as
//    sloppy timings rather than as a bug and so never gets reported.
assert.match(
  seek,
  /export function meetingMsFromRecordingSeconds/,
  "The file→meeting conversion must live beside its inverse in recording-seek.ts, so the pair " +
    "cannot drift apart.",
);
assert.match(
  sync,
  /meetingMsFromRecordingSeconds\(/,
  "The playhead must be converted inside the provider — one conversion site, for the same reason " +
    "the ms→block rule has one.",
);
assert.doesNotMatch(
  transcript,
  /meetingMsFromRecordingSeconds|currentTime/,
  "The transcript column must receive a MEETING moment, never do the clock arithmetic itself. Two " +
    "places subtracting two origins is how one of them ends up subtracting them the wrong way round.",
);

// 8. The playing line resolves through the SAME rule as a summary citation. A second ms→line
//    resolver was called out in transcript-reading-sync.tsx as the likeliest way for this feature
//    to end up quietly off by one turn.
assert.match(
  transcript,
  /anchorForMs\(/,
  "The playing line must be resolved with anchorForMs — the rule the rail already uses. A second " +
    "implementation drifts by a turn and nothing on screen says which one is right.",
);

// 9. The mark is a TEXT COLOUR. Background is spoken for twice over in this column already (hover,
//    and the row a citation jumped to), and a mark that moves every twenty seconds is a strobe.
assert.match(
  transcript,
  /playing \? "text-primary/,
  "The playing line must be marked with a text colour. A third meaning on the background is how a " +
    "reader stops being able to tell any of them apart.",
);
assert.doesNotMatch(
  transcript,
  /playing \? "bg-|playing \?\s*\n?\s*"bg-/,
  "The playing line must NOT take a background — that property already carries hover and the " +
    "citation landing.",
);

// 10. Nothing runs while the recording is paused, and the player is what knows.
assert.match(
  player,
  /onTimeUpdate=\{\(event\) => \{\s*\n\s*if \(event\.currentTarget\.paused\) return;/,
  "The playhead must not be published while the element is paused. `timeupdate` also fires for a " +
    "seek made while paused, and honouring it drags a reader who paused and scrolled away back.",
);
assert.match(
  player,
  /onPause=\{\(\) => onPlayingChange\?\.\(false\)\}/,
  "The player must publish that it stopped. Following, and the pill that offers it back, both hang " +
    "off a fact only the media element has.",
);

// 11. A manual scroll takes following off — and it must listen for a HAND, not for `scroll`. The
//     auto-scroll fires `scroll` itself, so listening for that switches following off the first
//     time it works.
assert.match(
  transcript,
  /addEventListener\("wheel", stopFollowing[\s\S]{0,160}?addEventListener\("touchmove", stopFollowing/,
  "Following must be cancelled by wheel and touchmove. `scroll` is fired by the auto-scroll " +
    "itself and would cancel following the moment it succeeded.",
);
assert.doesNotMatch(
  transcript,
  /addEventListener\("scroll", stopFollowing/,
  "Do not cancel following on `scroll` — the feature's own scrolling raises it.",
);

// 12. The pill is gated on BOTH conditions. Off-and-paused has nothing to catch up with, and a
//     control offering to chase a stopped playhead is a control that appears to do nothing.
assert.match(
  transcript,
  /!isFollowing && isPlaying/,
  "The follow pill must require following to be OFF and the recording to be PLAYING. Either " +
    "condition alone offers a chase after a playhead that is not moving.",
);
assert.match(
  transcript,
  /Follow playback/,
  "The pill must say what it does, in the English every other string in this panel is written in.",
);

// 13. A meeting with no recording has nothing playing in it, so nothing in it may light up. Same
//     rule as the plain-span timestamp above, one direction later.
assert.match(
  transcript,
  /const canFollowPlayback = Boolean\(onSeekToRecording\)/,
  "Following must be gated on the same answer the seek is. A meeting read as a document must not " +
    "have a line light up as 'playing' when there is nothing behind it to play.",
);

// 14. Reduced motion. This surface scrolls itself, unprompted, every twenty seconds while a
//     recording plays — the one place in the record where the setting is not a nicety.
assert.match(
  transcript,
  /prefersReducedMotion\(\) \? "auto" : "smooth"/,
  "Auto-scrolling must honour prefers-reduced-motion.",
);

console.log("Recording seek contract: PASS");
