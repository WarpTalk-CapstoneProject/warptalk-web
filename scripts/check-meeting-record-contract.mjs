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
]) {
  assert.ok(
    !fs.existsSync(path.join(root, gone)),
    `${gone} must not come back — the meeting record belongs to the meeting.`,
  );
}

const roomDetail = read("src/app/(app)/[workspaceSlug]/rooms/[id]/page.tsx");

// All three tabs, or the deletion lost something.
for (const [needle, what] of [
  ["<MeetingRecordSection", "the record section"],
  ["<MeetingTranscriptArtifact", "the transcript"],
  ["<SummaryPanel", "the AI summary"],
  ["<ArtifactsPanel", "the retained files"],
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
