/**
 * WT-708 — Start narrows a meeting to the workspace's current whitelist; the web must say so.
 *
 * The rules are unit-tested in src/lib/meeting/__tests__/start-language-policy.test.ts and
 * src/lib/notifications/__tests__/series-blocked-notice.test.ts. This pins the WIRING:
 *   - the one Start hook every call site uses shows `languagePolicyNotice` and rethrows the
 *     no-language-left 403 as a localized sentence naming both sets;
 *   - no Start call site swallows that sentence behind a generic message;
 *   - the notification row renders MEETING_SERIES_BLOCKED from the catalog and can be opened;
 *   - the keys exist in every locale.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const hooks = await read("src/hooks/use-translationRooms.ts");
const item = await read("src/components/notifications/notification-item.tsx");

// 1. The Start hook handles both outcomes.
const start = hooks.slice(hooks.indexOf("export function useStartTranslationRoom("));
const startBody = start.slice(0, start.indexOf("\nexport function "));
assert.match(startBody, /readLanguagePolicyNotice\(startedRoom\)/, "Start must read languagePolicyNotice");
assert.match(startBody, /toast\.warning\(t\("narrowedTitle"/, "a narrowed Start must be shown to the host");
assert.match(
  startBody,
  /readStartLanguagesRefusal\(getErrorMessage\(error, ""\)\)[\s\S]*throw new StartLanguagesRefusedError\(/,
  "the no-language-left 403 must be rethrown with the localized sentence naming both sets",
);
assert.match(startBody, /languagePolicyNotice: undefined/, "the notice must not be cached onto the room");

// 2. Every Start call site shows the error's own message (getErrorMessage reads a plain Error's
// message), never only a fixed fallback.
const callSites = [
  "src/app/(app)/[workspaceSlug]/rooms/[id]/page.tsx",
  "src/app/(app)/[workspaceSlug]/rooms/[id]/waiting/page.tsx",
  "src/components/rooms/create-room-dialog.tsx",
  "src/components/rooms/live/persistent-meeting-session.tsx",
];
for (const path of callSites) {
  const source = await read(path);
  const at = source.search(/await (startRoomMutation|startRoom)\.mutateAsync\(/);
  assert.ok(at > 0, `${path}: Start call not found`);
  assert.match(
    source.slice(at, at + 2500),
    /catch \(error\)[\s\S]*?getErrorMessage\(\s*error,/,
    `${path}: a refused Start must show the error's own sentence`,
  );
}

// 3. MEETING_SERIES_BLOCKED in the notification center.
assert.match(item, /readSeriesBlockedNotice\(notification\)/);
assert.match(item, /seriesBlockedRoomId\(detail\)/, "the row must lead to a meeting of the series");
assert.match(item, /tSeries\("title"/);
assert.match(item, /tSeries\("body"\)/);

// 4. Catalog keys in every locale.
for (const locale of ["en", "vi", "ja"]) {
  const rooms = JSON.parse(await read(`messages/${locale}/rooms.json`));
  for (const key of ["narrowedTitle", "narrowedDescription", "startRefused", "none"]) {
    assert.equal(typeof rooms.languagePolicy?.[key], "string", `${locale}: rooms.languagePolicy.${key}`);
  }
  for (const key of ["title", "body", "openFailed"]) {
    assert.equal(typeof rooms.seriesBlockedNotice?.[key], "string", `${locale}: rooms.seriesBlockedNotice.${key}`);
  }
}

console.log("Start language policy contract passed.");
