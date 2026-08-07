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
const modalSource = read("../src/components/rooms/create/daily-schedule-dialog.tsx");
const optionsSource = read("../src/components/rooms/create/options-menu.tsx");
const typesSource = read("../src/types/translationRoom.ts");
const serviceSource = read("../src/services/translationRoom.service.ts");
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

// ── Choosing Daily opens a modal, and the modal asks for the hour ────────────

assert.match(
  dialogSource,
  /<DailyScheduleDialog/,
  "Choosing Daily must open the schedule modal — the owner's request was literally 'mở modal để user chọn giờ daily'.",
);
assert.match(
  dialogSource,
  /onToggleDaily=\{\(\)\s*=>\s*setDailyDialogOpen\(true\)\}/,
  "The Daily row in the options menu must open the modal rather than silently committing a schedule.",
);
assert.match(
  modalSource,
  /type="time"/,
  "The Daily modal must offer a time-of-day control; picking the hour is the entire feature.",
);
assert.match(
  modalSource,
  /type="date"/,
  "The Daily modal must offer an end date. A series with no end generates rooms forever, including for abandoned demo workspaces.",
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
assert.match(
  roomsPageSource,
  /room\.seriesId && <RepeatBadge compact/,
  "The day timeline must mark an occurrence of a repeating booking too — it is the surface a host checks 'is tomorrow's 8am there?' on.",
);

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

assert.match(
  optionsSource,
  /dailyTime/,
  "The options menu must show the hour in force. A bare check mark looks identical whether the setting reached the server or not — which is how the dead switch survived.",
);

console.log("Daily recurrence contract OK");
