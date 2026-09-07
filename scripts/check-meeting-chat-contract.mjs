import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const [endpoints, chatPanel, store, session] = await Promise.all([
  readFile(path.join(root, "src/lib/api/endpoints.ts"), "utf8"),
  readFile(path.join(root, "src/components/rooms/live/chat-panel.tsx"), "utf8"),
  readFile(path.join(root, "src/stores/translationRoom-store.ts"), "utf8"),
  readFile(path.join(root, "src/components/rooms/live/persistent-meeting-session.tsx"), "utf8"),
]);

// Comments below describe the defect in its own words; reading them as code is how a check
// passes against the very thing it exists to catch.
const sessionCode = session
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

const checks = [
  ["frontend chat endpoint includes rooms segment", endpoints.includes("`/meetings/rooms/${roomId}/chat`")],
  ["chat panel loads persisted history", chatPanel.includes("useMeetingChat(roomId)")],
  ["chat panel hydrates realtime store", chatPanel.includes("setChatMessages(")],
  ["chat panel renders history error state", chatPanel.includes("Could not load chat history")],
  ["chat store exposes history hydration", store.includes("setChatMessages:")],
  ["chat store deduplicates messages by id", store.includes("existing.id === message.id")],

  // JOINING THE GROUP IS RETRIED, AND ITS FAILURE IS NOT SWALLOWED.
  //
  // The retry loop guarded `start()` and called the join exactly once, discarding the result
  // (`.catch(() => undefined)`). The join is the half that routinely fails on a first entry: the
  // meeting room row is provisioned by MeetingRoomService.JoinMeetingAsync, which the page calls
  // alongside this, so the hub answers "Room not ready" for a second or two.
  //
  // A connection with no group membership is indistinguishable from a working one — sending
  // works, nothing errors, and every broadcast lands somewhere else. The room had no live chat
  // for the rest of the meeting, silently.
  [
    "meeting chat retries the room-group join, not just the connection",
    /joinRetryDelays\s*=\s*\[[^\]]*\]/.test(sessionCode)
      && /for \(const delay of joinRetryDelays\)/.test(sessionCode),
  ],
  [
    "meeting chat does not swallow a failed room-group join",
    !/invoke\("JoinMeetingRoom", roomId\)\.catch\(\(\) => undefined\)/.test(sessionCode),
  ],
  // "Not a participant" is the hub's terminal answer; retrying it is a spin that never ends.
  [
    "meeting chat stops retrying a join it will never be granted",
    sessionCode.includes('"Not a participant"'),
  ],
];

const failures = checks.filter(([, passed]) => !passed);

for (const [label, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
}

if (failures.length > 0) {
  process.exitCode = 1;
}
