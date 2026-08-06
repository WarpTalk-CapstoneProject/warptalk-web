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
const registrySource = readFileSync(
  new URL("../src/lib/languages.ts", import.meta.url),
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

// The locales used to be spelled out in the picker itself. They now live once, in the
// language registry, and the picker asks it for everything in the "meeting" scope — so the
// contract is checked where the values actually are.
assert.match(
  selectorSource,
  /languagesInScope\("meeting"\)/,
  "Create-room language picker must take its options from the language registry.",
);
assert.match(
  selectorSource,
  /code:\s*language\.locale/,
  "Create-room language picker must send locale tags, not bare codes.",
);

for (const locale of supportedLocales) {
  const [, region] = locale.split("-");
  assert.match(
    registrySource,
    new RegExp(`locale:\\s*"${locale}"[\\s\\S]{0,240}?scopes:\\s*\\[[^\\]]*"meeting"`),
    `Language registry must offer the backend-supported locale ${locale} as a meeting language.`,
  );
  assert.match(
    registrySource,
    new RegExp(`region:\\s*"${region}"`),
    `Language registry must carry the region for ${locale} so its flag resolves.`,
  );
}

// Every meeting language must have a full name to print; a language offered without one is
// exactly how "ko-KR" ended up rendered at users.
assert.doesNotMatch(
  registrySource,
  /name:\s*"[a-z]{2}(-[A-Z]{2})?"/,
  "Language registry must not use a code as a display name.",
);

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
