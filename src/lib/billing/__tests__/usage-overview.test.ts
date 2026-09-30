// The Usage page's numbers.
//
// Every figure on the page comes out of this file, and every one of them renders plausibly when
// it is wrong: a stacked chart whose segments do not add up to the headline, a member filter that
// changes the chart and not the cards, a charge silently credited to whichever meeting was listed
// first. These pin the cases that look fine and are not.

import assert from "node:assert/strict";
import test from "node:test";

import {
  attributeMeetings,
  buildServiceCards,
  buildUsageCsvRows,
  creditMovements,
  cycleElapsedFraction,
  filterByMember,
  matchMeeting,
  MEETING_SETTLEMENT_GRACE_MS,
  memberDirectory,
  memberLabelOf,
  OVERLAP_ROW_KEY,
  rankMeetings,
  rankMembers,
  serviceColorSlots,
  stackedChartScale,
  summariseSpendByService,
  toCsv,
  UNMATCHED_ROW_KEY,
} from "../usage-overview.ts";
import type { CreditTransactionDto } from "../../../types/billing.ts";

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

/** Local midnight, so bucket boundaries match the runner's zone. */
const START = new Date(2026, 7, 1, 0, 0, 0).getTime();
const END = new Date(2026, 7, 31, 0, 0, 0).getTime();

const ALICE = "019f0d00-0de0-7000-9000-000000000001";
const BOB = "019f0d00-0de0-7000-9000-000000000002";
const GHOST = "019f0d00-0de0-7000-9000-00000000dead";

let seq = 0;
function tx(overrides: Partial<CreditTransactionDto> & { at: number }): CreditTransactionDto {
  const { at, ...rest } = overrides;
  seq += 1;
  return {
    id: `tx-${seq}`,
    workspaceId: "w1",
    userId: ALICE,
    amount: -2,
    type: "consume",
    description: "Aggregated TRANSLATION",
    referenceType: "translation_content",
    referenceId: `seg-${seq}`,
    balanceAfter: 1000,
    createdAt: new Date(at).toISOString(),
    ...rest,
  };
}

function input(transactions: CreditTransactionDto[]) {
  return {
    transactions,
    currentPeriodStart: new Date(START).toISOString(),
    currentPeriodEnd: new Date(END).toISOString(),
  };
}

test("the stacked segments add up to the headline, adjustments included", () => {
  const txs = [
    tx({ at: START + 1 * HOUR, amount: -10 }),
    tx({ at: START + 2 * HOUR, amount: -5, description: "Aggregated AUDIO_DUBBING_STANDARD" }),
    tx({ at: START + DAY + HOUR, amount: -7, type: "adjustment", description: "Manual fix" }),
    tx({ at: START + DAY + 2 * HOUR, amount: 500, type: "top_up", description: "Top-up" }),
  ];
  const result = summariseSpendByService(input(txs), START + 2.5 * DAY, "day");

  assert.ok(result);
  assert.equal(result.total, 22);
  for (const bucket of result.buckets) {
    const stacked = Object.values(bucket.byService).reduce((a, b) => a + b, 0);
    assert.equal(stacked, bucket.total);
  }
  assert.deepEqual(
    result.services.map((s) => [s.key, s.credits]),
    [
      ["translation", 10],
      ["adjustment", 7],
      ["dubbing", 5],
    ],
  );
  // A top-up is not spend and not a settlement.
  assert.equal(result.settlements, 2);
});

test("the series stops at today and the average is over elapsed buckets", () => {
  const result = summariseSpendByService(
    input([tx({ at: START + HOUR, amount: -30 })]),
    START + 2.5 * DAY,
    "day",
  );
  assert.ok(result);
  assert.equal(result.buckets.length, 3);
  assert.equal(result.averagePerBucket, 10);
});

