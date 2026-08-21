import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * A meeting's record lives on the meeting, and there is no second page.
 *
 * The transcript, the AI summary and the retained files used to be a workspace-wide
 * Transcripts page: to read what a meeting decided you left the meeting's own page, found it
 * again in a queue, and picked a tab. Deleting that page was only safe once all three of its
 * tabs existed on room detail — the summary and the artifacts were reachable from nowhere
 * else, and the AI summary is the product's headline feature.
 */

const root = path.resolve(import.meta.dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

for (const gone of [
  "src/app/(app)/[workspaceSlug]/ai-summaries",
  "src/app/(app)/[workspaceSlug]/transcript",
  // The post-meeting wrap-up page. It was the second implementation of this record against a
  // different data source — its transcript read a stored export file and could not be shown in
  // any language but the one it was written in — and being a separate page is what let it drift.
  "src/app/(app)/[workspaceSlug]/rooms/[id]/ended",
]) {
  assert.ok(
    !fs.existsSync(path.join(root, gone)),
    `${gone} must not come back — the meeting record belongs to the meeting.`,
  );
}

const roomDetail = read("src/app/(app)/[workspaceSlug]/rooms/[id]/page.tsx");

// Every tab, or a deletion lost something.
//
// Minutes and the rating are here because the wrap-up page uniquely owned them: it was the only
// place a biên bản could be read or signed, and the only door to the feedback form. Deleting a
// page is only safe once what it OWNED has somewhere to live, which is what these two pin.
for (const [needle, what] of [
  ["<MeetingRecordSection", "the record section"],
  ["<MeetingTranscriptArtifact", "the transcript"],
  ["<SummaryPanel", "the AI summary"],
  ["<MinutesPanel", "the meeting minutes"],
  ["<ArtifactsPanel", "the retained files"],
  ["<MeetingFeedbackMenu", "the meeting rating"],
]) {
  assert.ok(
    roomDetail.includes(needle),
    `Room detail must render ${what} (${needle}).`,
  );
}

// Below the description, which is where the owner asked for it.
const notesAt = roomDetail.indexOf("<RoomNotesEditor");
const recordAt = roomDetail.indexOf("<MeetingRecordSection");
assert.ok(notesAt > 0 && recordAt > notesAt, "The record must sit below the description.");

// An hour of talking is hundreds of entries. Uncapped, the transcript set the page height
// and pushed the sections below it — and the page's own scrollbar — out of reach.
//
// Asserted against the panel rather than the page: the transcript moved into its own component
// when it grew a language picker and two layouts. The rule did not move, only the file it is
// written in.
const transcriptPanel = read("src/components/rooms/meeting-transcript-panel.tsx");
assert.match(
  transcriptPanel,
  /max-h-\[min\(60vh,560px\)\][^"]*overflow-y-auto/,
  "The transcript must scroll inside a bounded frame, not stretch the page.",
);

// The summary arrives asynchronously after the meeting ends. If its SignalR event does not
// invalidate the query the tabs read, a generated summary stays invisible until a reload.
const realtime = read("src/components/providers/realtime-notification-provider.tsx");
const summaryHandlerAt = realtime.indexOf("SIGNALR_EVENTS.AI_SUMMARY_PROGRESS");
assert.ok(summaryHandlerAt > 0, "The AI summary progress event must still be handled.");
assert.match(
  realtime.slice(summaryHandlerAt, summaryHandlerAt + 600),
  /queryKey: \["room-history"\]/,
  "A finished AI summary must invalidate the query the meeting record reads.",
);

// Ending a meeting lands on the record, not on a list of rooms — and not on a page that no
// longer exists. `buildMeetingEndedPath` was the only helper that could build that URL.
assert.ok(
  !fs.existsSync(path.join(root, "src/lib/meeting/meeting-navigation.ts")),
  "meeting-navigation.ts existed only to build the deleted wrap-up page's URL.",
);
for (const rel of [
  "src/components/rooms/live/persistent-meeting-session.tsx",
  "src/app/(app)/[workspaceSlug]/tasks/page.tsx",
]) {
  assert.ok(
    !/rooms\/\$\{[^}]+\}\/ended|buildMeetingEndedPath/.test(read(rel)),
    `${rel} must not navigate to the removed wrap-up page.`,
  );
}

// Nothing may still route to the deleted page.
for (const rel of [
  "src/components/layout/linear-sidebar.tsx",
  "src/components/layout/workspace-tabs.tsx",
  "src/components/rooms/search-meeting-dialog.tsx",
  "src/app/(app)/[workspaceSlug]/home/page.tsx",
]) {
  assert.ok(
    !read(rel).includes("/ai-summaries"),
    `${rel} must not link to the removed Transcripts page.`,
  );
}

console.log("Meeting record contract: PASS");
