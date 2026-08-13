// A suggestion that is always there is not a suggestion.
//
// The properties worth pinning are the ones a reader of the component cannot check by looking:
// that the roll holds still for a whole day (so the card never appears and vanishes mid-click),
// that it differs between workspaces and between days (so it is a suggestion and not a
// schedule), and that dismissing it is actually respected for the full snooze.

import assert from "node:assert/strict";
import test from "node:test";

import {
  CROWDED_MEMBER_COUNT,
  INVITE_SNOOZE_DAYS,
  shouldSuggestInvite,
} from "../invite-suggestion.ts";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 7, 13, 10, 0, 0);

function ask(overrides: Partial<Parameters<typeof shouldSuggestInvite>[0]> = {}) {
  return shouldSuggestInvite({
    workspaceId: "ws-1",
    memberCount: 3,
    dismissedAtMs: null,
    nowMs: NOW,
    ...overrides,
  });
}

test("a workspace of one is always asked", () => {
  // The Owner alone in a workspace they just created is the entire point of the card. Rolling
  // dice on that case withholds the one prompt that is always relevant.
  assert.equal(ask({ memberCount: 1 }), true);
});

test("an unknown member count says nothing", () => {
  // Appearing and then disappearing once the count loads is worse than appearing a moment late.
  assert.equal(ask({ memberCount: 0 }), false);
});

test("a workspace that already has a team is left alone", () => {
  assert.equal(ask({ memberCount: CROWDED_MEMBER_COUNT }), false);
  assert.equal(ask({ memberCount: CROWDED_MEMBER_COUNT + 40 }), false);
});

test("dismissing it is respected for the whole snooze, and no longer", () => {
  const dismissedAtMs = NOW - 1000;
  assert.equal(ask({ memberCount: 1, dismissedAtMs }), false);

  // Still inside the window on the last day.
  assert.equal(
    ask({
      memberCount: 1,
      dismissedAtMs,
      nowMs: dismissedAtMs + INVITE_SNOOZE_DAYS * DAY - 1,
    }),
    false,
  );

  // And askable again once it has passed.
  assert.equal(
    ask({
      memberCount: 1,
      dismissedAtMs,
      nowMs: dismissedAtMs + INVITE_SNOOZE_DAYS * DAY + 1,
    }),
    true,
  );
});

test("the answer holds still across a whole day", () => {
  // This is the property that separates a suggestion from a flicker: the same card must not
  // decide differently between two renders a second apart, or between two navigations.
  const dayStart = Math.floor(NOW / DAY) * DAY;
  const first = ask({ memberCount: 4, nowMs: dayStart });

  for (const offset of [1, 1000, 60_000, 3 * 60 * 60 * 1000, DAY - 1]) {
    assert.equal(
      ask({ memberCount: 4, nowMs: dayStart + offset }),
      first,
      `the answer changed ${offset}ms into the day`,
    );
  }
});

test("different workspaces do not all get asked on the same day", () => {
  const answers = new Set(
    Array.from({ length: 40 }, (_, index) =>
      ask({ workspaceId: `workspace-${index}`, memberCount: 4 }),
    ),
  );
  assert.equal(answers.size, 2, "every workspace answered identically — the seed is not working");
});

test("the same workspace is not asked every day, nor never", () => {
  const dayStart = Math.floor(NOW / DAY) * DAY;
  const answers = Array.from({ length: 60 }, (_, day) =>
    ask({ memberCount: 4, nowMs: dayStart + day * DAY }),
  );

  assert.ok(answers.some(Boolean), "never suggested across two months");
  assert.ok(answers.some((shown) => !shown), "suggested every single day — that is furniture");
});

test("a smaller workspace is asked more often than a larger one", () => {
  const dayStart = Math.floor(NOW / DAY) * DAY;
  const daysAsked = (memberCount: number) =>
    Array.from({ length: 200 }, (_, day) =>
      ask({ memberCount, nowMs: dayStart + day * DAY }),
    ).filter(Boolean).length;

  // The taper is the argument: each extra member is evidence the Owner already knows how.
  assert.ok(
    daysAsked(2) > daysAsked(5),
    "a workspace of two should be prompted more than one of five",
  );
});
