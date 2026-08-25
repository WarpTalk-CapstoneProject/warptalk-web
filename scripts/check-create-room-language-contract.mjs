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
  new URL("../src/lib/language/languages.ts", import.meta.url),
  "utf8",
);

const meetingLocales = [
  "en-US",
  "vi-VN",
  "ja-JP",
];

const nonMeetingLocales = [
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

for (const locale of meetingLocales) {
  const [, region] = locale.split("-");
  assert.match(
    registrySource,
    new RegExp(`locale:\\s*"${locale}"[\\s\\S]{0,240}?scopes:\\s*\\[[^\\]]*"meeting"`),
    `Language registry must offer the project meeting locale ${locale} as a meeting language.`,
  );
  assert.match(
    registrySource,
    new RegExp(`region:\\s*"${region}"`),
    `Language registry must carry the region for ${locale} so its flag resolves.`,
  );
}

for (const locale of nonMeetingLocales) {
  assert.doesNotMatch(
    registrySource,
    new RegExp(`locale:\\s*"${locale}"[\\s\\S]{0,240}?scopes:\\s*\\[[^\\]]*"meeting"`),
    `Create-room language picker must not offer non-project meeting locale ${locale}.`,
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
// Every refusal now goes through failSubmit, which both toasts and pins the reason into the
// dialog (WT-270) — so the assertion follows it rather than the bare toast.error it replaced.
assert.match(
  dialogSource,
  /else \{\s*if \(!activeWorkspaceId\)[\s\S]*?failSubmit\("Please select a workspace before creating a room\."\)/,
  "Create-room dialog must stop when there is no active workspace ID.",
);
assert.match(
  dialogSource,
  /function failSubmit\(message: string\) \{\s*setSubmitError\(message\);\s*toast\.error\(message\);/,
  "A refused submit must both toast and stay on screen.",
);
assert.match(
  dialogSource,
  /createRoomMutation\.mutateAsync\(\{[\s\S]*?workspaceId:\s*activeWorkspaceId,/,
  "Create-room request must include the active workspace ID.",
);

// ─── WT-271: the picker may not offer what the workspace forbids ───

assert.match(
  selectorSource,
  /allowedTargetLanguages/,
  "Create-room language picker must take the workspace's allowedTargetLanguages policy.",
);
assert.match(
  selectorSource,
  /isLanguageAllowedByPolicy\(\s*language\.code,\s*allowedTargetLanguages,?\s*\)/,
  "Create-room language picker must check every option against the workspace policy.",
);
assert.match(
  dialogSource,
  /useWorkspaceSettings\(activeWorkspaceId \|\| ""\)/,
  "Create-room dialog must read the active workspace's settings to learn the language policy.",
);
assert.match(
  dialogSource,
  /allowedTargetLanguages=\{allowedTargetLanguages\}/,
  "Create-room dialog must hand the workspace language policy to the picker.",
);
assert.match(
  dialogSource,
  /reconcileMeetingLanguages\(/,
  "Create-room dialog must trim its default language set to the workspace policy.",
);

// Empty means unrestricted — the server disables the whitelist check entirely for an empty
// list (WorkspaceGrpcService.cs:151), so the picker must not read empty as "none allowed".
assert.match(
  registrySource,
  /export function isLanguageAllowedByPolicy\([\s\S]*?if \(policy\.length === 0\) return true;/,
  "An empty workspace language policy must mean unrestricted, not forbidden.",
);

// ─── WT-270: the server's own refusal must reach the user ───

assert.match(
  dialogSource,
  /getErrorMessage\(\s*error,/,
  "Create-room dialog must surface the server's error body, not the axios status string.",
);
assert.doesNotMatch(
  dialogSource,
  /error instanceof Error\s*\?\s*error\.message/,
  "Create-room dialog must not fall back to the AxiosError message, which only ever says "
    + "'Request failed with status code 403'.",
);
assert.match(
  dialogSource,
  /role="alert"/,
  "Create-room dialog must keep the refusal on screen, not only in a toast that expires.",
);

console.log("Create-room language contract: PASS");
