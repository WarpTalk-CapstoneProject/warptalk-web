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
  // The AI summary, which no longer has a tab of its own: it is rendered by the reading rail,
  // beside the transcript it cites. `<SummaryPanel` used to be the needle here — a full-width
  // tab that showed the whole summary but not the transcript, opposite a rail that showed the
  // transcript but only part of the summary. One summary, one place. The rail's own half of
  // this rule is asserted below, so the merge cannot quietly lose what the tab carried.
  ["<TranscriptReadingLayout", "the transcript beside its summary"],
  ["<MinutesPanel", "the meeting minutes"],
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

// THE ARTIFACTS TAB IS GONE, DELIBERATELY (2026-09-18).
//
// `<ArtifactsPanel` used to be on the list above, for the same reason the rest of it is: deleting
// the workspace-wide Transcripts page was only safe once everything it owned had somewhere to live.
// The panel listed a meeting's files as rows named after their FILE TYPE — "recording",
// "transcript export", "summary export" — beside two tabs that render those very things in full.
// Reaching the video by its type, from a list, two clicks from the frame that plays it is the long
// way round from every one of them.
//
// So the rule it stood for is unchanged and is asserted differently: every artifact a reader can
// take away must be reachable FROM THE THING IT IS A COPY OF. The three needles below are that
// rule. What is left over — debug logs, audio samples, nobody's reading surface — is listed by the
// workspace's Artifacts library, which is a page of its own and covered by its own contract.
const transcriptPanelDownloads = read("src/components/rooms/meeting-transcript-panel.tsx");
assert.ok(
  !fs.existsSync(path.join(root, "src/components/rooms/artifacts-panel.tsx")),
  "The Artifacts tab must not come back as a file of its own either.",
);
assert.doesNotMatch(
  roomDetail,
  /MeetingRecordTab = [^;]*"artifacts"/,
  'The record must not regrow an "artifacts" tab — each download belongs on the surface that '
    + "shows what it copies.",
);
assert.match(
  transcriptPanelDownloads,
  /buildTranscriptDocumentModel\(/,
  "The transcript's toolbar must hand over the transcript as it is on screen (.docx and .txt).",
);

// What the deleted Summary tab owned, in the rail that replaced it. Each of these was a control
// or a message that existed nowhere else: the shape the summary is written in, a copy of it, the
// file it was written to, the overview paragraph, and the four different reasons there may be no
// summary to read. A merge that dropped any of them would look like a tidier page and be a
// smaller product.
const readingRail = read("src/components/rooms/meeting-reading-rail.tsx");
for (const [needle, what] of [
  ["SUMMARY_TEMPLATES", "the summary shape picker"],
  ["copyAsText", "copying the summary as text"],
  // Was `onDownload(artifact)` — fetching the server's summary_export. That was the wrong document
  // for any reader who had changed the shape or the language: the file that arrived was the host's
  // published one. The rail writes the summary it is SHOWING instead.
  ["downloadSummaryDocument", "downloading the summary as shown"],
  // The recording's own download, which the Artifacts tab used to be the only route to.
  ["onDownload(recording)", "downloading the recording"],
  ["summary.summary", "the summary's overview paragraph"],
  ["summaryAbsenceMessage", "why there is no summary"],
  ["SummaryStalenessNotice", "the notice that the transcript was corrected since"],
]) {
  assert.ok(
    readingRail.includes(needle),
    `The reading rail must still carry ${what} (${needle}).`,
  );
}

// CONSENT IS REPORTED, NEVER INFERRED.
//
// `TranslationRoomArtifactDto` carries `consentRequired` and nothing that says whether the consent
// it requires was given. The mapper answered that unanswerable question with
// `consentRequired ? "granted" : "not_required"` — backwards, and backwards in the direction that
// claims permission exists for exactly the artifacts still waiting on it. Nothing rendered the
// field, which is why it survived; this is here so it cannot come back for something that does.
const historyService = read("src/services/room-history.service.ts");
assert.doesNotMatch(
  historyService,
  /consentRequired\s*\?\s*"granted"/,
  'room-history.service.ts must not read `consentRequired` as consent GRANTED — see RoomConsentStatus.',
);
assert.doesNotMatch(
  historyService,
  /artifact\.consentRequired\)\s*\?\s*"granted"/,
  "The room-level consent block must not infer a verdict from `consentRequired` either.",
);

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
// (The My tasks page used to be listed here too; it was retired on 2026-09-23 — see
// check-retired-workspace-pages.mjs.)
for (const rel of [
  "src/components/rooms/live/persistent-meeting-session.tsx",
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
