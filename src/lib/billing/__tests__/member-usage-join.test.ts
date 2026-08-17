import assert from "node:assert/strict";
import test from "node:test";

import { rankMemberUsage } from "../member-usage-join.ts";

/**
 * WT-413 — the dashboard resolves a spender's name itself.
 *
 * The endpoint returns user ids. billing-service holds no user directory, and the dashboard has
 * already loaded the member list for other panels, so the join belongs here rather than in a
 * gRPC dependency from billing onto auth.
 *
 * The two cases that make this more than a Map lookup are a spender who has since LEFT the
 * workspace, and the ordering the panel promises.
 */

const ALICE = "019f0d00-0de0-7000-9000-000000000001";
const BOB = "019f0d00-0de0-7000-9000-000000000002";
const GHOST = "019f0d00-0de0-7000-9000-00000000dead";

const MEMBERS = [
  { userId: ALICE, fullName: "Alice Nguyen", email: "alice@example.com" },
  { userId: BOB, fullName: "", email: "bob@example.com" },
];

test("spenders are ranked by credits, not by the order the API returned them", () => {
  const ranked = rankMemberUsage(
    [
      { userId: BOB, creditsConsumed: 222, recordCount: 182, lastUsedAt: null },
      { userId: ALICE, creditsConsumed: 250, recordCount: 224, lastUsedAt: null },
    ],
    MEMBERS,
  );

  assert.deepEqual(
    ranked.map((row) => row.userId),
    [ALICE, BOB],
  );
});

test("a name is used when there is one, and the email when there is not", () => {
  const ranked = rankMemberUsage(
    [
      { userId: ALICE, creditsConsumed: 10, recordCount: 1, lastUsedAt: null },
      { userId: BOB, creditsConsumed: 5, recordCount: 1, lastUsedAt: null },
    ],
    MEMBERS,
  );

  assert.equal(ranked[0].label, "Alice Nguyen");
  assert.equal(ranked[1].label, "bob@example.com");
});

test("somebody who has left the workspace still appears, marked", () => {
  // Usage is historical and membership is current. Their credits were really spent, and
  // dropping the row would make the table stop summing to the total shown above it.
  const ranked = rankMemberUsage(
    [{ userId: GHOST, creditsConsumed: 74, recordCount: 68, lastUsedAt: null }],
    MEMBERS,
  );

  assert.equal(ranked.length, 1, "a departed member's spend vanished from the table");
  assert.equal(ranked[0].isFormerMember, true);
  assert.equal(ranked[0].creditsConsumed, 74);
});

test("rows with nothing on them are dropped", () => {
  const ranked = rankMemberUsage(
    [
      { userId: ALICE, creditsConsumed: 0, recordCount: 0, lastUsedAt: null },
      { userId: BOB, creditsConsumed: 5, recordCount: 1, lastUsedAt: null },
    ],
    MEMBERS,
  );

  assert.deepEqual(
    ranked.map((row) => row.userId),
    [BOB],
  );
});

test("a charge that consumed no credits is still shown", () => {
  // recordCount without credits is a real state — a metered call that rounded to zero — and
  // hiding it would make the charge count in the table disagree with billing history.
  const ranked = rankMemberUsage(
    [{ userId: ALICE, creditsConsumed: 0, recordCount: 3, lastUsedAt: null }],
    MEMBERS,
  );

  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].recordCount, 3);
});

test("shares are computed against the total the panel displays", () => {
  const ranked = rankMemberUsage(
    [
      { userId: ALICE, creditsConsumed: 250, recordCount: 1, lastUsedAt: null },
      { userId: BOB, creditsConsumed: 250, recordCount: 1, lastUsedAt: null },
    ],
    MEMBERS,
    500,
  );

  assert.equal(ranked[0].share, 50);
  assert.equal(ranked[1].share, 50);
});

test("a zero total does not produce NaN shares", () => {
  const ranked = rankMemberUsage(
    [{ userId: ALICE, creditsConsumed: 0, recordCount: 2, lastUsedAt: null }],
    MEMBERS,
    0,
  );

  assert.equal(ranked[0].share, 0);
});
