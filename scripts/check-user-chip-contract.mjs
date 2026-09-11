#!/usr/bin/env node
/**
 * A person's name is never a dead end.
 *
 * WHY THIS EXISTS
 *   "WRJ · Ngô Xuân Hạnh Nhi" under a meeting title on a record page. That is who hosted it, and
 *   it was all you were ever going to get: not their address, not their role in the workspace,
 *   not whether they are online right now. Every list had its own spelling of the same dead end —
 *   the record card's host line, a capsule in the meetings list, "Hosted by {name}" on the
 *   schedule, a name-and-face `<div>` with a `title` attribute in the documents table that
 *   hovered to show you the name it was already showing.
 *
 *   The room detail page had had the right answer since WT-641: a card carrying the face, the
 *   address, the role, the status and the meeting languages. It was private markup inside a
 *   2,100-line page file, so nothing else could reach it — which is why every other surface
 *   reinvented the dead end instead. It is now `UserChipCard`, and that page reuses it.
 *
 * THE RULES
 *   1. There is ONE chip, and it lives in `src/components/user/user-chip.tsx`. Not a helper the
 *      next page copies; the component the next page imports.
 *   2. It opens something. A chip that is only a differently-styled label is the thing this
 *      replaces.
 *   3. It answers "and what is their status" from presence, not from a prop the caller invents.
 *   4. Its trigger is NOT a native button. Most of these names sit inside a row that is already a
 *      <Link>, and a <button> inside an <a> is invalid HTML — so the chip renders a span and Base
 *      UI supplies the button role, the same arrangement the sidebar's account card uses.
 *   5. Presence is resolved when the card OPENS, not when a row renders. `useMemberPresence`
 *      guards against re-requesting per hook instance, so a chip that subscribed on render would
 *      fire one lookup per row — fifty requests to draw a list nobody has clicked.
 *   6. The CARD is separately exported, because the trigger is not always a chip. The room
 *      roster is a list of full-width rows on purpose (WT-641: a row is a bigger hit target than
 *      a name, and a capsule reads as a removable token in a "To:" field). It owns its trigger
 *      and reuses the card — which is only possible because the card is not welded to the chip.
 *   7. Every surface that prints somebody else's name renders the chip. Named here, one by one,
 *      because "we'll remember" is what produced five different dead ends.
 *
 * NOT IN SCOPE, DELIBERATELY
 *   Surfaces where the profile is already open on the page — the Members directory, the sidebar's
 *   member panel, the live People panel — show the face, the presence dot, the address and the
 *   role in the row itself. A popover there would hide behind a click what is already visible.
 *   The saved transcript is excluded too: it has its own speaker identity system (a colour per
 *   speaker, a stripe down their turn) pinned by check-transcript-speaker-contract, and a speaker
 *   there can be a pseudonym rather than a person. Minutes and action-item owners are free text
 *   the meeting produced, which may match no person at all — the UI already says so.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

// ---------------------------------------------------------------------------
// 1-6. The chip itself.
// ---------------------------------------------------------------------------
const CHIP = "src/components/user/user-chip.tsx";
assert.ok(
  fs.existsSync(path.join(root, CHIP)),
  `${CHIP} must exist — it is the one place a person's name reaches the screen.`,
);
const chip = read(CHIP);

assert.ok(
  chip.includes("<PopoverTrigger") && chip.includes("<PopoverContent"),
  "The chip must OPEN something. Without the popover it is a label with a hover state, which is"
    + " exactly what it replaced.",
);

assert.ok(
  chip.includes("useMemberPresence("),
  "The chip must answer 'what is their status' from presence, not from a caller-supplied string.",
);

assert.ok(
  /nativeButton=\{false\}/.test(chip) && /render=\{<span \/>\}/.test(chip),
  "The trigger must render a span with nativeButton={false}. These names sit inside rows that are"
    + " <Link>s, and a <button> nested in an <a> is invalid HTML.",
);

// The card is separately exported, which is what makes both rule 5 and rule 6 true: it mounts on
// open (so the presence hook does not run per row) and a non-chip trigger can reuse it.
assert.ok(
  /export function UserChipCard\(/.test(chip),
  "The popover body must be its own EXPORTED component. Inlining it puts useMemberPresence in the"
    + " chip itself — a fifty-row list then fires fifty presence lookups before anyone clicks —"
    + " and leaves the room roster's row trigger with no card to open but a copied one.",
);
assert.ok(
  !/export function UserChip\([\s\S]{0,2000}useMemberPresence\(/.test(chip),
  "UserChip must not call useMemberPresence directly — see above; that is the trigger, and it"
    + " renders once per row.",
);

// The trigger's dot reads the store and never fetches, for the same reason.
assert.ok(
  chip.includes("usePresenceStore("),
  "The trigger's presence dot must READ the presence store rather than resolve it, so a list of"
    + " chips costs nothing until one is opened.",
);

// ---------------------------------------------------------------------------
// 7. The surfaces.
// ---------------------------------------------------------------------------
const SURFACES = [
  [
    "src/app/(app)/[workspaceSlug]/artifacts/[roomId]/page.tsx",
    "the record page's `CODE · host` line — the one in the bug report",
  ],
  [
    "src/components/artifacts/artifact-card.tsx",
    "the record card's host line",
  ],
  [
    "src/app/(app)/[workspaceSlug]/rooms/page.tsx",
    "the meetings list host capsule",
  ],
  [
    "src/app/(app)/[workspaceSlug]/schedules/page.tsx",
    "the schedule's week card and past-meeting dialog",
  ],
  [
    "src/components/schedules/agenda-row.tsx",
    "the agenda row's \"Invited by\" host — also the month view's day pane",
  ],
  [
    "src/app/(app)/[workspaceSlug]/rooms/[id]/MeetingPropertiesPills.tsx",
    "the host pill beside a meeting's title",
  ],
  [
    "src/app/(app)/[workspaceSlug]/documents/page.tsx",
    "the documents table's Uploaded by / Approved by columns",
  ],
  [
    "src/components/documents/document-actor.tsx",
    "the document card's uploader and approver",
  ],
  [
    "src/app/(app)/[workspaceSlug]/documents/[documentId]/components/DocumentSidePanel.tsx",
    "the document's allow / deny access lists",
  ],
];

for (const [file, what] of SURFACES) {
  assert.match(
    read(file),
    /<UserChip\b/,
    `${what} must render the shared chip (${file}). A name printed as text there is a dead end —`
      + " that is the whole reason this component exists.",
  );
}

// The room detail page is where the card came FROM, so it is pinned differently: it keeps its own
// row trigger and must no longer carry a second copy of the card.
const roomDetail = read("src/app/(app)/[workspaceSlug]/rooms/[id]/page.tsx");
assert.ok(
  roomDetail.includes("<UserChipCard"),
  "The room roster must open the SHARED card. A local copy is how the good version came to be"
    + " unreachable from everywhere else in the first place.",
);
assert.ok(
  !/function InlineChip\(/.test(roomDetail),
  "InlineChip moved into the shared card with the role and status tags it drew.",
);
assert.ok(
  roomDetail.includes("<PersonAvatar"),
  "The roster row keeps its own avatar and presence dot — the row is the trigger there, not a"
    + " chip (WT-641). Losing this means the capsule came back.",
);

// The exact dead ends that were replaced, so a revert is loud.
const REPLACED = [
  [
    "src/app/(app)/[workspaceSlug]/artifacts/[roomId]/page.tsx",
    /\{group\.hostName \? ` · \$\{group\.hostName\}` : ""\}/,
    "the record page printing the host as the tail of a string",
  ],
  [
    "src/app/(app)/[workspaceSlug]/schedules/page.tsx",
    /<span>Hosted by \{meeting\.hostName\}<\/span>/,
    "the schedule detail printing the host as bare text",
  ],
  [
    "src/app/(app)/[workspaceSlug]/rooms/[id]/MeetingPropertiesPills.tsx",
    /room\.hostId\.charAt\(0\)/,
    "the host pill falling back to the first character of a raw UUID",
  ],
];

for (const [file, pattern, what] of REPLACED) {
  assert.ok(!pattern.test(read(file)), `${what} is back in ${file}.`);
}

// resolveRoomHost feeds the meetings list. It has to hand over the id and the address, or the
// chip it fills has nothing behind the name.
const roomHost = read("src/lib/meeting/room-host.ts");
for (const field of ["userId:", "email:"]) {
  assert.ok(
    roomHost.includes(field),
    `resolveRoomHost must return \`${field}\` — the chip keys presence on the id and puts the`
      + " address under the name, and a caller given only { name, avatarUrl } can supply neither.",
  );
}

console.log("User chip contract: PASS");
