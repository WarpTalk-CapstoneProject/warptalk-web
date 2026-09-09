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
  sync,
  /anchorForMs\(/,
  "The playing line must be resolved with anchorForMs — the rule the rail already uses. A second " +
    "implementation drifts by a turn and nothing on screen says which one is right.",
);
// And resolved in the PROVIDER, which is also what keeps the column still. The playhead arrives at
// 4 Hz and this context's value identity is what every consumer re-renders on: publishing the raw
// moment re-rendered six hundred transcript rows four times a second to recolour one of them.
// A key changes when the speaker line changes — once every twenty seconds or so.
assert.match(
  sync,
  /playingKey: string \| null/,
  "The sync must publish the playing BLOCK, not the playing millisecond — a 4 Hz value identity " +
    "re-renders the whole transcript column to change one line's colour.",
);
assert.doesNotMatch(
  sync,
  /^\s*playingMs,$/m,
  "playingMs must not be in the context value; it is an implementation detail of the conversion.",
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

/* ───────────────────────────────────────────────────────────────────────────────────────────────
   WAVE 3a — the past-the-end refusal, and where the number it needs comes from.

   `seekTargetSeconds` has refused a target beyond the end of the recording since Wave 1, and that
   branch had never executed. Nothing supplied a duration: there is no duration column, so
   `SeekSources.durationSeconds` was always undefined and every comparison against it was skipped.
   A moment spoken after the host stopped recording therefore produced a positive offset, the
   browser clamped `currentTime` to the end, and the reader was shown the final frame — a still
   picture of the meeting ending, indistinguishable from a seek that worked.

   The number now comes from the media element. That is enough to arm the refusal and deliberately
   not enough to pick between several recordings, which stays withheld (see 5 above).
   ─────────────────────────────────────────────────────────────────────────────────────────────── */

// 15. The player publishes the file's length, in the shape its two siblings already use.
assert.match(
  player,
  /onDurationSeconds\?:\s*\(seconds: number \| null\) => void/,
  "The player must publish the recording's duration as file seconds or null. Without it "
    + "seekTargetSeconds' past-the-end branch is unreachable, which is how a moment after the "
    + "recording stopped came to render as the final frame.",
);
// A duration is REVISED. A fragmented MP4 reports Infinity until enough of it has been read, and a
// fresh presigned url for the same recording starts over at NaN — so loadedmetadata alone leaves
// the length permanently unknown on exactly the containers the egress pipeline writes.
assert.match(
  player,
  /onDurationChange=\{/,
  "The player must listen for durationChange as well as loadedMetadata. A duration that starts as "
    + "Infinity and is corrected later would otherwise never reach the caller at all.",
);
assert.match(
  player,
  /Number\.isFinite\(seconds\) && seconds > 0 \? seconds : null/,
  "NaN and Infinity mean NOT KNOWN and must publish null. A non-finite number handed to the guard "
    + "makes every comparison false — the refusal looks armed and refuses nothing.",
);

// 16. The queued seek is checked by the PLAYER, because at that instant nothing else can.
//     A click before the file is fetched is held in pendingSeekRef; the page had no duration to
//     check it against, so the first click of every visit escapes the upstream guard entirely.
assert.match(
  player,
  /Number\.isFinite\(duration\) && duration > 0 && queued\.seconds > duration/,
  "A queued seek must be compared against the element's own duration before it is applied, or the "
    + "first click of every visit lands on the last frame with the browser's clamp doing the lying.",
);
// And it is a comparison of two FILE-axis numbers. Meeting arithmetic in this component would be a
// second subtraction of the two origins — see the header of recording-seek.ts for what that costs.
// Calls and imports, not prose: the prop's own doc comment has to be able to NAME the function
// upstream whose guard this one backs up.
assert.doesNotMatch(
  player,
  /(seekTargetSeconds|meetingMsFromRecordingSeconds)\(|from "@\/lib\/meeting\/recording-seek"/,
  "The player must never do meeting-axis arithmetic. It compares an offset into this file against "
    + "this file's length; the two clocks meet in recording-seek.ts and nowhere else.",
);
// The two origins are the page's, and a player holding either of them is a player one edit away
// from subtracting them.
assert.doesNotMatch(
  player,
  /(sources|artifact)\.(timelineAnchorAt|recordingStartedAt)/,
  "The player must not read either clock origin. Wave 2 kept the file axis on this side of the "
    + "boundary on purpose; a highlight or a seek computed here would drift from the one that is not.",
);

// 17. The duration enters the ONE seekSources memo, not a second object built beside it.
assert.match(
  roomDetail,
  /durationSeconds: recordingDurationSeconds/,
  "The duration must land in the same seekSources the seek and the follow-along both read. A "
    + "second sources object is two answers to where the recording starts and how long it runs.",
);

/* ───────────────────────────────────────────────────────────────────────────────────────────────
   WAVE 3b — `?t=`, a link to a moment.

   There was no way to share a moment: seek state was React-local, so "look at the bit where we
   decided X" was a sentence and a stopwatch. Everything below is a decision that a later,
   reasonable-looking edit would undo — and three of them are decisions about RESTRAINT, which is
   the kind that gets edited away first because nothing visibly breaks when it does.
   ─────────────────────────────────────────────────────────────────────────────────────────────── */

const momentLink = read("src/lib/meeting/moment-link.ts");

// 18. The parsing is pure and it is TESTED. This repo's runner cannot parse JSX, which is why
//     anything worth testing lives in src/lib/** — a regex inlined in the page would be a rule
//     nothing can exercise, and "what does a mangled ?t= do" is the whole risk of this feature.
assert.match(
  momentLink,
  /export function parseMomentParam/,
  "The `?t=` parsing must live in src/lib/meeting/moment-link.ts. Inlined in the page it cannot be "
    + "unit-tested — the test runner cannot parse JSX — and the malformed-value cases are the point.",
);
assert.match(
  roomDetail,
  /parseMomentParam\(/,
  "The page must read `?t=` through the tested parser rather than its own Number() call.",
);
assert.doesNotMatch(
  roomDetail,
  /Number\.parseInt\([^)]*MOMENT_PARAM|get\("t"\)/,
  "The page must not hand-roll the parse. `Number()` accepts \"\", \"0x10\" and \"1e3\", and an "
    + "empty string reading as 0 IS the jump-to-0:00 failure arriving through the front door.",
);

// 19. The MEETING axis, not the file axis. A file-axis number stops meaning anything the moment the
//     recording is replaced, trimmed or joined by a second run; the meeting axis is the clock the
//     transcript is written in, so the link still names the same sentence afterwards.
assert.match(
  momentLink,
  /meeting/i,
  "moment-link must say which axis `?t=` is on. A parameter whose axis is not written down is a "
    + "parameter somebody will helpfully 'fix' to video.currentTime.",
);
assert.doesNotMatch(
  momentLink,
  /currentTime|durationSeconds|seekTargetSeconds\(/,
  "moment-link must not touch the file axis or the clock arithmetic. It parses and formats a moment; "
    + "recording-seek.ts is the only place the two clocks meet.",
);

// 20. A malformed value does NOTHING. Not a toast, and above all not a jump to 0:00 — which is a
//     real moment, and would tell the reader by the page's own behaviour that the link pointed there.
assert.match(
  momentLink,
  /^const SECONDS_PATTERN = \/\^\\d\+\(\?:\\\.\\d\+\)\?\$\//m,
  "The accepted shape must stay narrower than Number(). Widening it to Number() readmits \"\" as 0, "
    + "which is the silent jump to the top of the meeting this refuses.",
);
assert.match(
  roomDetail,
  /if \(atMs === null\) return;/,
  "A `?t=` that does not parse must leave the page exactly as it found it — no seek, no toast, no "
    + "jump to 0:00. A bad parameter is a mangled copy-paste, not an error a reader can act on.",
);

// 21. Read once, then taken out of the URL. A parameter that lingers re-fires on every internal
//     navigation back to this page — leave the record, come back, get yanked to a stale moment.
assert.match(
  roomDetail,
  /withMomentParam\(window\.location\.search, null\)/,
  "The parameter must be removed once it has been honoured, or returning to this page re-fires it.",
);
assert.match(
  roomDetail,
  /router\.replace\(\s*`\$\{window\.location\.pathname\}\$\{query \? `\?\$\{query\}` : ""\}`,\s*\{ scroll: false \},?\s*\)/,
  "Both the write-back and the removal must be router.replace with scroll:false — push would make "
    + "the back button walk through every timestamp clicked, and the default scroll-to-top would "
    + "undo the very scroll the link exists to perform.",
);

/* 22. It is the page's own URL and nothing is minted. Access stays whatever already gates this page.

   Pinned as BEHAVIOUR, not as prose. An assertion that greps a comment's wording fails when
   somebody tidies the wording, and a contract test that cries over a rewrite is one people learn
   to ignore — which costs more than the assertion was ever worth. What actually has to hold is
   that this module only ever hands back a URL derived from one it was given, and never assembles
   an origin of its own. */
assert.doesNotMatch(
  momentLink,
  /https?:\/\/|new URL\((?![^)]*current)|window\.location|process\.env\.[A-Z_]*URL/,
  "moment-link must not build an absolute URL from anything but the URL it was handed. 'Share a "
    + "moment' is exactly the feature that grows a public-link mode by accident, one request at a "
    + "time, and the first step is always a hard-coded origin.",
);

// 23. The arrival reuses jumpToTranscriptMoment. It is the one path from a moment to the row that
//     actually exists in the DOM (see 6), and it is also what makes `?t=` work with no video at all:
//     the seek half declines, the scroll half does not.
assert.match(
  roomDetail,
  /arrivingFromMomentLinkRef\.current = true;\s*\n\s*try \{\s*\n\s*jumpToTranscriptMoment\(atMs\);/,
  "The `?t=` arrival must go through jumpToTranscriptMoment. A second scroll path reintroduces the "
    + "mid-group citation bug, and skipping it loses the scroll — which is the whole of the feature "
    + "on a meeting with no recording.",
);
// And it must not write back the parameter it is consuming, or the removal above accomplishes
// nothing and the link re-fires on every return to the page after all.
assert.match(
  roomDetail,
  /if \(arrivingFromMomentLinkRef\.current\) return;/,
  "The write-back must stand down while an arrival is being applied. Otherwise the arrival re-mints "
    + "the parameter it just consumed and the removal is a no-op.",
);

console.log("Recording seek contract: PASS");
