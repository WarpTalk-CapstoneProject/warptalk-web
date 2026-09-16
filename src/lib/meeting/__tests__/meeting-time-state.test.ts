import assert from "node:assert/strict";
import test from "node:test";

import {
  MISSED_GRACE_MS,
  resolveMeetingTimeState,
  viewerAttended,
} from "../meeting-time-state.ts";
import type { MeetingTimeStateInput } from "../meeting-time-state.ts";

const NOW = Date.parse("2026-09-04T12:00:00.000Z");
const VIEWER = "viewer-1";

function meeting(overrides: Partial<MeetingTimeStateInput> = {}): MeetingTimeStateInput {
  return {
    status: "scheduled",
    occursAt: new Date(NOW).toISOString(),
    participants: [],
    ...overrides,
  };
}

function at(offsetMs: number) {
  return new Date(NOW + offsetMs).toISOString();
}

function resolve(input: MeetingTimeStateInput, viewerUserId: string | null = VIEWER) {
  return resolveMeetingTimeState(input, { viewerUserId, now: NOW });
}

test("WT-538: the bug — a booked room nobody opened stops being Upcoming", () => {
  // The exact production shape: SCHEDULED forever, slot a week gone, no roster activity.
  const stale = meeting({
    status: "scheduled",
    occursAt: at(-7 * 24 * 60 * 60 * 1000),
    participants: [{ userId: VIEWER, status: "invited" }],
  });

  assert.equal(resolve(stale), "missed");
  // And it does not depend on knowing who is looking: nobody attended a meeting that never ran.
  assert.equal(resolve(stale, null), "missed");
});

test("WT-538: the grace window keeps the old 09:05 argument true", () => {
  // The reasoning the previous implementation was defending: a room booked for 09:00 that nobody
  // has opened has NOT started at 09:05, and must not be painted as over.
  assert.equal(resolve(meeting({ occursAt: at(-5 * 60 * 1000) })), "upcoming");

  // A host running badly late is still a host who might arrive.
  assert.equal(resolve(meeting({ occursAt: at(-45 * 60 * 1000) })), "upcoming");

  // Right on the boundary is still upcoming; the comparison is strictly greater.
  assert.equal(resolve(meeting({ occursAt: at(-MISSED_GRACE_MS) })), "upcoming");
  assert.equal(resolve(meeting({ occursAt: at(-MISSED_GRACE_MS - 1) })), "missed");
});

test("a room that is open now is live, whatever its slot said", () => {
  for (const status of ["in_progress", "waiting", "paused"] as const) {
    assert.equal(
      resolve(meeting({ status, occursAt: at(-30 * 24 * 60 * 60 * 1000) })),
      "live",
      `${status} is reachable now`,
    );
  }
});

test("WT-538: a finished meeting splits on whether the viewer was actually in it", () => {
  // Attended — including KICKED, which is the decision worth pinning. You cannot be thrown out of
  // a room you were never in, so being removed is evidence of presence, not of absence.
  for (const status of ["connected", "disconnected", "left", "kicked", "removed"] as const) {
    assert.equal(
      resolve(meeting({ status: "ended", participants: [{ userId: VIEWER, status }] })),
      "joined",
      `${status} means the viewer was in the room`,
    );
  }

  // Never got in.
  for (const status of ["invited", "waiting", "rejected"] as const) {
    assert.equal(
      resolve(meeting({ status: "ended", participants: [{ userId: VIEWER, status }] })),
      "missed",
      `${status} means the viewer never arrived`,
    );
  }
});

test("WT-538: somebody else's roster status is not the viewer's", () => {
  const ended = meeting({
    status: "ended",
    participants: [
      { userId: "someone-else", status: "connected" },
      { userId: VIEWER, status: "invited" },
    ],
  });

  assert.equal(resolve(ended), "missed");
  // And the person who was there sees the same meeting differently. This is precisely why the
  // answer cannot be a field frozen into a shared cache entry.
  assert.equal(resolve(ended, "someone-else"), "joined");
});

test("WT-538: with no evidence, we do not accuse anyone of missing anything", () => {
  const ended = meeting({ status: "ended", participants: [] });

  // No roster at all, no row for the viewer, an unrecognised status, and nobody signed in: four
  // different ways of not knowing, and none of them is a reason to say "you missed this".
  assert.equal(resolve(ended), "joined");
  assert.equal(resolve(meeting({ status: "ended", participants: [{ userId: "other" }] })), "joined");
  assert.equal(
    resolve(
      meeting({
        status: "ended",
        participants: [{ userId: VIEWER, status: "some_status_added_later" as never }],
      }),
    ),
    "joined",
  );
  assert.equal(
    resolve(meeting({ status: "ended", participants: [{ userId: VIEWER, status: "invited" }] }), null),
    "joined",
  );
});

test("viewerAttended is three-valued: yes, no, and no evidence", () => {
  assert.equal(viewerAttended([{ userId: VIEWER, status: "connected" }], VIEWER), true);
  assert.equal(viewerAttended([{ userId: VIEWER, status: "invited" }], VIEWER), false);
  assert.equal(viewerAttended([], VIEWER), null);
  assert.equal(viewerAttended([{ userId: VIEWER }], VIEWER), null);
  assert.equal(viewerAttended([{ userId: VIEWER, status: "connected" }], null), null);

  // Casing and stray whitespace are the wire's problem, not the caller's.
  assert.equal(viewerAttended([{ userId: VIEWER, status: " CONNECTED " as never }], VIEWER), true);
});

