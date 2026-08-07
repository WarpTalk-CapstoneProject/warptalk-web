import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFile(path.join(root, file), "utf8");

const [
  transcriptPage,
  transcriptRoute,
  meetingSession,
  endpoints,
  chatPanel,
  voiceProfiles,
  packageJson,
] = await Promise.all([
  read("src/app/(app)/[workspaceSlug]/ai-summaries/page.tsx"),
  read("src/app/(app)/[workspaceSlug]/transcript/page.tsx").catch(() => ""),
  read("src/components/rooms/live/persistent-meeting-session.tsx"),
  read("src/lib/api/endpoints.ts"),
  read("src/components/rooms/live/chat-panel.tsx"),
  read("src/app/(app)/voice-profiles/page.tsx"),
  read("package.json"),
]);

const startedHandler = meetingSession.slice(
  meetingSession.indexOf('connection.on(\n      "TranslationRoomStarted"'),
  meetingSession.indexOf('connection.on("ParticipantJoined"'),
);

const checks = [
  [
    "WT-225 keeps the intentional same-speaker utterance grouping",
    transcriptPage.includes("groupSavedTranscriptSegments(state.data?.segments"),
  ],
  [
    "WT-225/228 canonical workspace transcript route exists",
    transcriptRoute.includes("TranscriptsPage"),
  ],
  [
    "WT-226 translation is activated synchronously before the room refetch race",
    startedHandler.indexOf("translationActiveRef.current = true") >= 0 &&
      startedHandler.indexOf("translationActiveRef.current = true") <
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
    transcriptPage.includes("Finalize transcript") &&
      transcriptPage.includes("Save correction"),
  ],
  [
    "WT-229 voice profiles expose only EN VI and JA",
    !voiceProfiles.includes('{ key: "ko"') &&
      !voiceProfiles.includes('{ value: "ko-KR"'),
  ],
  [
    "WT-230 voice profiles support direct recording and sample quality checks",
    voiceProfiles.includes("MediaRecorder") &&
      voiceProfiles.includes("analyzeVoiceSample") &&
      voiceProfiles.includes("Record sample"),
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