test("weekly buckets group seven local days", () => {
  const result = summariseSpendByService(
    input([
      tx({ at: START + HOUR, amount: -1 }),
      tx({ at: START + 6 * DAY + HOUR, amount: -2 }),
      tx({ at: START + 7 * DAY + HOUR, amount: -4 }),
    ]),
    START + 10 * DAY,
    "week",
  );
  assert.ok(result);
  assert.deepEqual(result.buckets.map((b) => b.total), [3, 4]);
});

test("a transaction from before the cycle is not this cycle's spend", () => {
  const result = summariseSpendByService(
    input([tx({ at: START - DAY, amount: -99 }), tx({ at: START + HOUR, amount: -1 })]),
    START + DAY,
    "day",
  );
  assert.equal(result?.total, 1);
});

test("an unmapped charge type is charted under its raw name, never dropped", () => {
  const result = summariseSpendByService(
    input([tx({ at: START + HOUR, amount: -3, description: "Aggregated NEW_THING" })]),
    START + DAY,
    "day",
  );
  assert.equal(result?.services[0].label, "NEW THING");
  assert.equal(result?.total, 3);
});

test("the member filter narrows every figure, and a system row has its own key", () => {
  const txs = [
    tx({ at: START + HOUR, userId: ALICE, amount: -4 }),
    tx({ at: START + HOUR, userId: BOB, amount: -6 }),
    tx({ at: START + HOUR, userId: null, amount: -1 }),
  ];
  assert.equal(filterByMember(txs, null).length, 3);
  assert.deepEqual(filterByMember(txs, BOB).map((t) => t.amount), [-6]);
  assert.deepEqual(filterByMember(txs, "unknown").map((t) => t.amount), [-1]);
});

test("names come from the directory; someone who left is a former member, no user is unknown", () => {
  const directory = memberDirectory([{ userId: ALICE, fullName: "Alice", email: "a@x.io" }]);
  assert.equal(memberLabelOf({ userId: ALICE, userName: null }, directory).label, "Alice");
  assert.deepEqual(memberLabelOf({ userId: GHOST, userName: null }, directory), {
    label: "Former member",
    isFormer: true,
  });
  assert.equal(memberLabelOf({ userId: null, userName: null }, directory).label, "Unknown");
  assert.equal(memberLabelOf({ userId: GHOST, userName: "Server Name" }, directory).label, "Server Name");
});

test("members are ranked by credits and still sum to the total", () => {
  const directory = memberDirectory([{ userId: ALICE, fullName: "Alice" }]);
  const txs = [
    tx({ at: START + HOUR, userId: ALICE, amount: -4 }),
    tx({ at: START + HOUR, userId: GHOST, amount: -6 }),
    tx({ at: START + HOUR, userId: ALICE, amount: 100, type: "top_up" }),
  ];
  const rows = rankMembers(txs, directory);
  assert.deepEqual(rows.map((r) => [r.label, r.credits]), [["Former member", 6], ["Alice", 4]]);
});

const ROOM_A = { id: "room-a", title: "Weekly sync", startedAt: new Date(START + 9 * HOUR).toISOString(), endedAt: new Date(START + 10 * HOUR).toISOString() };
const ROOM_B = { id: "room-b", title: "Design review", startedAt: new Date(START + 9.5 * HOUR).toISOString(), endedAt: new Date(START + 11 * HOUR).toISOString() };

test("a charge settled while one meeting ran belongs to that meeting", () => {
  const match = matchMeeting(tx({ at: START + 9.2 * HOUR }), [ROOM_A, ROOM_B], START + DAY);
  assert.deepEqual(match, { kind: "meeting", id: "room-a" });
});

test("two meetings running at once is reported as an overlap, not guessed", () => {
  const match = matchMeeting(tx({ at: START + 9.7 * HOUR }), [ROOM_A, ROOM_B], START + DAY);
  assert.deepEqual(match, { kind: "overlap" });
});

