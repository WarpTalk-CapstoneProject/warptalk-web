import assert from "node:assert/strict";
import test from "node:test";

import {
  canJoinTranslationRoom,
  resolveRoomEntryIntent,
  shouldEnterWaitingRoom,
} from "../translation-room-access.ts";

test("WT-273: the host is never sent to the lobby to wait for himself", () => {
  for (const status of ["scheduled", "waiting"] as const) {
    assert.equal(
      shouldEnterWaitingRoom(status, { isHost: true }),
      false,
      `host must not wait in a ${status} room`,
    );
    assert.equal(shouldEnterWaitingRoom(status, { isHost: false }), true);
    // No host information: unchanged pre-WT-273 behaviour.
    assert.equal(shouldEnterWaitingRoom(status), true);
  }
});

test("WT-273: a host looking at a room that has not started gets the host affordance", () => {
  const intent = resolveRoomEntryIntent({
    status: "scheduled",
    isHost: true,
    statusLabel: "Scheduled",
    scheduledAtLabel: "Aug 5, 2026, 9:00 AM",
  });

  assert.equal(intent.mode, "host_start");
  assert.equal(intent.label, "Start meeting");
  assert.equal(intent.isActionable, true);
  assert.ok(
    !/wait/i.test(intent.helpText ?? ""),
    "the host must never be told to wait",
  );
});

test("a non-host looking at the same room still gets the lobby, with the start time", () => {
  const intent = resolveRoomEntryIntent({
    status: "scheduled",
    isHost: false,
    statusLabel: "Scheduled",
    scheduledAtLabel: "Aug 5, 2026, 9:00 AM",
  });

  assert.equal(intent.mode, "lobby");
  assert.equal(intent.label, "Enter waiting room");
  assert.equal(
    intent.helpText,
    "This meeting starts Aug 5, 2026, 9:00 AM. You'll wait in the lobby until the host opens it.",
  );
});

test("a live room is joined directly, by host and guest alike", () => {
  for (const isHost of [true, false]) {
    const intent = resolveRoomEntryIntent({
      status: "in_progress",
      isHost,
      statusLabel: "In Progress",
    });
    assert.equal(intent.mode, "join");
    assert.equal(intent.label, "Join meeting");
    assert.equal(intent.helpText, null);
  }
});

test("a participant active in the meeting sees Return to meeting", () => {
  const intent = resolveRoomEntryIntent({
    status: "in_progress",
    isHost: false,
    statusLabel: "In Progress",
    isActiveInMeeting: true,
  });
  assert.equal(intent.mode, "join");
  assert.equal(intent.label, "Return to meeting");
});

// WT-341: a busy host must not be able to strand the meeting.
test("WT-341: a guest may open a meeting that does not require approval", () => {
  // The deadlock: this used to be `mode: "lobby"` for every non-host, which meant a host who
  // was busy made the meeting unstartable by anyone, for as long as they stayed busy.
  const intent = resolveRoomEntryIntent({
    status: "scheduled",
    isHost: false,
    statusLabel: "Scheduled",
    scheduledAtLabel: "Aug 5, 2026, 9:00 AM",
    requiresApproval: false,
  });

  assert.equal(intent.mode, "host_start");
  assert.equal(intent.label, "Start meeting");
  assert.equal(intent.isActionable, true);
  // Unlike the host, a guest is told what the button does to everyone else.
  assert.ok(
    /everyone invited/i.test(intent.helpText ?? ""),
    "a guest must be told that opening it lets the others in",
  );
});

test("WT-341: an approval-gated meeting stays the host's to open", () => {
  // The half that must NOT be relaxed. Only the host can clear the lobby of an approval-gated
  // room, so letting a guest open it produces a live meeting whose door nobody can answer.
  const intent = resolveRoomEntryIntent({
    status: "waiting",
    isHost: false,
    statusLabel: "Waiting",
    requiresApproval: true,
  });

  assert.equal(intent.mode, "lobby");
  assert.equal(intent.label, "Enter waiting room");
});

test("WT-341: an unknown approval setting is treated as approval required", () => {
  // Fail closed. A room saved before the field existed, or a payload that simply omits it, must
  // keep the host-opens-it behaviour rather than becoming startable by anyone because a property
  // was missing.
  assert.equal(shouldEnterWaitingRoom("scheduled", { isHost: false }), true);
  assert.equal(
    shouldEnterWaitingRoom("scheduled", {
      isHost: false,
      requiresApproval: undefined,
    }),
    true,
  );
  assert.equal(
    resolveRoomEntryIntent({
      status: "scheduled",
      isHost: false,
      statusLabel: "Scheduled",
    }).mode,
    "lobby",
  );
});

test("a terminal room offers nothing, and says which terminal state it is in", () => {
  for (const status of [
    "ended",
    "cancelled",
    "expired",
    "failed",
    "timeout",
  ] as const) {
    assert.equal(canJoinTranslationRoom(status), false);
    const intent = resolveRoomEntryIntent({
      status,
      isHost: true,
      statusLabel: "Ended",
    });
    assert.equal(intent.mode, "unavailable");
    assert.equal(intent.isActionable, false);
    assert.equal(intent.label, "Ended");
  }
});
