import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { meetingRelation } from "../meeting-relation.ts";
import { resolveOccursAt } from "../meeting-occurs-at.ts";

describe("Calendar — how the viewer stands to a meeting", () => {
  test("the host is the host, invitation or not", () => {
    assert.equal(meetingRelation({ isHost: true }), "host");
    assert.equal(meetingRelation({ isHost: true, viewerInvitationStatus: "ACCEPTED" }), "host");
  });

  test("any stored invitation makes a non-host invited", () => {
    for (const status of ["PENDING", "ACCEPTED", "DECLINED", "accepted"]) {
      assert.equal(meetingRelation({ isHost: false, viewerInvitationStatus: status }), "invited", status);
    }
  });

  test("a non-host with no invitation is a participant, not invited (bridge on the same Meet)", () => {
    assert.equal(meetingRelation({ isHost: false, viewerInvitationStatus: null }), "participant");
    assert.equal(meetingRelation({ isHost: false }), "participant");
    assert.equal(meetingRelation({ isHost: false, viewerInvitationStatus: "  " }), "participant");
  });

  test("only an explicit yes is the host", () => {
    assert.equal(meetingRelation({ isHost: null, viewerInvitationStatus: "PENDING" }), "invited");
    assert.equal(meetingRelation({}), "participant");
  });
});

describe("Calendar — the date a meeting is placed on matches the server's range filter", () => {
  const created = "2026-09-20T08:00:00Z";
  const started = "2026-09-25T09:00:00Z";
  const scheduled = "2026-09-24T09:00:00Z";

  test("the booked slot first", () => {
    assert.equal(resolveOccursAt({ scheduledAt: scheduled, startedAt: started, createdAt: created }), scheduled);
  });

  test("then when it started", () => {
    assert.equal(resolveOccursAt({ scheduledAt: null, startedAt: started, createdAt: created }), started);
  });

  test("a room that ended without starting is placed on its creation date, as the server filters it", () => {
    const room = { scheduledAt: null, startedAt: null, endedAt: "2026-09-30T10:00:00Z", createdAt: created };
    assert.equal(resolveOccursAt(room), created);
  });
});
