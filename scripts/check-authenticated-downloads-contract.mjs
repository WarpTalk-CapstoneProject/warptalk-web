import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const chatPanel = await readFile(
  new URL("../src/components/rooms/live/chat-panel.tsx", import.meta.url),
  "utf8",
);
const translationRoomService = await readFile(
  new URL("../src/services/translation-room.service.ts", import.meta.url),
  "utf8",
);
const roomPage = await readFile(
  new URL("../src/app/(app)/[workspaceSlug]/rooms/[id]/page.tsx", import.meta.url),
  "utf8",
);

assert.doesNotMatch(chatPanel, /access_token/);
assert.doesNotMatch(translationRoomService, /access_token/);
assert.match(chatPanel, /downloadAuthenticatedFile/);
assert.match(translationRoomService, /responseType:\s*"blob"/);
assert.match(roomPage, /saveBlobDownload/);

console.log("authenticated download contract passed");
