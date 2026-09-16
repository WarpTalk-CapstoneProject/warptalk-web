import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const service = await readFile("src/services/notification.service.ts", "utf8");
const popover = await readFile(
  "src/components/notifications/notification-popover.tsx",
  "utf8",
);
const panel = await readFile(
  "src/components/notifications/notification-panel.tsx",
  "utf8",
);
const item = await readFile(
  "src/components/notifications/notification-item.tsx",
  "utf8",
);

assert.doesNotMatch(
  service,
  /getNotifications[\s\S]*?catch\s*\{/,
  "The notification center must not turn API failures into an empty list.",
);
assert.match(popover, /isError/, "The center must pass the API error state to the panel.");
assert.match(panel, /if \(isError\)/, "The panel must render an API error state.");
assert.match(popover, /refetch/, "The center must let the user retry a failed request.");
assert.match(panel, /onRetry/, "The error state must offer the retry.");
assert.match(popover, /unreadCount/, "The badge must use the server-wide unread count.");

// The Unread filter and "Mark all as read" were removed on purpose (ElevenLabs-style panel):
// opening the bell IS reading it. What replaces them has to stay wired, or unread counts would
// only ever grow.
assert.match(
  popover,
  /function handleOpenChange[\s\S]*?markAllReadMutation\.mutate\(\)/,
  "Opening the bell must mark everything read — there is no other control that does.",
);
assert.match(
  popover,
  /onOpenChange=\{handleOpenChange\}/,
  "The popover must route open/close through handleOpenChange.",
);
// Without the snapshot, the server's answer flips every row to read while the panel is open and
// the reader loses track of which rows were new.
assert.match(popover, /setFreshIds\(new Set\(/, "What was unread at open must be snapshotted.");
assert.match(panel, /fresh=\{/, "Rows must be told whether they were new.");
assert.doesNotMatch(
  popover + panel + item,
  /Mark all (as )?read/,
  "A mark-all control would duplicate what opening the bell already does.",
);

assert.match(item, /actionUrl/, "A notification with an action must be navigable.");

console.log("Notification center contract passed.");
