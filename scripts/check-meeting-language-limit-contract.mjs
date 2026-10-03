/**
 * WT-709 — the in-meeting picker offers only the meeting's languages, the room host can add one,
 * and a language the hub refuses is reverted and explained rather than dropped.
 *
 * The rules themselves are unit-tested in src/lib/meeting/__tests__/meeting-language-limit.test.ts.
 * This pins the WIRING, because every piece of it can be written, tested and connected to nothing:
 *   - the session builds the picker's list from meetingPickerLanguages, not the workspace list;
 *   - the bar's "Other languages" disclosure is off wherever the meeting's languages are the limit;
 *   - the add control reaches the POST endpoint and is offered to the room's EFFECTIVE host only;
 *   - both Set*Language catch blocks and the hub join route a refusal to the revert, instead of a
 *     generic "Could not update" toast over a button still naming the refused language.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const session = await read("src/components/rooms/live/persistent-meeting-session.tsx");
const controlBar = await read("src/components/rooms/live/meeting-control-bar.tsx");
const endpoints = await read("src/lib/api/endpoints.ts");
const service = await read("src/services/translation-room.service.ts");
const hooks = await read("src/hooks/use-translationRooms.ts");

// 1. One list for every picker in the meeting, built from the meeting's languages.
assert.match(
  session,
  /const availableListenLanguages = useMemo\(\s*\(\) =>\s*meetingPickerLanguages\(/,
  "the picker's options must come from meetingPickerLanguages (the meeting's declared set)",
);
assert.match(session, /languagesLimitedToMeeting=\{declaredLanguages !== null\}/);

// 2. No workspace-wide "Other languages" where the meeting's languages are the limit.
assert.match(
  controlBar,
  /const otherLanguages = languagesLimitedToMeeting\s*\?\s*\[\]/,
  "the Other languages disclosure must be empty when the meeting's languages are the limit",
);
assert.match(controlBar, /t\("languagePicker\.askHost"\)/);

// 3. The host's add control: the endpoint, the hook, and the effective-host gate.
assert.match(endpoints, /languages: \(id: string\) => `\/translation-rooms\/\$\{id\}\/languages`/);
assert.match(service, /apiClient\.post<[^>]*>\(\s*API\.translationRooms\.languages\(id\),\s*\{ language \}/);
assert.match(hooks, /export function useAddRoomLanguage\(/);
assert.match(hooks, /applyRoomLanguages\(room, languages\)/);
assert.match(
  session,
  /onAddRoomLanguage=\{isRoomHost \? handleAddRoomLanguage : undefined\}/,
  "the add control must be gated on isRoomHost (the endpoint checks the effective host), not isHost",
);
assert.match(controlBar, /onAdd=\{onAddRoomLanguage\}/);

// 4. A refusal is reverted and explained on every door the hub checks.
for (const method of ["SetListenLanguage", "SetSpeakLanguage"]) {
  const call = session.indexOf(`await connection.invoke("${method}", roomId,`);
  assert.ok(call > 0, `${method} sync effect not found`);
  const handler = session.slice(call, call + 900);
  assert.match(
    handler,
    /classifyLanguageRefusal\(error\)[\s\S]*languageRefusedRef\.current\?\.\(/,
    `${method}'s catch must hand a language refusal to the revert, not only toast`,
  );
}
assert.match(
  session,
  /const refusal = classifyLanguageRefusal\(error\);\s*if \(refusal\) joinLanguageRefusedRef\.current\?\.\(refusal, languages\);/,
  "a JoinTranslationRoom language refusal must move the refused side, not just retry the same pair",
);
assert.match(session, /languageRefusedRef\.current = \(side, refused, refusal\) =>/);
assert.match(session, /joinLanguageRefusedRef\.current = \(refusal, sent\) =>/);

console.log("Meeting language limit contract passed.");
