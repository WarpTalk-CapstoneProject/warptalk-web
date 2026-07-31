import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dialogSource = readFileSync(
  new URL("../src/components/rooms/create-room-dialog.tsx", import.meta.url),
  "utf8",
);
const selectorSource = readFileSync(
  new URL("../src/components/rooms/create/language-selector.tsx", import.meta.url),
  "utf8",
);

const supportedLocales = [
  "en-US",
  "vi-VN",
  "ja-JP",
  "ko-KR",
  "fr-FR",
  "es-ES",
];

for (const locale of supportedLocales) {
  assert.match(
    selectorSource,
    new RegExp(`code:\\s*"${locale}"`),
    `Create-room language picker must send the backend-supported locale ${locale}.`,
  );
}

assert.match(
  dialogSource,
  /useState<string\[\]>\(\[\s*"en-US",\s*"vi-VN",\s*\]\)/,
  "Create-room defaults must use backend-supported locale codes.",
);
assert.match(
  dialogSource,
  /setMeetingLanguages\(\["en-US",\s*"vi-VN"\]\)/,
  "Create-room reset must restore backend-supported locale codes.",
);
assert.match(
  dialogSource,
  /useWorkspaceStore\(\s*\(state\) => state\.activeWorkspaceId,\s*\)/,
  "Create-room dialog must read the active workspace ID.",
);
assert.match(
  dialogSource,
  /else \{\s*if \(!activeWorkspaceId\)[\s\S]*?toast\.error\("Please select a workspace before creating a room\."\)/,
  "Create-room dialog must stop when there is no active workspace ID.",
);
assert.match(
  dialogSource,
  /createRoomMutation\.mutateAsync\(\{[\s\S]*?workspaceId:\s*activeWorkspaceId,/,
  "Create-room request must include the active workspace ID.",
);

console.log("Create-room language contract: PASS");
