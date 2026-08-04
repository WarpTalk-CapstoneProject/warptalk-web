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
    "WT-228 ending for everyone opens the ended room transcript",
    meetingSession.includes("buildTranscriptReviewPath(") &&
      meetingSession.includes('action === "end"') &&
      meetingSession.includes("? buildTranscriptReviewPath(activeWorkspaceSlug, roomId)"),
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
