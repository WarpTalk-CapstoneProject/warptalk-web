import fs from "node:fs";

const proxy = fs.readFileSync("src/proxy.ts", "utf8");
const createRoom = fs.readFileSync("src/components/rooms/create-room-dialog.tsx", "utf8");
const optionsMenu = fs.readFileSync("src/components/rooms/create/options-menu.tsx", "utf8");
const mockArtifactsPage = "src/app/(app)/workspace/artifacts/page.tsx";
const assistantPage = fs.readFileSync("src/app/(app)/[workspaceSlug]/ai-chat/page.tsx", "utf8");
const feedbackPage = fs.readFileSync("src/app/(app)/[workspaceSlug]/feedback/page.tsx", "utf8");
const artifactsPage = fs.readFileSync(
  "src/app/(app)/[workspaceSlug]/rooms/[id]/artifacts/page.tsx",
  "utf8",
);
const waitingPage = fs.readFileSync(
  "src/app/(app)/[workspaceSlug]/rooms/[id]/waiting/page.tsx",
  "utf8",
);
const endedPage = fs.readFileSync(
  "src/app/(app)/[workspaceSlug]/rooms/[id]/ended/page.tsx",
  "utf8",
);
const voiceProfilesPage = fs.readFileSync(
  "src/app/(app)/[workspaceSlug]/voice-profiles/page.tsx",
  "utf8",
);

const requiredMarkers = [
  'process.env.NODE_ENV === "production"',
  '"/dev"',
  '"/dev-test"',
  '"/glass-material"',
  '"/test-meeting"',
  '"/workspace/artifacts"',
  "status: 404",
];

const failures = requiredMarkers
  .filter((marker) => !proxy.includes(marker))
  .map((marker) => `production route guard is missing: ${marker}`);

if (createRoom.includes("resource-picker") || optionsMenu.includes("MOCK_RESOURCES")) {
  failures.push("production room creation must not expose fabricated resource fixtures");
}
if (fs.existsSync(mockArtifactsPage)) {
  failures.push("fabricated workspace artifacts page must not be shipped");
}
for (const marker of ["initialConversations", "Preview response", "warptalk-ai-chat-v1"]) {
  if (assistantPage.includes(marker)) {
    failures.push(`AI chat must use the Assistant API instead of local demo state: ${marker}`);
  }
}
for (const [name, source, required, forbidden] of [
  ["feedback", feedbackPage, "useSubmitTranslationRoomFeedback", ["Submit preview", "recentFeedback"]],
  ["artifacts", artifactsPage, "translationRoomService.artifacts", ["Ready preview", "Visual preview"]],
  ["waiting room", waitingPage, "useTranslationRoomParticipants", ["Preview fallback", "const participants = ["]],
  ["ended room", endedPage, "translationRoomService.artifacts", ["const jobs = ["]],
  ["voice profiles", voiceProfilesPage, "useVoiceProfiles", ["FEATURED_VOICES", "Trending voice presets"]],
]) {
  if (!source.includes(required)) {
    failures.push(`${name} page is missing real API integration: ${required}`);
  }
  for (const marker of forbidden) {
    if (source.includes(marker)) {
      failures.push(`${name} page contains fabricated production state: ${marker}`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Production-only route surface contract passed.");
