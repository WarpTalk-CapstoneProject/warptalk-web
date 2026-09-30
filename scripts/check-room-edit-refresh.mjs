// WT-852 — "Room updated successfully." must never appear over the old page.
//
// Three surfaces showed stale data after a room edit until F5:
//   1. the room itself waited on a background refetch (the toast came first);
//   2. the notes editor read its content once, at mount, so a description edited in the dialog
//      never reached it — and the next keystroke saved the old notes back over the edit;
//   3. a recurring meeting's "Daily · 20:40 / Next …" line reads the SERIES, whose query key the
//      meetings-key invalidation never reached.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const hook = read("src/hooks/use-translationRooms.ts");
const start = hook.indexOf("export function useUpdateTranslationRoomSettings");
assert.ok(start >= 0, "useUpdateTranslationRoomSettings must exist");
const updateHook = hook.slice(start, hook.indexOf("\n}\n", start));

assert.match(
  updateHook,
  /setQueryData<TranslationRoomDto>\(\[\.\.\.MEETING_KEY, id\][\s\S]{0,120}applyRoomSettingsPatch\(/,
  "a saved room edit must be written into the cached room before any refetch (WT-852)",
);
assert.match(
  updateHook,
  /invalidateQueries\(\{ queryKey: SERIES_ROOT_KEY \}\)/,
  "a room edit must refresh the series it belongs to — the recurrence line reads the series",
);
assert.match(
  updateHook,
  /return Promise\.all\(/,
  "onSuccess must return its refetches so mutateAsync resolves after the room is re-read",
);

const page = read("src/app/(app)/[workspaceSlug]/rooms/[id]/page.tsx");
const editorStart = page.indexOf("function RoomNotesEditor(");
assert.ok(editorStart >= 0, "RoomNotesEditor must exist");
const notesEditor = page.slice(editorStart);
assert.match(
  notesEditor,
  /useEffect\(\(\) => \{[\s\S]{0,400}editor\.commands\.setContent\(initialContent[\s\S]{0,80}\}, \[editor, initialContent\]\)/,
  "the notes editor must follow a description changed elsewhere, not only its mount-time content",
);

console.log("PASS a room edit shows on the page the moment it is saved (WT-852)");