test("invited by email only, never came, meeting over → missed, not joined", () => {
  // The reported bug. The email route onto the timeline writes no participant row, so the roster
  // is silent about the viewer; the invitation is what says they were expected.
  for (const invitation of ["PENDING", "ACCEPTED", " pending "]) {
    assert.equal(
      resolve(
        meeting({
          status: "ended",
          participants: [{ userId: "someone-else", status: "connected" }],
          viewerInvitationStatus: invitation,
        }),
      ),
      "missed",
      `an ${invitation.trim()} invitation with no roster row is a no-show`,
    );
  }

  assert.equal(
    resolve(meeting({ status: "ended", participants: [], viewerInvitationStatus: "PENDING" })),
    "missed",
  );
});

test("a participant row always outranks the invitation", () => {
  // Accepted and then actually came: the row is what happened, the invitation only what was asked.
  assert.equal(
    resolve(
      meeting({
        status: "ended",
        participants: [{ userId: VIEWER, status: "left" }],
        viewerInvitationStatus: "ACCEPTED",
      }),
    ),
    "joined",
  );

  // A row the resolver cannot read stays "no evidence" — the invitation does not get to break the
  // tie against a row that exists.
  assert.equal(
    resolve(
      meeting({
        status: "ended",
        participants: [{ userId: VIEWER, status: "some_status_added_later" as never }],
        viewerInvitationStatus: "PENDING",
      }),
    ),
    "joined",
  );

  // And a row that says "never got in" is still missed, invitation or not.
  assert.equal(
    resolve(
      meeting({
        status: "ended",
        participants: [{ userId: VIEWER, status: "waiting" }],
        viewerInvitationStatus: "ACCEPTED",
      }),
    ),
    "missed",
  );
});

test("no usable invitation keeps the conservative joined", () => {
  const ended = { status: "ended" as const, participants: [] };

  // An older backend sends no field at all; a current one omits it when there is no invitation.
  assert.equal(resolve(meeting(ended)), "joined");
  assert.equal(resolve(meeting({ ...ended, viewerInvitationStatus: null })), "joined");
  // DECLINED (written by nothing today) and states added later say nothing about attendance.
  assert.equal(resolve(meeting({ ...ended, viewerInvitationStatus: "DECLINED" })), "joined");
  assert.equal(resolve(meeting({ ...ended, viewerInvitationStatus: "EXPIRED" })), "joined");
  // Not knowing who is looking means not knowing whether a row is theirs, and a row would win.
  assert.equal(resolve(meeting({ ...ended, viewerInvitationStatus: "PENDING" }), null), "joined");
});

test("the invitation changes nothing before the meeting is over", () => {
  const invited = { participants: [], viewerInvitationStatus: "PENDING" };

  assert.equal(resolve(meeting({ ...invited, status: "scheduled", occursAt: at(60 * 60 * 1000) })), "upcoming");
  assert.equal(resolve(meeting({ ...invited, status: "scheduled", occursAt: at(-5 * 60 * 1000) })), "upcoming");
  assert.equal(resolve(meeting({ ...invited, status: "in_progress" })), "live");
  assert.equal(resolve(meeting({ ...invited, status: "waiting" })), "live");
});

test("viewerAttended reads the invitation only when the viewer has no row", () => {
  assert.equal(viewerAttended([], VIEWER, "PENDING"), false);
  assert.equal(viewerAttended([], VIEWER, "accepted"), false);
  assert.equal(viewerAttended([], VIEWER, "DECLINED"), null);
  assert.equal(viewerAttended([], VIEWER, null), null);
  assert.equal(viewerAttended([], VIEWER), null);
  assert.equal(viewerAttended([], null, "PENDING"), null);
  assert.equal(viewerAttended([{ userId: VIEWER, status: "connected" }], VIEWER, "PENDING"), true);
});

test("a cancelled meeting lands in the missed bucket, and the page still calls it Cancelled", () => {
  // Nobody attended a meeting that was called off, so "joined" would be a false claim. The
  // schedules page tests `status === "cancelled"` before it ever reads this value, which is why
  // this bucketing is invisible on screen — see stateBadgeLabel.
  assert.equal(
    resolve(meeting({ status: "cancelled", participants: [{ userId: VIEWER, status: "invited" }] })),
    "missed",
  );
  // Same for somebody invited by email only — and the same on-screen label wins over it.
  assert.equal(
    resolve(meeting({ status: "cancelled", participants: [], viewerInvitationStatus: "PENDING" })),
    "missed",
  );
});

test("an unreadable timestamp is not evidence the slot has passed", () => {
  assert.equal(resolve(meeting({ status: "scheduled", occursAt: "not-a-date" })), "upcoming");
});

test("with no clock yet, nothing decays — but attendance still answers", () => {
  const noClock = { viewerUserId: VIEWER, now: null };

  // The pre-hydration pass must not read a clock, so a stale booking stays upcoming for that one
  // render rather than depending on when the render happened.
  assert.equal(
    resolveMeetingTimeState(meeting({ occursAt: at(-30 * 24 * 60 * 60 * 1000) }), noClock),
    "upcoming",
  );

  // Attendance needs no clock at all, so it is answered normally.
  assert.equal(
    resolveMeetingTimeState(
      meeting({ status: "ended", participants: [{ userId: VIEWER, status: "invited" }] }),
      noClock,
    ),
    "missed",
  );
});
