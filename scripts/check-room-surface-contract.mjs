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

const occupancy = read("src/lib/room-occupancy.ts");
const occupancyHook = read("src/hooks/use-room-occupancy.ts");
const access = read("src/lib/translation-room-access.ts");
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
assert.match(
  roomDetail,
  /Attendees: \{occupancy\.label\}/,
  "The Tracking panel must render the shared occupancy label.",
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
assert.match(
  roomDetail.slice(asideIndex),
  /<RoomEntryButton/,
  "The Meeting access panel must keep its copy of the action.",
);
assert.match(
  roomDetail,
  /function RoomEntryButton\(/,
  "Both copies must be the same component so their label and action cannot drift.",
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

console.log("Room surface contract (WT-272, WT-273, WT-274, WT-197): PASS");
