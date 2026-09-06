/**
 * The two ways this state can lie, and the one it must admit to.
 *
 * Claiming "running" while the transcript is paused is the serious one: the panel then implies
 * words are being written down that are not. Claiming "paused" while it runs is merely noisy. And
 * before anything has told us, it must say neither.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  TRANSCRIPT_PAUSE_UNKNOWN,
  resolveTranscriptPause,
  transcriptPauseFromWindows,
} from "../transcript-pause.ts";

const open = { startedAt: "2026-09-06T10:05:00Z", endedAt: null };
const closed = { startedAt: "2026-09-06T10:01:00Z", endedAt: "2026-09-06T10:02:00Z" };

// ── reading the window list ──────────────────────────────────────────────────

test("a window with no end is a pause still in force", () => {
  assert.deepEqual(transcriptPauseFromWindows([open]), {
    paused: true,
    since: open.startedAt,
  });
});

test("windows that all ended are history, not a pause", () => {
  assert.deepEqual(transcriptPauseFromWindows([closed, { ...closed, startedAt: "2026-09-06T10:03:00Z", endedAt: "2026-09-06T10:04:00Z" }]), {
    paused: false,
    since: null,
  });
});

test("an empty list, and no list at all, both read as running", () => {
  assert.deepEqual(transcriptPauseFromWindows([]), { paused: false, since: null });
  assert.deepEqual(transcriptPauseFromWindows(null), { paused: false, since: null });
});

test("with two unclosed windows the newest wins", () => {
  // The server refuses a second pause with INVALID_STATE, so this is a row left open by a crash
  // rather than a normal state. The live pause must still be the one reported.
  const stale = { startedAt: "2026-09-06T09:00:00Z", endedAt: null };
  assert.deepEqual(transcriptPauseFromWindows([stale, open]), {
    paused: true,
    since: open.startedAt,
  });
  assert.deepEqual(transcriptPauseFromWindows([open, stale]), {
    paused: true,
    since: open.startedAt,
  });
});

// ── the race the module exists for ───────────────────────────────────────────

test("a pause-windows response that lands AFTER the event does not un-pause the panel", () => {
  // The reported shape: the host presses Pause, the broadcast arrives, and a request that was
  // already in flight returns a list written before the pause row existed. It is the newer
  // ARRIVAL and the older FACT — react-query's dataUpdatedAt cannot tell them apart — so no
  // timestamp comparison saves this. The broadcast simply outranks the list.
  assert.deepEqual(
    resolveTranscriptPause({ windows: [], event: { paused: true } }),
    { paused: true, since: null, known: true },
  );
});

test("the broadcast outranks the list in the other direction too", () => {
  // A resume that arrives while a list showing the old pause is still in flight.
  assert.deepEqual(
    resolveTranscriptPause({ windows: [open], event: { paused: false } }),
    { paused: false, since: null, known: true },
  );
});

test("clearing the event hands the answer back to the list — the reconnect contract", () => {
  // Events fired while the socket was down were never delivered, so the caller drops the event
  // on reconnect. Without this the panel would hold a stale pause for the rest of the meeting.
  assert.deepEqual(
    resolveTranscriptPause({ windows: [open], event: null }),
    { paused: true, since: open.startedAt, known: true },
  );
});

// ── somebody who joins mid-pause ─────────────────────────────────────────────

test("a joiner learns from the window list, with no broadcast to go on", () => {
  // The failure the room lock still has, quoted in this module's header: state learnable ONLY
  // from a broadcast means anyone who arrives after it is told nothing. This is also the only
  // path that can show WHEN the pause began.
  const state = resolveTranscriptPause({ windows: [open], event: null });
  assert.deepEqual(state, { paused: true, since: open.startedAt, known: true });
});

// ── "not told yet" is its own answer ─────────────────────────────────────────

test("before anything has loaded the state is unknown, not running", () => {
  assert.deepEqual(
    resolveTranscriptPause({ windows: undefined, event: null }),
    TRANSCRIPT_PAUSE_UNKNOWN,
  );
  assert.equal(TRANSCRIPT_PAUSE_UNKNOWN.known, false);
});

test("a failed request stays unknown rather than asserting the transcript runs", () => {
  // A request that resolved to nothing useful is silence, not a claim that it runs.
  assert.equal(resolveTranscriptPause({ windows: null, event: null }).known, false);
});

test("an event alone is enough to be known, even with no list", () => {
  assert.deepEqual(
    resolveTranscriptPause({ windows: null, event: { paused: true } }),
    { paused: true, since: null, known: true },
  );
});

test("an empty list is an answer — running, and known", () => {
  // Distinct from no list at all. A room nobody has ever paused returns [], and that is a fact.
  assert.deepEqual(
    resolveTranscriptPause({ windows: [], event: null }),
    { paused: false, since: null, known: true },
  );
});
