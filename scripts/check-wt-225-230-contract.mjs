import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFile(path.join(root, file), "utf8");

const [
  roomDetailPage,
  meetingSession,
  endpoints,
  chatPanel,
  voiceProfiles,
  voiceProfileDialog,
  packageJson,
] = await Promise.all([
  read("src/app/(app)/[workspaceSlug]/rooms/[id]/page.tsx"),
  read("src/components/rooms/live/persistent-meeting-session.tsx"),
  read("src/lib/api/endpoints.ts"),
  read("src/components/rooms/live/chat-panel.tsx"),
  read("src/app/(app)/[workspaceSlug]/voice-profiles/page.tsx"),
  read("src/components/voice/create-voice-profile-dialog.tsx"),
  read("package.json"),
]);

const startedHandler = meetingSession.slice(
  meetingSession.indexOf('connection.on(\n      "TranslationRoomStarted"'),
  meetingSession.indexOf('connection.on("ParticipantJoined"'),
);

const checks = [
  [
    "WT-225 keeps the intentional same-speaker utterance grouping",
    roomDetailPage.includes("groupSavedTranscriptSegments("),
  ],
  [
    // Was: a canonical /{slug}/transcript route. That route, and the workspace-wide
    // Transcripts page behind it, are gone — a meeting's transcript, AI summary and files
    // are three tabs on that meeting's own page, below its description. What WT-225/228
    // actually needs is that the saved record is reachable, and it is reachable there.
    "WT-225/228 the saved meeting record is reachable from the meeting",
    roomDetailPage.includes("<MeetingRecordSection") &&
      roomDetailPage.includes("<SummaryPanel") &&
      roomDetailPage.includes("<ArtifactsPanel"),
  ],
  [
    // The gate this opens is now named for what it actually governs: the room being LIVE,
    // which is what transcript broadcasts follow. Translation has its own signal (an ACTIVE
    // TranslationRoomSession) and is not what TranslationRoomStarted announces. The race WT-226
    // is about is unchanged — the first STT result can beat the REST refetch, so the flag must
    // be set before it.
    "WT-226 the live gate is opened synchronously before the room refetch race",
    startedHandler.indexOf("meetingLiveRef.current = true") >= 0 &&
      startedHandler.indexOf("meetingLiveRef.current = true") <
        startedHandler.indexOf("refetchRoom"),
  ],
  [
    "WT-227 chat downloads use the centralized room/message endpoint",
    endpoints.includes("chatDownload:") &&
      chatPanel.includes("API.meetings.chatDownload(roomId, file.id)"),
  ],
  [
    // Was pinned to buildTranscriptReviewPath, i.e. /{slug}/transcript?room={id} — the
    // workspace-wide transcript archive filtered by room. This check therefore pinned the bug:
    // rooms/[id]/ended (artifact cards with a 5s refresh while they generate, plus the
    // artifacts/feedback/history links) was fully built and had no route into it from anywhere in
    // the app. buildTranscriptReviewPath had exactly one caller, this one, and is replaced.
    // What WT-228 actually cares about — that ending for everyone lands the host on the ended
    // room's own wrap-up rather than back on the rooms list — is what is pinned now.
    "WT-228 ending for everyone opens the ended room's wrap-up page",
    meetingSession.includes("buildMeetingEndedPath(") &&
      meetingSession.includes('action === "end"') &&
      meetingSession.includes("? buildMeetingEndedPath(activeWorkspaceSlug, roomId)"),
  ],
  [
    // The other half of the same navigation: TranslationRoomEnded router.replace'd EVERY client
    // in the group to the rooms list, the host who had just pressed End included, so the
    // broadcast raced handleExit's push and could win.
    "WT-228 the client that ended the room is not redirected by its own broadcast",
    meetingSession.includes("endedByMeRef.current = true") &&
      meetingSession.includes("if (endedByMeRef.current) return;"),
  ],
  [
    "WT-228 transcript review exposes editing and finalization actions",
    roomDetailPage.includes("finalizeTranscript()") &&
      roomDetailPage.includes("Save correction"),
  ],
  [
    // The languages are no longer listed on the page at all: they come from
    // languagesInScope("voiceProfile") in the one registry, which is what makes a hardcoded
    // list impossible rather than merely absent. Both files are checked so neither can grow
    // one back.
    "WT-229 voice profiles expose only EN VI and JA",
    !voiceProfiles.includes('{ key: "ko"') &&
      !voiceProfiles.includes('{ value: "ko-KR"') &&
      !voiceProfileDialog.includes('{ key: "ko"') &&
      !voiceProfileDialog.includes('{ value: "ko-KR"'),
  ],
  [
    // Recording moved out of the page and into the create dialog when the page was split into
    // a list column and a settings rail. What WT-230 needs is that somebody can still record
    // straight into a profile and that the sample is checked before it is sent — so the
    // assertion follows the form, and the second half keeps the form reachable from the page.
    "WT-230 voice profiles support direct recording and sample quality checks",
    voiceProfileDialog.includes("MediaRecorder") &&
      voiceProfileDialog.includes("analyzeVoiceSample") &&
      voiceProfiles.includes("<CreateVoiceProfileDialog"),
  ],
  [
    "new issue regression contract is part of the contract suite",
    packageJson.includes("test:wt-225-230"),
  ],
];

const failures = checks.filter(([, passed]) => !passed);
for (const [label, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
}

if (failures.length) process.exitCode = 1;
