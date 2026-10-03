#!/usr/bin/env node
/**
 * A transcript says who is speaking in a way you can see without reading.
 *
 * WHY THIS EXISTS
 *   The saved transcript printed a name above every line and nothing else. That answers "who said
 *   this line" and is no help at all with the question people actually ask of a long meeting —
 *   where does this person stop talking and the other one start. Somebody following a paragraph
 *   that runs for ten lines had to re-read the name at the top of each to stay oriented, because a
 *   name is a word: it takes reading, not glancing.
 *
 * THE RULES
 *   1. Every speaker has a colour, derived from their id rather than stored. Same person, same
 *      colour, in every meeting and for every reader, with nothing to keep in step.
 *   2. The colour runs the HEIGHT of what they said — a stripe beside their lines and their
 *      bubbles, the rail beside their turn on the timeline. A mark that appears once at the top is
 *      the name again in another form.
 *   3. All three layouts carry it. The whole point is that switching layout does not lose the one
 *      cue that made a long meeting followable.
 *   4. Both themes define the palette. The light values are unreadable on #0f1011 and the dark
 *      ones wash out on white, so this is two palettes and not one reused.
 *   5. The face comes from the workspace member list, because that is the only place one lives —
 *      the participants API carries no avatar at all. Most people have no picture, so the colour
 *      has to work without one.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const panel = read("src/components/rooms/meeting-transcript-panel.tsx");
const avatar = read("src/components/rooms/transcript-speaker-avatar.tsx");
const colors = read("src/lib/transcript/speaker-color.ts");
const globals = read("src/app/globals.css");
const roomDetail = read("src/app/(app)/[workspaceSlug]/rooms/[id]/page.tsx");
const preview = read("src/app/dev/transcript-preview/page.tsx");

// 1. The colour is derived, not stored.
assert.ok(
  colors.includes("export function speakerColorIndex"),
  "A speaker's colour must be derived from their id — anything stored needs a column, a migration"
    + " and a picker for something nobody wants to choose.",
);
assert.ok(
  /hash \^= id\.charCodeAt/.test(colors),
  "It must hash the whole id. UUIDv7 ids minted moments apart share a long prefix, and a hash that"
    + " weights position poorly collapses a room onto one colour.",
);

// 2 & 3. The mark runs the height of a turn, in every layout.
const stripes = panel.match(/<TranscriptSpeakerStripe/g) ?? [];
assert.ok(
  stripes.length >= 2,
  "The chat and document layouts must each draw the speaker's stripe beside what they said, so a"
    + " paragraph is one visible block rather than N identical rows.",
);
assert.ok(
  panel.includes('"absolute w-[2px] rounded-full"'),
  "The timeline rail must still be the full-height element beside a turn, not a mark at the top of"
    + " it — a cue that appears once is the name again in another form.",
);
assert.ok(
  (panel.match(/speakerColorVar\(speaker\.id\)/g) ?? []).length >= 2,
  "The rail AND the dot must both take the speaker's colour; colouring one of them leaves the"
    + " timeline half-marked.",
);

const avatars = panel.match(/<TranscriptSpeakerAvatar/g) ?? [];
assert.ok(
  avatars.length >= 3,
  `All three layouts must show the face: chat, document and timeline — found ${avatars.length}.`
    + " A cue that survives only one of them is lost the moment a reader switches view.",
);

// 4. Two palettes, not one reused.
for (const index of [1, 2, 3, 4, 5, 6]) {
  const occurrences = globals.match(new RegExp(`--speaker-${index}:`, "g")) ?? [];
  assert.equal(
    occurrences.length,
    2,
    `--speaker-${index} must be defined once for light and once for dark; found ${occurrences.length}.`,
  );
}

// 5. The face comes from the only place one exists.
assert.ok(
  /speakerDirectory[\s\S]{0,600}members\?\.items/.test(roomDetail),
  "The transcript's faces must come from the workspace member list — transcript_segments records a"
    + " user id and the participants API carries no avatar at all.",
);
assert.ok(
  !panel.includes("useWorkspaceMembers"),
  "The panel takes the directory as a prop and must not fetch one of its own — it renders inside"
    + " the live meeting too, where that query does not belong.",
);
assert.ok(
  /resolveTranscriptSpeaker\(/.test(panel),
  "Speakers must resolve through the one function that decides name-vs-directory precedence.",
);
assert.ok(
  avatar.includes("speaker.avatarUrl ? <AvatarImage"),
  "No <AvatarImage> without a URL: base-ui keeps the fallback mounted until an image resolves, and"
    + ' an <img src=""> resolves against the page URL and logs a failed request every render.',
);

// The preview has to show BOTH states, because "initials in the speaker's colour" is what this
// surface looks like for almost everybody — an avatar is something a person uploads and most never
// do — and it has to look finished rather than broken.
assert.ok(
  /avatarUrl: null/.test(preview) && /avatarUrl: AVATAR_/.test(preview),
  "The dev preview must render a speaker with a picture AND one without.",
);

// 6. The Google Meet side of a bridge room is many people behind ONE participant id (the stand-in).
//    Every name, grouping and colour goes through speaker-identity.ts, so no surface can key them by
//    the shared id (all Meet lines merge into one turn) or print the roster's seat name ("External
//    Meeting") over the Meet person the gateway put on the line.
const display = read("src/lib/transcript/transcript-display.ts");
const documentReading = read("src/lib/transcript/document-reading.ts");
const liveOverlay = read("src/components/rooms/live/live-subtitle-overlay.tsx");
const livePanel = read("src/components/rooms/live/side-panel/transcript-panel.tsx");
const transcriptsHook = read("src/hooks/use-transcripts.ts");
// The bridge popup over Meet: the surface where Meet speakers are read most.
const widgetBubble = read("src/components/rooms/bridge/widget/transcript/widget-transcript-bubble.tsx");
const catalogs = ["en", "vi", "ja"].map((locale) => [
  locale,
  JSON.parse(read(`messages/${locale}/meetingTranscript.json`)),
]);

assert.ok(
  /isBridgeStandInSpeaker\(segment\.speakerId\)[\s\S]{0,400}?return transcriptSpeakerDisplayName/.test(display)
    && display.indexOf("isBridgeStandInSpeaker(segment.speakerId)")
      < display.indexOf(".find((participant) => participant.userId === segment.speakerId)"),
  "resolveTranscriptSpeakerName must answer for the Google Meet stand-in BEFORE it asks the roster —"
    + ' the roster names that seat "External Meeting", and the segment carries the real Meet person.',
);
for (const [file, source, minimum] of [
  ["transcript-display.ts", display, 4],
  ["document-reading.ts", documentReading, 1],
  ["live-subtitle-overlay.tsx", liveOverlay, 1],
]) {
  const uses = (source.match(/transcriptSpeakerKey\(/g) ?? []).length;
  assert.ok(
    uses >= minimum,
    `${file} must key speakers through transcriptSpeakerKey (found ${uses}, need ${minimum}) — keyed by`
      + " participant id alone, two Google Meet people merge into one turn under the first one's name.",
  );
}
assert.ok(
  !/speakerParticipantId \?\? (previous|next|segment|line)\.speakerName/.test(display + documentReading),
  "A speaker identity must not be rebuilt inline as `speakerParticipantId ?? speakerName` — that is"
    + " the rule that merged every Meet speaker. Use transcriptSpeakerKey.",
);
assert.ok(
  (panel.match(/speakerLabels/g) ?? []).length >= 6,
  "The record panel must hand its translated speaker labels to every resolution — rows, turns, the"
    + " .txt and the .docx — or a Meet line nobody identified prints in English, or as an id.",
);
assert.ok(
  livePanel.includes("useTranscriptSpeakerIdentity(")
    && widgetBubble.includes("useTranscriptSpeakerIdentity(")
    && liveOverlay.includes("transcriptIdentityFor("),
  "The live transcript and the caption lane must draw a Meet line's face from the line, not from the"
    + " stand-in's roster row — otherwise every Meet speaker is one \"EM\" monogram.",
);
for (const [locale, catalog] of catalogs) {
  assert.ok(
    typeof catalog.speaker?.googleMeetParticipants === "string" && catalog.speaker.googleMeetParticipants,
    `messages/${locale}/meetingTranscript.json must carry speaker.googleMeetParticipants.`,
  );
}
assert.ok(
  /export function useTranscriptSegments[\s\S]{0,1200}?refetchOnWindowFocus: true/.test(transcriptsHook),
  "Saved segments must re-read on focus: the post-meeting Meet relabel has no realtime event, and"
    + " without it the record keeps the names it loaded until a hard reload.",
);

console.log("Transcript speaker contract: PASS");
