import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const [endpoints, chatPanel, store] = await Promise.all([
  readFile(path.join(root, "src/lib/api/endpoints.ts"), "utf8"),
  readFile(path.join(root, "src/components/rooms/live/chat-panel.tsx"), "utf8"),
  readFile(path.join(root, "src/stores/translationRoom-store.ts"), "utf8"),
]);

const checks = [
  ["frontend chat endpoint includes rooms segment", endpoints.includes("`/meetings/rooms/${roomId}/chat`")],
  ["chat panel loads persisted history", chatPanel.includes("useMeetingChat(roomId)")],
  ["chat panel hydrates realtime store", chatPanel.includes("setChatMessages(")],
  ["chat panel renders history error state", chatPanel.includes("Could not load chat history")],
  ["chat store exposes history hydration", store.includes("setChatMessages:")],
  ["chat store deduplicates messages by id", store.includes("existing.id === message.id")],
];

const failures = checks.filter(([, passed]) => !passed);

for (const [label, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
}

if (failures.length > 0) {
  process.exitCode = 1;
}