test("a settlement just after the meeting ended still belongs to it", () => {
  const at = START + 11 * HOUR + MEETING_SETTLEMENT_GRACE_MS - 1000;
  assert.deepEqual(matchMeeting(tx({ at }), [ROOM_B], START + DAY), { kind: "meeting", id: "room-b" });
  assert.deepEqual(
    matchMeeting(tx({ at: at + 2 * MEETING_SETTLEMENT_GRACE_MS }), [ROOM_B], START + DAY),
    { kind: "unmatched" },
  );
});

test("a meeting still running is open until now", () => {
  const live = { id: "live", title: "Live", startedAt: new Date(START + 20 * HOUR).toISOString(), endedAt: null };
  assert.deepEqual(matchMeeting(tx({ at: START + 21 * HOUR }), [live], START + 22 * HOUR), {
    kind: "meeting",
    id: "live",
  });
});

test("a room-typed reference is exact and beats the clock", () => {
  const match = matchMeeting(
    tx({ at: START + 9.2 * HOUR, referenceType: "TranslationRoom", referenceId: "room-z" }),
    [ROOM_A],
    START + DAY,
  );
  assert.deepEqual(match, { kind: "meeting", id: "room-z" });
});

test("meetings billed counts distinct meetings, per day and overall", () => {
  const txs = [
    tx({ at: START + 9.1 * HOUR }),
    tx({ at: START + 9.2 * HOUR }),
    tx({ at: START + 10.5 * HOUR }),
    tx({ at: START + 9.7 * HOUR }),
  ];
  const attribution = attributeMeetings(txs, [ROOM_A, ROOM_B], START + DAY);
  const result = summariseSpendByService(input(txs), START + DAY, "day", attribution);
  assert.equal(result?.meetings, 2);
  assert.equal(result?.buckets[0].meetings, 2);
});

test("meeting rows sum to consume spend, with overlap and unmatched rows last", () => {
  const txs = [
    tx({ at: START + 9.1 * HOUR, amount: -3 }),
    tx({ at: START + 10.5 * HOUR, amount: -8 }),
    tx({ at: START + 9.7 * HOUR, amount: -2 }),
    tx({ at: START + 20 * HOUR, amount: -1 }),
    tx({ at: START + 20 * HOUR, amount: 50, type: "top_up" }),
  ];
  const attribution = attributeMeetings(txs, [ROOM_A, ROOM_B], START + DAY);
  const rows = rankMeetings(txs, attribution, [ROOM_A]);
  assert.deepEqual(
    rows.map((r) => [r.key, r.label, r.credits]),
    [
      // room-b is not in the loaded history, so it falls back to a dated name.
      ["meeting:room-b", "Meeting · Aug 1", 8],
      ["meeting:room-a", "Weekly sync", 3],
      [OVERLAP_ROW_KEY, "During overlapping meetings", 2],
      [UNMATCHED_ROW_KEY, "Not matched to a meeting", 1],
    ],
  );
  assert.equal(rows.reduce((sum, r) => sum + r.credits, 0), 14);
});

test("service cards take totals from the breakdown and the series from the ledger", () => {
  const txs = [
    tx({ at: START + HOUR, amount: -10 }),
    tx({ at: START + DAY + HOUR, amount: -4 }),
    tx({ at: START + HOUR, amount: -5, type: "adjustment", description: "fix" }),
  ];
  const spend = summariseSpendByService(input(txs), START + 1.5 * DAY, "day");
  assert.ok(spend);
  const cards = buildServiceCards(spend, [
    { usageType: "TRANSLATION", usageCount: 7, totalCreditsConsumed: 14 },
    { usageType: "voice_translation", usageCount: 1, totalCreditsConsumed: 2 },
    { usageType: "AUDIO_DUBBING_STANDARD", usageCount: 3, totalCreditsConsumed: 9 },
  ]);
  assert.deepEqual(
    cards.map((c) => [c.key, c.credits, c.uses, c.series]),
    [
      ["translation", 16, 8, [10, 4]],
      ["dubbing", 9, 3, [0, 0]],
    ],
  );
  assert.equal(cards[0].creditsPerUse, 2);
  // Credit adjustments are charted but are not an AI service.
  assert.ok(!cards.some((c) => c.key === "adjustment"));
});

