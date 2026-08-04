import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const service = await readFile("src/services/notification.service.ts", "utf8");
const popover = await readFile(
  "src/components/notifications/notification-popover.tsx",
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
assert.match(popover, /isError/, "The center must render an API error state.");
assert.match(popover, /refetch/, "The center must let the user retry a failed request.");
assert.match(popover, /unreadCount/, "The badge must use the server-wide unread count.");
assert.match(popover, /Unread/, "The center must provide an unread filter.");
assert.match(item, /actionUrl/, "A notification with an action must be navigable.");

console.log("Notification center contract passed.");
