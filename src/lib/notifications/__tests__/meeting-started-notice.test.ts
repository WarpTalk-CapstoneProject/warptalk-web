/**
 * The Join button that was never there.
 *
 * The popup shipped and rendered correctly worded, minus the one control that made it useful,
 * because the realtime payload spells its fields `action_url` / `payload_json` and the client
 * read `actionUrl` / `payloadJson`. Nothing threw and nothing logged. These tests pin BOTH
 * spellings, so the next field to arrive cannot repeat it quietly.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { readMeetingStartedNotice, toInternalHref } from "../meeting-started-notice.ts";

const payload = (fields: Record<string, string>) => JSON.stringify(fields);

/** Our own origin, passed explicitly — see toInternalHref's note on why it is not read from window. */
const APP = "https://app.warptalk.io.vn";

test("the realtime shape (snake_case) yields a join target — the case that was broken", () => {
  const notice = readMeetingStartedNotice({
    type: "MEETING_STARTED",
    title: '"Meeting in Real time" has started',
    content: '"Meeting in Real time" is live now. Join when you\'re ready.',
    action_url: "https://app.warptalk.io.vn/room/abc-123",
    payload_json: payload({ room_id: "abc-123", room_title: "Meeting in Real time" }),
  }, APP);

  assert.equal(notice?.title, "Meeting in Real time");
  assert.equal(notice?.joinHref, "/room/abc-123");
});

test("the REST shape (camelCase) yields the same result", () => {
  const notice = readMeetingStartedNotice({
    type: "MEETING_STARTED",
    title: '"Standup" has started',
    actionUrl: "/room/xyz-789",
    payloadJson: payload({ roomId: "xyz-789", roomTitle: "Standup" }),
  }, APP);

  assert.equal(notice?.title, "Standup");
  assert.equal(notice?.joinHref, "/room/xyz-789");
});

test("room_id alone is enough to join — action_url is not required", () => {
  // room_id is a REQUIRED field of this notification type, so this is a fallback, not a guess.
  const notice = readMeetingStartedNotice({
    type: "MEETING_STARTED",
    title: "Something started",
    payload_json: payload({ room_id: "only-the-id" }),
  });

  assert.equal(notice?.joinHref, "/room/only-the-id");
});

test("no link and no room id degrades to a notice, not to a crash", () => {
  const notice = readMeetingStartedNotice({ type: "MEETING_STARTED", title: "A meeting started" });
  assert.equal(notice?.joinHref, null);
  assert.equal(notice?.title, "A meeting started");
});

test("a malformed payload_json does not throw", () => {
  // This runs inside a SignalR callback. Throwing there kills the connection's whole handler.
  const notice = readMeetingStartedNotice({
    type: "MEETING_STARTED",
    title: "Fallback title",
    payload_json: "{not json at all",
  });

  assert.equal(notice?.title, "Fallback title");
  assert.equal(notice?.joinHref, null);
});

test("other notification types are not ours to render", () => {
  assert.equal(readMeetingStartedNotice({ type: "MEETING_INVITED", title: "x" }), null);
  assert.equal(readMeetingStartedNotice({ title: "no type" }), null);
});

test("an absolute link to our own app becomes a client-side path", () => {
  // A full page load would tear down the LiveKit session the mini dock is holding open.
  assert.equal(toInternalHref("https://app.warptalk.io.vn/room/a?x=1", APP), "/room/a?x=1");
  assert.equal(toInternalHref("/room/a", APP), "/room/a");
});

test("a link to somewhere else is discarded, not followed", () => {
  // Join is one click. A notification payload does not get to choose the destination.
  // The null-origin cases below are server rendering: an absolute URL we cannot verify is one
  // we do not follow. The first version of this read window.location and so skipped the check
  // entirely wherever window was absent.
  assert.equal(toInternalHref("https://app.warptalk.io.vn/room/a", null), null);
  assert.equal(toInternalHref("//evil.example.com/room/a", APP), null);
  assert.equal(toInternalHref("/\\evil.example.com/room/a", APP), null);
  assert.equal(toInternalHref("https://evil.example.com/room/a", APP), null);
  assert.equal(toInternalHref("javascript:alert(1)", APP), null);
  assert.equal(toInternalHref(null, APP), null);
  assert.equal(toInternalHref("", APP), null);
});

test("an off-origin action_url still falls back to the room id", () => {
  const notice = readMeetingStartedNotice({
    type: "MEETING_STARTED",
    title: "Hijack attempt",
    action_url: "https://evil.example.com/steal",
    payload_json: payload({ room_id: "real-room" }),
  }, APP);

  assert.equal(notice?.joinHref, "/room/real-room");
});
