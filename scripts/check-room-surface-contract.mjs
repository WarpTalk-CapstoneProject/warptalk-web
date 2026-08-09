/**
 * WT-272 / WT-273 / WT-274 / WT-197 — room surface contract.
 *
 * These four defects all came from a surface deciding something for itself that another
 * surface had already decided differently. The assertions below are the shape of the fix, not
 * the fix itself: they fail the moment a component starts re-deriving occupancy, or the join
 * CTA goes back to being reachable only from the bottom of the sticky right column.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (relative) =>
  fs.readFileSync(path.join(root, relative), "utf8");

const occupancy = read("src/lib/meeting/room-occupancy.ts");
const occupancyHook = read("src/hooks/use-room-occupancy.ts");
const access = read("src/lib/meeting/translation-room-access.ts");
const roomDetail = read(
  "src/app/(app)/[workspaceSlug]/rooms/[id]/page.tsx",
);
const pills = read(
  "src/app/(app)/[workspaceSlug]/rooms/[id]/MeetingPropertiesPills.tsx",
);
const roomsList = read("src/app/(app)/[workspaceSlug]/rooms/page.tsx");
const waitingRoom = read(
  "src/app/(app)/[workspaceSlug]/rooms/[id]/waiting/page.tsx",
);
const liveSession = read(
  "src/components/rooms/live/persistent-meeting-session.tsx",
);
const controlBar = read("src/components/rooms/live/meeting-control-bar.tsx");

// ── WT-274: one definition of "in this room" ────────────────────────────────

assert.match(
  occupancy,
  /export const SEAT_HOLDING_STATUSES = \["connected"\] as const;/,
  "The seat rule must stay CONNECTED-only, matching the backend's ratified " +
    "TranslationRoomParticipantStatuses.SeatHolding (WT-262/263).",
);

for (const [name, source] of [
  ["room detail page", roomDetail],
  ["meetings list row", roomsList],
]) {
  assert.match(
    source,
    /useRoomOccupancy\(/,
    `${name} must read occupancy from the shared hook, not compute it.`,
  );
}

for (const [name, source] of [
  ["waiting room", waitingRoom],
  ["live meeting session", liveSession],
]) {
  assert.match(
    source,
    /roomOccupancy\(\{/,
    `${name} must read occupancy from the shared module, not compute it.`,
  );
}

// The three surfaces that disagreed on screen (header chip 1/100, Tracking panel
// "Attendees: 0", list row 0/100) must all render the one formatted label.
assert.match(
  pills,
  /occupancyLabel: string;[\s\S]*\{occupancyLabel\}/,
  "The header chip must render the shared occupancy label, not a count it formats itself.",
);
// WT-330(5): the heading says "Participants" now. It was the page's only "Attendees", and the
// seat rule, the roster panel and the pills row all say participants. The assertion that matters
// is unchanged — the panel renders the SHARED label and does not count for itself.
assert.match(
  roomDetail,
  /Participants: \$\{occupancy\.label\}/,
  "The Tracking panel must render the shared occupancy label.",
);
// Scoped to the rendered label, not the word. Two comments still say "Attendees" on purpose:
// they are WT-274's account of the three surfaces that disagreed ("the Tracking panel said
// `Attendees: 0`") and WT-191's account of the duplicated invitee row. Those describe what the
// UI used to say, which is exactly the history a future reader needs; renaming the word inside
// them would make the record wrong to protect a lint.
assert.doesNotMatch(
  roomDetail,
  /Attendees: [{$]/,
  "WT-330(5): this page renders 'Participants'. 'Attendees' is not a second word for it.",
);
assert.match(
  roomsList,
  /\{occupancy\.label\}/,
  "The meetings list row must render the shared occupancy label.",
);

// The private status filters these surfaces used to carry must not come back.
for (const [name, source] of [
  ["room detail page", roomDetail],
  ["waiting room", waitingRoom],
  ["live meeting session", liveSession],
]) {
  assert.doesNotMatch(
    source,
    /\["joined",\s*"connected"\]/,
    `${name} must not re-introduce its own "joined"/"connected" presence filter — ` +
      `"joined" is not even a backend participant status.`,
  );
}
assert.doesNotMatch(
  liveSession,
  /!\["left",\s*"removed",\s*"kicked"\]\.includes/,
  "The live session must not go back to counting everyone who has not left as present.",
);

// ── WT-273: the host is not told to wait for himself ────────────────────────

assert.match(
  access,
  /export function shouldEnterWaitingRoom\(\s*status: TranslationRoomStatus,\s*options\?: \{ isHost\?: boolean \},\s*\): boolean \{\s*if \(options\?\.isHost\) return false;/,
  "shouldEnterWaitingRoom must short-circuit for the host.",
);
assert.match(
  access,
  /mode: "host_start",\s*label: "Start meeting"/,
  "A host looking at a room that has not started must be offered the start action.",
);
assert.match(
  roomDetail,
  /resolveRoomEntryIntent\(\{[\s\S]{0,200}?isHost,/,
  "The room detail CTA must resolve its intent with the viewer's host identity.",
);
assert.doesNotMatch(
  roomDetail,
  /"Enter waiting room"/,
  "The CTA label must come from the shared intent, not be inlined in the page.",
);

// ── WT-197: joining is discoverable above the fold ──────────────────────────

const asideIndex = roomDetail.indexOf("<aside");
assert.ok(asideIndex > 0, "The room detail page should still have a right column.");
const headerRegion = roomDetail.slice(0, asideIndex);
assert.match(
  headerRegion,
  /<RoomEntryButton/,
  "The primary join/start action must render in the page header, above the fold — " +
    "not only inside the last panel of the sticky right column (WT-197).",
);
// WT-330(1,2): this assertion used to require the OPPOSITE — "The Meeting access panel must keep
// its copy of the action." It is inverted deliberately, and the reversal is the point of the
// change, so it is written down rather than quietly dropped.
//
// WT-197 promoted the CTA into the header but left the original at the bottom of the sticky
// right column, and pinned both. That solved discoverability and created a duplicate: the page
// offered "Enter waiting room" twice, and the lower copy still sat below the fold behind that
// column's own scrollbar — the exact clipping WT-197 set out to fix, now on a button that no
// longer needed to exist. The product owner reported both halves as one defect.
//
// What WT-197 actually cared about — the action is reachable without scrolling — is asserted
// above, on the header region, and is untouched. This adds the other half: exactly one.
assert.doesNotMatch(
  roomDetail.slice(asideIndex),
  /<RoomEntryButton/,
  "The room's primary action must render ONCE, in the header. A second copy in the right " +
    "column is the duplicate CTA from WT-330(2), and its old home below the fold is the " +
    "clipping from WT-330(1).",
);
assert.equal(
  roomDetail.split("<RoomEntryButton").length - 1,
  1,
  "Exactly one RoomEntryButton may be rendered on the room detail page.",
);
assert.match(
  roomDetail,
  /function RoomEntryButton\(/,
  "The action stays a named component — the waiting room and the list link to the same intent.",
);

// ── WT-272: host controls are a real, findable menu ─────────────────────────

assert.match(
  controlBar,
  /id="meeting-host-controls-menu"[\s\S]{0,400}?role="menu"/,
  "The host controls flyout must be announced as a menu.",
);
assert.match(
  controlBar,
  /aria-haspopup=\{hasPopup \? "menu" : undefined\}[\s\S]{0,200}?aria-expanded=/,
  "The host controls trigger must expose its popup and expanded state.",
);
assert.match(
  controlBar,
  /role=\{toggle \? "menuitemcheckbox" : "menuitem"\}/,
  "Host control rows must be menu items, and the toggles must report their state.",
);
assert.match(
  controlBar,
  /function useFlyoutDismiss\([\s\S]{0,900}?event\.key === "Escape"/,
  "The host controls flyout must be dismissable by Escape and by clicking outside it — " +
    "re-clicking the trigger being the only way out is what made it look like a no-op.",
);
assert.match(
  liveSession,
  /muteOnEntryOverride \?\? Boolean\(meetingSession\?\.muteOnEntry\)/,
  "Mute-on-entry must read the room's persisted setting until the host overrides it, or the " +
    "flyout lies about the current state and the host's first tap appears to do nothing.",
);

// ── the hook must not leak the rule back out to callers ─────────────────────

assert.doesNotMatch(
  occupancyHook,
  /status\s*===\s*"/,
  "The occupancy hook must delegate the seat rule to room-occupancy.ts, never restate it.",
);

// ── WT-330: the room detail cleanup ────────────────────────────────────────

// (3) The main column's "People" row listed the same identities the right column's Tracking
// panel already lists — through the same UserChip — but capped at 8. One roster, in the column
// that splits it by who actually holds a seat.
assert.doesNotMatch(
  roomDetail,
  /label="People"/,
  "The main column must not re-list the roster the Tracking panel owns (WT-330(3)).",
);
assert.doesNotMatch(
  roomDetail,
  /participants\s*\n?\s*\.slice\(0, 8\)/,
  "The capped 8-chip roster must not come back.",
);

// (4) There is no virtual bridge. The row named a place that does not exist, and its own icon
// had already been changed once to stop claiming otherwise.
assert.doesNotMatch(
  roomDetail,
  /Virtual Audio Bridge/,
  "The hardcoded 'Where — Virtual Audio Bridge' row must stay gone (WT-330(4)).",
);
assert.doesNotMatch(
  roomDetail,
  /label="Where"/,
  "The page must not claim a location for a meeting that has none.",
);

// (6) The Tracking panel's chevrons must open something. They were static glyphs on two
// headings — the app's own "this opens" icon, wired to nothing.
assert.match(
  roomDetail,
  /function CollapsibleSection\(/,
  "The Tracking panel's sections must be a real collapsible (WT-330(6)).",
);
assert.match(
  roomDetail,
  /<CollapsibleTrigger[\s\S]{0,400}?group-data-\[panel-open\]/,
  "The chevron must reflect open/closed state from the primitive, not sit static.",
);
assert.match(
  roomDetail,
  /from "@\/components\/ui\/collapsible"/,
  "Collapsing must use the shared @base-ui/react wrapper, not a hand-rolled toggle.",
);

// (7) `0/100` is two real numbers — a CONNECTED seat count and the room's persisted
// maxParticipants, which the backend stamps from TranslationRoomTypePolicy and enforces on
// join. The pill stays; what changed is that it no longer reads as a bare placeholder.
assert.match(
  pills,
  /\{occupancyLabel\}[\s\S]{0,200}?in room/,
  "The occupancy pill must name what its number counts (WT-330(7)).",
);

// (8) The roster is the only thing in the right column that grows with the data, and it must
// scroll inside its own box. When it drove the whole aside's scroll, six invitees already
// pushed Actions 206px below the fold; thirty buried it. Bounding the list is what keeps
// Tracking, the occupancy summary, Actions and Meeting access reachable at any invitee count.
// The aside must NOT be one scroll block any more — that is what let the invitee list drive
// the whole column's scroll and bury Actions.
assert.doesNotMatch(
  roomDetail,
  /<aside[^>]*xl:overflow-y-auto/,
  "The right column must not scroll as one block; only the roster region may scroll (WT-330(8)).",
);
// Tracking flexes and owns the single scroll region; Actions and Meeting access are pinned.
assert.match(
  roomDetail,
  /title="Tracking"[\s\S]{0,400}?bodyClassName="[^"]*xl:flex-1[^"]*xl:overflow-y-auto/,
  "The Tracking panel's body must be the one bounded, flexing scroll region (WT-330(8)).",
);
for (const panel of ["Actions", "Meeting access"]) {
  assert.match(
    roomDetail,
    new RegExp(`title="${panel}" className="xl:shrink-0"`),
    `The ${panel} panel must stay pinned so no invitee count can push it off screen.`,
  );
}
// A max-height on the list itself would nest a second scrollbar inside the first.
assert.doesNotMatch(
  roomDetail,
  /<CollapsiblePanel>[\s\S]{0,200}?max-h-\[/,
  "The roster list must not carry its own max-height — that nests scrollbars (WT-330(8)).",
);
// Chaining is the default; restating it is how we stop a future edit turning the inner list
// into a scroll trap that silently swallows the page's scroll at its boundary.
assert.match(
  roomDetail,
  /overscroll-auto/,
  "The inner roster scroll must chain to the page, never trap (WT-330(8)).",
);
assert.doesNotMatch(
  roomDetail,
  /overscroll-contain|overscroll-none/,
  "overscroll containment would make the roster a scroll trap.",
);

console.log(
  "Room surface contract (WT-272, WT-273, WT-274, WT-197, WT-330): PASS",
);
