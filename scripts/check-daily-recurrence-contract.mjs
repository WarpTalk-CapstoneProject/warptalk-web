import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * WT-327. The Daily control used to be a DEAD SWITCH: `isDaily` was declared, passed to
 * OptionsMenu, rendered as a filled blue check — and never read by `handleSubmit`. It was in
 * neither the create payload nor the edit payload, and `handleOpenChange` did not even reset it,
 * so the check mark persisted into the next dialog. `warptalk-infrastructure/demo/DEMO-FLOWS.md`
 * documented it as something not to demo.
 *
 * Everything below exists so that cannot silently happen again. A control whose state never
 * reaches the request is worse than no control: it passes typecheck, lint and every unit test
 * while doing nothing at all — which is exactly how it survived this long.
 */

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const dialogSource = read("../src/components/rooms/create-room-dialog.tsx");
const modalSource = read("../src/components/rooms/create/options-menu.tsx");
const optionsSource = read("../src/components/rooms/create/options-menu.tsx");
const typesSource = read("../src/types/translationRoom.ts");
const serviceSource = read("../src/services/translation-room.service.ts");
const hooksSource = read("../src/hooks/use-translationRooms.ts");
const roomsPageSource = read("../src/app/(app)/[workspaceSlug]/rooms/page.tsx");

// ── The switch is wired ──────────────────────────────────────────────────────