test("without the breakdown, a consume row is one use and credits come from the ledger", () => {
  const spend = summariseSpendByService(
    input([tx({ at: START + HOUR, amount: -3 }), tx({ at: START + HOUR, amount: -3 })]),
    START + DAY,
    "day",
  );
  assert.ok(spend);
  const [card] = buildServiceCards(spend, null);
  assert.equal(card.credits, 6);
  assert.equal(card.uses, 2);
  assert.equal(card.creditsPerUse, 3);
});

test("an ordinary spread of days is drawn to scale", () => {
  const scale = stackedChartScale([10, 30, 0, 20]);
  assert.deepEqual(scale.clipped, []);
  assert.ok(scale.max >= 30);
});

test("one enormous day is clipped so the other days stay readable", () => {
  // The demo workspace: 2,100,998 of 2,106,183 credits on a single day.
  const scale = stackedChartScale([1200, 2_100_998, 800, 0, 3185]);
  assert.deepEqual(scale.clipped, [1]);
  assert.ok(scale.max >= 3185 && scale.max < 20_000);
});

test("a single spending day is not treated as an outlier", () => {
  assert.deepEqual(stackedChartScale([0, 500, 0]).clipped, []);
  assert.deepEqual(stackedChartScale([0, 0]), { max: 1, clipped: [] });
});

test("the five largest services get their own colour and the rest share Other", () => {
  const slots = serviceColorSlots(["a", "b", "c", "d", "e", "f"].map((key) => ({ key })));
  assert.equal(slots.get("a"), 1);
  assert.equal(slots.get("e"), 5);
  assert.equal(slots.get("f"), 0);
});

test("the pace tick sits where even spending would be today", () => {
  const start = new Date(START).toISOString();
  const end = new Date(START + 30 * DAY).toISOString();
  assert.equal(cycleElapsedFraction(start, end, START + 15 * DAY), 0.5);
  assert.equal(cycleElapsedFraction(start, end, START - DAY), 0);
  assert.equal(cycleElapsedFraction(start, end, START + 40 * DAY), 1);
});

test("top-ups, refunds and adjustments are listed newest first; settlements are not", () => {
  const txs = [
    tx({ at: START + HOUR, amount: 100, type: "top_up" }),
    tx({ at: START + 2 * HOUR, amount: -2 }),
    tx({ at: START + 3 * HOUR, amount: -50, type: "adjustment" }),
  ];
  assert.deepEqual(creditMovements(txs).map((t) => t.amount), [-50, 100]);
});

test("the CSV lists every loaded transaction with its member, service and meeting", () => {
  const txs = [
    tx({ at: START + 9.1 * HOUR, amount: -3, userId: ALICE, balanceAfter: 97 }),
    tx({ at: START + HOUR, amount: 100, type: "top_up", description: "Top-up", userId: GHOST, referenceType: "stripe_payment", referenceId: "pi_1", balanceAfter: 100 }),
  ];
  const rows = buildUsageCsvRows(txs, {
    directory: memberDirectory([{ userId: ALICE, fullName: "Alice" }]),
    attribution: attributeMeetings(txs, [ROOM_A], START + DAY),
    rooms: [ROOM_A],
  });
  assert.deepEqual(rows[0], ["Date", "Member", "Service", "Meeting / reference", "Credits", "Balance after"]);
  assert.deepEqual(rows.slice(1).map((r) => r.slice(1)), [
    ["Former member", "Top-up", "stripe_payment pi_1", 100, 100],
    ["Alice", "Live translation", "Weekly sync", -3, 97],
  ]);
});

test("CSV cells are quoted, and a title that looks like a formula is defused", () => {
  const text = toCsv([
    ["a,b", 'say "hi"', "=HYPERLINK(1)", -2],
  ]);
  assert.equal(text, `"a,b","say ""hi""",'=HYPERLINK(1),-2\r\n`);
});
