import assert from "node:assert/strict";
import test from "node:test";

import {
  SEAT_HOLDING_STATUSES,
  holdsSeat,
  isInLobby,
  roomOccupancy,
} from "./room-occupancy.ts";

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
