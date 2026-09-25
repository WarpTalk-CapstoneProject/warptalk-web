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

import {
  readMeetingInviteNotice,
  readMeetingStartedNotice,
  toInternalHref,
} from "../meeting-started-notice.ts";

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

// ── Invitations ─────────────────────────────────────────────────────────────────────────────
//
// The invite notice carries one field its sibling does not: `roomId`. Accept posts to
// /translation-rooms/{roomId}/invitations/accept, and the room's UUID exists ONLY in the payload —
// the server builds action_url from the room CODE ("/room/{roomCode}"), which that endpoint does
// not accept. Reading the id out of the href would 404 every time, so it is pinned here.

test("an invitation yields the room UUID from the payload, not from the link", () => {
  const notice = readMeetingInviteNotice({
    type: "MEETING_INVITED",
    title: 'You were invited to "Sprint review"',
    // The link is built from the room CODE — deliberately different from room_id below.
    action_url: "https://app.warptalk.io.vn/room/ABC-123",
    payload_json: payload({
      room_id: "019ff9e1-e3e2-7024-99b7-6e37c6a18392",
      room_title: "Sprint review",
    }),
  }, APP);

  assert.equal(notice?.title, "Sprint review");
  assert.equal(notice?.roomId, "019ff9e1-e3e2-7024-99b7-6e37c6a18392");
  assert.equal(notice?.joinHref, "/room/ABC-123");
});

test("the REST shape (camelCase) reads the same invitation", () => {
  const notice = readMeetingInviteNotice({
    type: "MEETING_INVITED",
    title: "You were invited",
    actionUrl: "/room/XYZ-789",
    payloadJson: payload({ roomId: "room-uuid", roomTitle: "Standup" }),
  }, APP);

  assert.equal(notice?.title, "Standup");
  assert.equal(notice?.roomId, "room-uuid");
});

test("an invitation with no payload still informs — it just cannot be accepted here", () => {
  // Accept needs the id; the card checks `roomId` and hides the button rather than posting to
  // /translation-rooms/undefined/invitations/accept.
  const notice = readMeetingInviteNotice({ type: "MEETING_INVITED", title: "You were invited" });

  assert.equal(notice?.roomId, null);
  assert.equal(notice?.joinHref, null);
  assert.equal(notice?.title, "You were invited");
});

test("a started meeting is not an invitation, and vice versa", () => {
  // The two cards can be on screen at once, so each reader must refuse the other's type outright.
  assert.equal(readMeetingInviteNotice({ type: "MEETING_STARTED", title: "x" }), null);
  assert.equal(readMeetingInviteNotice({ type: "MEETING_INVITE", title: "x" }), null);
  assert.equal(readMeetingInviteNotice({ title: "no type" }), null);
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

// ── WT-612 / WT-621: MEETING_OPENED ─────────────────────────────────────────

test("an opened meeting is read, and says which kind it is", () => {
  const notice = readMeetingStartedNotice({
    type: "MEETING_OPENED",
    title: '"Weekly sync" is open',
    payload_json: payload({ room_id: "abc-123", room_title: "Weekly sync" }),
  }, APP);

  assert.equal(notice?.kind, "opened");
  assert.equal(notice?.title, "Weekly sync");
});

test("a started meeting still reports itself as started", () => {
  const notice = readMeetingStartedNotice({
    type: "MEETING_STARTED",
    payload_json: payload({ room_id: "abc-123" }),
  }, APP);

  assert.equal(notice?.kind, "started");
});

// THE POINT OF THE WHOLE BRANCH. `/room/{id}` forwards into /live, which skips device setup —
// correct for a call already running, wrong for a room the clock opened with nobody in it. The
// plural `/rooms/{id}` is the room page, where Join opens the setup modal.
test("an opened meeting goes to the room page, never through the live door", () => {
  const notice = readMeetingStartedNotice({
    type: "MEETING_OPENED",
    payload_json: payload({ room_id: "abc-123" }),
  }, APP);

  assert.equal(notice?.joinHref, "/rooms/abc-123");
});

test("an opened meeting ignores the server's action_url", () => {
  // The server mints one link per notification and emails it too, so it is the live door by
  // construction. Honouring it here would put the reader back in /live with no setup.
  const notice = readMeetingStartedNotice({
    type: "MEETING_OPENED",
    action_url: "https://app.warptalk.io.vn/room/abc-123",
    payload_json: payload({ room_id: "abc-123" }),
  }, APP);

  assert.equal(notice?.joinHref, "/rooms/abc-123");
});

test("an opened meeting with no room id informs without a dead button", () => {
  const notice = readMeetingStartedNotice({
    type: "MEETING_OPENED",
    title: "A meeting is open",
    action_url: "https://app.warptalk.io.vn/room/abc-123",
  }, APP);

  assert.equal(notice?.title, "A meeting is open");
  assert.equal(notice?.joinHref, null);
});

test("MEETING_OPENED is not an invitation either", () => {
  assert.equal(readMeetingInviteNotice({ type: "MEETING_OPENED", title: "x" }), null);
});
