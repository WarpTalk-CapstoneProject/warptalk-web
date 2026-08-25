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

console.log("Transcript speaker contract: PASS");