// THE regression that matters. The state the Daily control holds must reach the mutation.
assert.match(
  dialogSource,
  /createRecurringRoomMutation\.mutateAsync\(/,
  "The Daily schedule must be submitted. It was declared and rendered but never sent — that is the bug WT-327 fixed.",
);

assert.match(
  dialogSource,
  /recurrence:\s*\{[\s\S]{0,400}?startTimeLocal:\s*dailyRecurrence\.time/,
  "The hour the user picked must be the hour that is sent, read from the Daily draft itself.",
);

// The old dead boolean must not come back. A boolean cannot carry an hour, which is precisely
// why it could never have been wired up as-is.
assert.doesNotMatch(
  dialogSource,
  /useState\(false\)[^\n]*\/\/\s*isDaily|const \[isDaily, setIsDaily\]/,
  "isDaily was a boolean that could not carry the chosen hour; the dialog now holds a full draft.",
);

// Reset with everything else, or the schedule leaks into the next dialog the user opens.
assert.match(
  dialogSource,
  /setDailyRecurrence\(null\)/,
  "The Daily schedule must be cleared by handleOpenChange — the old toggle was not, so its check mark persisted across dialogs.",
);

// ── Choosing Daily asks for the hour, in the row itself ──────────────────────
//
// The owner's request was "mở modal để user chọn giờ daily", and what these assertions protect
// is the second half of it: choosing Daily must present the hour, never commit one the host
// cannot see. The editor has moved twice — a modal over the create dialog, then a panel inside
// it, now the menu row itself — because both earlier answers met "ask for the hour" by opening
// a second surface over the first. So what is pinned here is the asking, not the surface.

assert.match(
  dialogSource,
  /<OptionsMenu[\s\S]{0,400}?daily=\{dailyRecurrence\}/,
  "The options menu must be handed the rule in force, so the row can show the hour rather than a bare check mark.",
);
assert.match(
  dialogSource,
  /onDailyChange=\{/,
  "The Daily row must report changes back to the dialog that submits them; a control whose state never reaches the request is the WT-327 bug.",
);
assert.doesNotMatch(
  modalSource,
  /<Dialog[\s>]/,
  "The Daily editor belongs in the menu row, not in a dialog over the dialog.",
);
assert.match(
  modalSource,
  /<TimeField[\s\S]{0,300}?value=\{daily\.time\}/,
  "The Daily row must offer a time-of-day control bound to the rule; picking the hour is the entire feature.",
);
assert.match(
  modalSource,
  /<DateField[\s\S]{0,300}?value=\{daily\.endDate\}/,
  "Daily must offer an end date. A series with no end generates rooms forever, including for abandoned demo workspaces.",
);
// WT-548 — NOT the native controls, and this is the assertion that keeps them out.
//
// `<input type="time">` and `<input type="date">` take their language from the BROWSER, not from
// the page. `<html lang="en">` does not reach them. On a Vietnamese Chrome the English Create
// Room dialog rendered "09:00 SA" and a "Tháng Chín 2026" calendar with "Xóa"/"Hôm nay" buttons,
// and there is no attribute that fixes it — the widget is not ours to translate. The controls
// above are the app's own, in the app's one language.
assert.doesNotMatch(
  modalSource,
  /type="(?:time|date)"/,
  "The Daily row must not use a native date/time input: its language comes from the browser, so an English dialog renders a Vietnamese picker (WT-548).",
);
// WT-327 originally required an occurrence-count preview here — "Every day at 09:00 · 31
// meetings · Asia/Saigon" — as the guard against the dead switch. The owner removed it: it
// restated the two fields that set it, and named a zone nobody had asked to see. This is a
// decision, not a regression, so nothing asserts the sentence back into existence.
//
// What replaces it is asserted instead: an end date the host can see and change bounds the
// series where the sentence merely counted it, and the pill keeps reporting the rule in force,
// so the state cannot be silent — which was the actual bug.
assert.match(
  dialogSource,
  /data-testid="daily-pill"[\s\S]{0,200}?dailyRecurrence\.time/,
  "The pill must report the hour in force. A control whose state is invisible is the dead switch, whatever it is called.",
);
assert.doesNotMatch(
  modalSource,
  /describeDailySchedule/,
  "The prose summary was removed deliberately; restoring it puts the zone name and a restatement of the two fields back into a 262px menu.",
);
// Turning Daily on with no way to see or change the hour would be the dead switch again, just
// with a value attached. The hour is rendered only when the rule exists, so it must be gated on
// the rule rather than hidden behind a further click.
assert.match(
  modalSource,
  /isDaily &&[\s\S]{0,200}?<TimeField/,
  "The hour must appear as soon as Daily is on, beside its own label — not behind another control.",
);

// ── The rule is unambiguous about time ───────────────────────────────────────

assert.match(
  dialogSource,
  /timeZone:\s*detectTimeZone\(\)/,
  "The recurrence must carry an IANA time zone. '08:00' with no zone is not a schedule.",
);
assert.match(
  typesSource,
  /startTimeLocal:\s*string/,
  "The recurrence request must send a local wall clock, not a UTC instant — a UTC instant cannot mean '8am every day'.",
);

// A one-off time and a repeating rule cannot both be sent: the rule owns every occurrence's
// time, so one of them would have to be silently discarded, which is the original failure.
assert.match(
  dialogSource,
  /setScheduledAt\(null\)/,
  "Confirming a Daily schedule must clear any one-off scheduledAt; the server refuses a request carrying both.",
);

// ── The occurrences are visible ──────────────────────────────────────────────

assert.match(
  typesSource,
  /seriesId\?:\s*string/,
  "A room must report the series it belongs to, so the schedule can mark it as repeating.",
);
assert.match(
  roomsPageSource,
  /room\.seriesId && <RepeatBadge/,
  "The meetings list must mark an occurrence of a repeating booking.",
);
// Was: the day timeline's compact RepeatBadge. That timeline is gone with the Scheduled tab —
// browsing days is a permanent strip above the ordinary list now, so a repeating occurrence is
// marked by the list row's own badge, asserted just above. The question the host came to answer
// ("is tomorrow's 8am there?") is still answered on the day they pick; it is simply the same row
// that answers it.
assert.match(
  roomsPageSource,
  /<MeetingDayStrip/,
  "Days are browsed from the strip now, so the meetings list must render it.",
)

// ── Stopping a series is possible at all ────────────────────────────────────

assert.match(
  serviceSource,
  /async cancelSeries\(/,
  "There must be a way to stop a series; without one, cancelling occurrences one at a time is the only exit.",
);
assert.match(
  hooksSource,
  /useCancelTranslationRoomSeries/,
  "The series cancel must be reachable from React, not only from the service module.",
);

// ── The options menu reports the schedule, not merely that one exists ────────

// The hour was once passed in as a read-only `dailyTime` prop just to be printed beside the
// check mark. The row now holds the editable value itself, so what is asserted is that it
// renders the hour in force — a bare check mark looks identical whether the setting reached
// the server or not, which is how the dead switch survived.
assert.match(
  optionsSource,
  /value=\{daily\.time\}/,
  "The options menu must show the hour in force, bound to the rule rather than to a local copy that can drift from it.",
);

console.log("Daily recurrence contract OK");
