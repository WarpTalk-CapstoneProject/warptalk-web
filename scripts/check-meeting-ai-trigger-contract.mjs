import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const [endpoints, service, hook, testPage] = await Promise.all([
  readFile(path.join(root, "src/lib/api/endpoints.ts"), "utf8"),
  readFile(path.join(root, "src/services/meeting.service.ts"), "utf8"),
  readFile(path.join(root, "src/hooks/use-meeting.ts"), "utf8"),
  readFile(path.join(root, "src/app/test-meeting/page.tsx"), "utf8"),
]);

const checks = [
  ["trigger-ai endpoint uses meetings rooms path", endpoints.includes("`/meetings/rooms/${translationRoomId}/trigger-ai`")],
  ["meeting service posts trigger-ai request", service.includes("meetingService") && service.includes("triggerAi(") && service.includes("API.meetings.triggerAi")],
  ["hook exposes trigger-ai mutation", hook.includes("useTriggerMeetingAi") && hook.includes("meetingService.triggerAi")],
  ["test page sends participant identity", testPage.includes("participantIdentity: data.participantIdentity")],
  ["test page authenticates trigger-ai request", testPage.includes("Authorization: `Bearer ${currentToken}`")],
];

const failures = checks.filter(([, passed]) => !passed);

for (const [label, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
}

if (failures.length > 0) {
  process.exitCode = 1;
}
