import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  PRESENCE_LABELS,
  SEAT_HOLDING_STATUSES,
  holdsSeat,
  isInLobby,
  participantPresence,
  roomOccupancy,
} from "../room-occupancy.ts";

test("a seat is held by CONNECTED only, matching the backend's ratified rule", () => {
  assert.deepEqual([...SEAT_HOLDING_STATUSES], ["connected"]);
  assert.equal(holdsSeat("connected"), true);
  assert.equal(holdsSeat("CONNECTED"), true);
  assert.equal(holdsSeat(" Connected "), true);

  for (const status of [
    "invited",
    "waiting",
    "joined",
    "disconnected",
    "left",
    "kicked",
    "removed",
    "rejected",
    "",
    undefined,
    null,
  ]) {
    assert.equal(holdsSeat(status), false, `${status} must not hold a seat`);
  }
});

test("the lobby is present but never against capacity", () => {
  assert.equal(isInLobby("waiting"), true);
  assert.equal(isInLobby("WAITING"), true);
  assert.equal(isInLobby("connected"), false);

  const occupancy = roomOccupancy({
    capacity: 100,
    participants: [{ status: "waiting" }, { status: "waiting" }],
  });
  assert.equal(occupancy.seatCount, 0);
  assert.equal(occupancy.lobby.length, 2);
  assert.equal(occupancy.label, "0/100");
});

test("WT-274: the host alone in the room reads as 1/100 everywhere, not 0", () => {
  // The exact production shape: host CONNECTED, one invitee still INVITED, one in the lobby.
  const occupancy = roomOccupancy({
    capacity: 100,
    participants: [
      { status: "connected", id: "host" },
      { status: "invited", id: "invitee" },
      { status: "waiting", id: "lobby" },
    ],
  });

  assert.equal(occupancy.seatCount, 1);
  assert.equal(occupancy.label, "1/100");
  assert.deepEqual(
    occupancy.seated.map((participant) => participant.id),
    ["host"],
  );
  assert.equal(occupancy.fromRoster, true);
});

test("an empty roster means zero, not unknown — the fallback is only for no roster at all", () => {
  const withEmptyRoster = roomOccupancy({
    capacity: 50,
    participants: [],
    fallbackCount: 7,
  });
  assert.equal(withEmptyRoster.seatCount, 0);
  assert.equal(withEmptyRoster.fromRoster, true);

  const withoutRoster = roomOccupancy({
    capacity: 50,
    participants: null,
    fallbackCount: 7,
  });
  assert.equal(withoutRoster.seatCount, 7);
  assert.equal(withoutRoster.label, "7/50");
  assert.equal(withoutRoster.fromRoster, false);
});

test("capacity and fullness degrade safely on missing numbers", () => {
  const unknown = roomOccupancy({ participants: [{ status: "connected" }] });
  assert.equal(unknown.capacity, 0);
  assert.equal(unknown.label, "1/0");
  // A room with no declared capacity is never reported as full — that would lock people out.
  assert.equal(unknown.isFull, false);

  const full = roomOccupancy({
    capacity: 2,
    participants: [{ status: "connected" }, { status: "connected" }],
  });
  assert.equal(full.isFull, true);
});

// ── WT-308: a participant's row label ─────────────────────────────────────────

test("WT-308: a CONNECTED host reads as present, never as Left", () => {
  // The exact production report: host creates a meeting, opens it, opens the People tab.
  // The backend seeds that host row CONNECTED at room creation, so this is the status the
  // panel is handed the first time it ever renders the host.
  assert.equal(participantPresence("connected"), "connected");
  assert.equal(PRESENCE_LABELS[participantPresence("connected")], "Connected");
  assert.notEqual(PRESENCE_LABELS[participantPresence("connected")], "Left");

  // Uppercase is what the backend actually stores; the client lowercases on normalize, but
  // presence must not depend on that having happened.
  assert.equal(participantPresence("CONNECTED"), "connected");

  // Once LiveKit sees them, the live signal wins.
  assert.equal(participantPresence("connected", { isInRoom: true }), "in-room");
});

test("WT-308: only the genuinely terminal statuses read as Left", () => {
  for (const status of ["left", "kicked", "removed", "rejected"]) {
    assert.equal(participantPresence(status), "left", `${status} is terminal`);
  }

  // Everything else must not claim the person departed — including statuses this module
  // has never heard of. The bug was a bare `else` arm that did exactly that.
  for (const status of [
    "connected",
    "joined",
    "waiting",
    "invited",
    "disconnected",
    "some_status_added_later",
    "",
    undefined,
    null,
  ]) {
    assert.notEqual(
      participantPresence(status),
      "left",
      `${status} must not read as Left`,
    );
  }

  assert.equal(participantPresence("some_status_added_later"), "not-in-room");
});

test("WT-308: presence covers the participant_status enum exhaustively", () => {
  // The Postgres enum, verbatim. `joined` is not in it but still arrives on older payloads.
  assert.deepEqual(
    ["invited", "waiting", "connected", "disconnected", "left", "kicked", "rejected"].map(
      (status) => participantPresence(status),
    ),
    ["not-in-room", "lobby", "connected", "disconnected", "left", "left", "left"],
  );

  assert.equal(participantPresence("joined"), "connected");
  assert.equal(participantPresence("waiting"), "lobby");
  assert.equal(PRESENCE_LABELS[participantPresence("waiting")], "Waiting in Lobby");
});

test("WT-308: the People panel derives presence from this module, not its own chain", () => {
  const panel = readFileSync(
    new URL(
      "../../../components/rooms/live/side-panel/people-panel.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(panel, /participantPresence\(/);
  assert.match(panel, /from "@\/lib\/meeting\/room-occupancy"/);

  // The regression guard. The old chain ended in a bare `else` that rendered the literal
  // string "Left", which is what a CONNECTED host hit. No surface may spell that label
  // itself again — it comes from PRESENCE_LABELS or it does not appear.
  assert.doesNotMatch(
    panel,
    />\s*Left\s*</,
    'people-panel must not hard-code a "Left" badge; route it through PRESENCE_LABELS',
  );
  // `disconnected` and `invited` are presence, and nothing but the badge ever asked about
  // them — so their absence is a precise signal that the inline chain is gone. (A remaining
  // `status === "waiting"` is deliberate and NOT presence: it gates the host's Approve /
  // Reject controls, which is an action, not a label.)
  assert.doesNotMatch(
    panel,
    /participant\.status === "(invited|disconnected)"/,
    "people-panel must not re-derive presence with an inline status chain",
  );
});
