/**
 * WT-708 — the MEETING_SERIES_BLOCKED notification is read from either payload spelling and
 * leads to a meeting of the series, since it carries no action_url and there is no series page.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  readSeriesBlockedNotice,
  seriesBlockedRoomId,
} from "../series-blocked-notice.ts";

const payload = JSON.stringify({ series_id: "series-1", series_title: "Weekly sync" });

test("reads the series from the REST and the realtime spelling", () => {
  assert.deepEqual(readSeriesBlockedNotice({ type: "MEETING_SERIES_BLOCKED", payloadJson: payload }), {
    seriesId: "series-1",
    seriesTitle: "Weekly sync",
  });
  assert.deepEqual(readSeriesBlockedNotice({ type: "MEETING_SERIES_BLOCKED", payload_json: payload }), {
    seriesId: "series-1",
    seriesTitle: "Weekly sync",
  });
});

test("other types, and payloads with no series, are not this notice", () => {
  assert.equal(readSeriesBlockedNotice({ type: "MEETING_STARTED", payloadJson: payload }), null);
  assert.equal(readSeriesBlockedNotice({ type: "MEETING_SERIES_BLOCKED", payloadJson: "{}" }), null);
  assert.equal(readSeriesBlockedNotice({ type: "MEETING_SERIES_BLOCKED", payloadJson: "not json" }), null);
  assert.equal(readSeriesBlockedNotice({ type: "MEETING_SERIES_BLOCKED" }), null);
});

test("a missing title is null, not invented", () => {
  const notice = readSeriesBlockedNotice({
    type: "MEETING_SERIES_BLOCKED",
    payloadJson: JSON.stringify({ series_id: "series-1" }),
  });
  assert.equal(notice?.seriesTitle, null);
});

test("opens the current occurrence, else the most recent one", () => {
  assert.equal(
    seriesBlockedRoomId({ currentOccurrenceId: "now", occurrences: [{ id: "old", scheduledAt: "2026-01-01T00:00:00Z" }] }),
    "now",
  );
  assert.equal(
    seriesBlockedRoomId({
      currentOccurrenceId: null,
      occurrences: [
        { id: "a", scheduledAt: "2026-09-01T09:00:00Z" },
        { id: "b", scheduledAt: "2026-09-08T09:00:00Z" },
        { id: "c", scheduledAt: null },
      ],
    }),
    "b",
  );
  assert.equal(seriesBlockedRoomId({ occurrences: [] }), null);
  assert.equal(seriesBlockedRoomId(null), null);
});
