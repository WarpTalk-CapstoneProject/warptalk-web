import fs from "node:fs";

const proxy = fs.readFileSync("src/proxy.ts", "utf8");
const createRoom = fs.readFileSync("src/components/rooms/create-room-dialog.tsx", "utf8");
const optionsMenu = fs.readFileSync("src/components/rooms/create/options-menu.tsx", "utf8");
const mockArtifactsPage = "src/app/(app)/workspace/artifacts/page.tsx";
const assistantPage = fs.readFileSync("src/app/(app)/[workspaceSlug]/ai-chat/page.tsx", "utf8");
// Feedback is a control on the meeting, not a route: four score rows never needed a page of their
// own, a query string to carry the meeting id, or an empty state for arriving without one. It has
// been a route, then a dialog on the post-meeting page, and is now a popover on room detail — the
// surface it must not fabricate is the same each time, so the check follows the component.
const feedbackMenu = fs.readFileSync("src/components/rooms/feedback-menu.tsx", "utf8");
// There is no separate artifacts page any more. It was a second, worse view of the Files tab that
// the room page and the post-meeting page already carry, and nothing linked to it once the
// post-meeting page grew its own tabs — an unreachable route is not a surface worth checking.
const waitingPage = fs.readFileSync(
  "src/app/(app)/[workspaceSlug]/rooms/[id]/waiting/page.tsx",
  "utf8",
);
// The post-meeting page is gone: transcript, summary, minutes, files and the rating are the
// meeting's own page now, which is where the reader already is when a meeting ends. The record
// still has to be read from the shared room-history query rather than fetched a second time
// under a key of its own, so the rule follows the page that carries it.
const roomDetailPage = fs.readFileSync(
  "src/app/(app)/[workspaceSlug]/rooms/[id]/page.tsx",
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

// The /dev previews are reachable WITHOUT a session outside production, because the surfaces they
// stand in for need a backend that does not run on a laptop. That pass-through is only safe while
// the production 404 is evaluated FIRST — swap the two branches and every /dev route becomes a
// public page on the live origin, with no auth gate and no test that notices. The order is the
// whole guarantee, so it is asserted rather than assumed.
const productionGuard = proxy.indexOf("status: 404");
const devPassThrough = proxy.indexOf("if (isDevelopmentOnlyRoute) {");
if (devPassThrough !== -1) {
  if (productionGuard === -1 || productionGuard > devPassThrough) {
    failures.push(
      "the unauthenticated /dev pass-through runs before the production 404 — /dev would be public in production",
    );
  }
  const guardBlock = proxy.slice(0, productionGuard);
  if (!guardBlock.includes('process.env.NODE_ENV === "production"')) {
    failures.push("the /dev 404 is no longer conditioned on NODE_ENV === production");
  }
}

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
  ["feedback", feedbackMenu, "useSubmitTranslationRoomFeedback", ["Submit preview", "recentFeedback"]],
  ["waiting room", waitingPage, "useTranslationRoomParticipants", ["Preview fallback", "const participants = ["]],
  // The meeting record reads the shared room-history record — the same query the archive uses —
  // instead of fetching the artifact list a second time under its own key.
  ["meeting record", roomDetailPage, "useEndedRoomRecord", ["const jobs = ["]],
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
