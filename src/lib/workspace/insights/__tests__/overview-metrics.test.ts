// The workspace Insights Overview's numbers (WT-878).
//
// Every figure here renders plausibly when it is wrong, and the dashboard it replaces proved it by
// printing 15,000 credits, 12 meetings and 8 members whenever a request had not answered. These pin
// the rules that keep a missing source a dash and a partial read a floor.

import assert from "node:assert/strict";
import test from "node:test";

import type { CreditBalanceDto, CreditTransactionDto, MonthlyUsagePoint } from "../../../../types/billing.ts";
import {
  assembleAttention,
  creditsByDay,
  creditsByService,
  creditsFigure,
  creditsRemainingView,
  creditsUsedIn,
  elapsedDayKeys,
  lastMonthKeys,
  meetingFigures,
  meetingsByDay,
  meetingsHeldIn,
  monthlyCredits,
  overviewCsvRows,
  periodFigure,
  ratio,
  roomDurationSeconds,
  topServices,
  upcomingRooms,
  yearsOfMonthKeys,
} from "../overview-metrics.ts";

let seq = 0;
function tx(createdAt: string, amount: number, extra: Partial<CreditTransactionDto> = {}): CreditTransactionDto {
  seq += 1;
  return {
    id: `t${seq}`,
    workspaceId: "w1",
    userId: "u1",
    amount,
    type: amount < 0 ? "consume" : "top_up",
    description: amount < 0 ? "Aggregated TRANSLATION" : "Top up",
    balanceAfter: 0,
    createdAt,
    ...extra,
  };
}

// Local-time windows, as the period bar builds them.
const SEP = { from: new Date(2026, 8, 1), to: new Date(2026, 8, 15, 12, 0) };
const AUG = { from: new Date(2026, 7, 1), to: new Date(2026, 7, 15, 12, 0) };
const at = (month: number, day: number, hour = 10) => new Date(2026, month - 1, day, hour).toISOString();

test("credits used is the spend inside the window, adjustments included, top-ups not", () => {
  const items = [
    tx(at(9, 2), -100),
    tx(at(9, 3), -50, { type: "adjustment", description: "support" }),
    tx(at(9, 4), 1000),
    tx(at(9, 20), -999), // after the window
    tx(at(8, 5), -70),
  ];
  assert.equal(creditsUsedIn(items, SEP), 150);
  assert.deepEqual(creditsFigure({ items, complete: true }, SEP, AUG), { value: 150, previous: 70, atLeast: false });
});

test("a ledger read that stopped at its cap is a floor with no comparison", () => {
  const items = [tx(at(9, 2), -100), tx(at(8, 5), -70)];
  assert.deepEqual(creditsFigure({ items, complete: false }, SEP, AUG), { value: 100, previous: null, atLeast: true });
});

test("credits by day and by service add up to credits used", () => {
  const items = [
    tx(at(9, 2, 9), -100),
    tx(at(9, 2, 18), -20, { description: "Aggregated AUDIO_DUBBING_STANDARD" }),
    tx(at(9, 5), -30, { description: "Aggregated TRANSLATION" }),
  ];
  const days = creditsByDay(items, SEP);
  assert.equal(days.get("2026-09-02"), 120);
  assert.equal(days.get("2026-09-05"), 30);
  const services = creditsByService(items, SEP);
  assert.deepEqual(services.map((s) => [s.key, s.credits]), [["translation", 130], ["dubbing", 20]]);
  assert.equal(services.reduce((sum, s) => sum + s.credits, 0), creditsUsedIn(items, SEP));
});

test("past five services the rest is one row that keeps the total", () => {
  const rows = ["a", "b", "c", "d", "e", "f", "g"].map((key, index) => ({ key, label: key, known: false, credits: 10 - index }));
  const { top, rest } = topServices(rows);
  assert.equal(top.length, 5);
  assert.equal(rest, 5 + 4);
});

test("the day axis runs from the window's first day to the day it ends in", () => {
  assert.deepEqual(elapsedDayKeys({ from: new Date(2026, 8, 1), to: new Date(2026, 8, 3, 9) }), [
    "2026-09-01",
    "2026-09-02",
    "2026-09-03",
  ]);
  // An exclusive midnight end does not open another day.
  assert.deepEqual(elapsedDayKeys({ from: new Date(2026, 8, 1), to: new Date(2026, 8, 3) }), ["2026-09-01", "2026-09-02"]);
  assert.deepEqual(elapsedDayKeys({ from: new Date(2026, 8, 3), to: new Date(2026, 8, 3) }), []);
});

test("meetings held are ended rooms that started in the window; hours only from rooms that say", () => {
  const rooms = [
    { id: "r1", status: "ended", startedAt: at(9, 2), durationSeconds: 3600 },
    { id: "r2", status: "ended", startedAt: at(9, 3, 9), endedAt: at(9, 3, 10) },
    { id: "r3", status: "ended", startedAt: at(9, 4) }, // no duration at all
    { id: "r4", status: "in_progress", startedAt: at(9, 5) }, // not held yet
    { id: "r5", status: "ended", startedAt: at(8, 3), durationSeconds: 1800 },
  ];
  assert.deepEqual(meetingsHeldIn(rooms, SEP), { count: 3, hours: 2, withoutDuration: 1 });
  const figures = meetingFigures({ rooms, complete: true }, SEP, AUG);
  assert.deepEqual(figures.meetings, { value: 3, previous: 1, atLeast: false });
  assert.deepEqual(figures.hours, { value: 2, previous: 0.5, atLeast: false });
  assert.equal(meetingsByDay(rooms, SEP).get("2026-09-02")?.meetings, 1);
});

test("hours are unavailable when no meeting says how long it ran, and zero when none were held", () => {
  assert.equal(meetingsHeldIn([{ id: "r", status: "ended", startedAt: at(9, 2) }], SEP).hours, null);
  assert.equal(meetingsHeldIn([], SEP).hours, 0);
  assert.equal(roomDurationSeconds({ id: "x", startedAt: at(9, 2, 11), endedAt: at(9, 2, 10) }), null);
});

test("a ratio of an unknown or of nothing is unknown", () => {
  assert.equal(ratio(100, 4), 25);
  assert.equal(ratio(100, 0), null);
  assert.equal(ratio(null, 4), null);
  assert.equal(ratio(100, undefined), null);
});

test("a floor carries no previous figure", () => {
  assert.deepEqual(periodFigure(10, 7, true), { value: 10, previous: null, atLeast: true });
});

test("up next puts what is open first, then the soonest booking, and drops past bookings", () => {
  const now = new Date(2026, 8, 15, 12).getTime();
  const rooms = [
    { id: "late", status: "scheduled", scheduledAt: at(9, 20) },
    { id: "past", status: "scheduled", scheduledAt: at(9, 14) },
    { id: "soon", status: "scheduled", scheduledAt: at(9, 16) },
    { id: "live", status: "in_progress", scheduledAt: at(9, 1) },
    { id: "done", status: "ended", scheduledAt: at(9, 17) },
  ];
  assert.deepEqual(upcomingRooms(rooms, now).map((r) => r.id), ["live", "soon", "late"]);
});

test("six months end with the anchor's month and can span two years", () => {
  const keys = lastMonthKeys(new Date(2026, 2, 10));
  assert.deepEqual(keys, ["2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03"]);
  assert.deepEqual(yearsOfMonthKeys(keys), [2025, 2026]);
  const point = (month: number, consumedCredits: number): MonthlyUsagePoint => ({ month, monthName: "", consumedCredits, topUpCredits: 0 });
  const charts = new Map<number, MonthlyUsagePoint[] | null>([
    [2025, [point(10, 5), point(11, 6), point(12, 7)]],
    [2026, null], // that year's chart did not answer
  ]);
  assert.deepEqual(monthlyCredits(keys, charts).map((m) => m.credits), [5, 6, 7, null, null, null]);
});

const balance = (currentCredits: number, used: number): CreditBalanceDto => ({
  workspaceId: "w1",
  currentCredits,
  creditsUsedThisCycle: used,
  totalCredits: currentCredits + used,
  status: "active",
  currentPeriodStart: "2026-09-01T00:00:00Z",
  currentPeriodEnd: "2026-10-01T00:00:00Z",
});

test("the balance card warns at 10% left and turns critical at 1%", () => {
  assert.equal(creditsRemainingView(balance(800, 200)).level, "ok");
  assert.equal(creditsRemainingView(balance(100, 900)).level, "warning");
  assert.equal(creditsRemainingView(balance(5, 995)).level, "critical");
  assert.equal(creditsRemainingView(balance(800, 200)).percentLeft, 80);
});

test("needs attention lists what it found and names what it could not check", () => {
  const result = assembleAttention({
    balance: balance(5, 995),
    subscription: undefined,
    recurring: undefined,
    tools: { needsSetupPlugins: ["gmail"], blocked: 3, complete: true },
    pendingRequests: 0,
    pluginLabel: (key) => key.toUpperCase(),
  });
  assert.deepEqual(result.items.map((item) => item.kind), ["lowCredits", "pluginsNeedSetup", "policyBlocks"]);
  assert.equal(result.items[0].tone, "danger");
  assert.equal(result.items[1].values.plugins, "GMAIL");
  assert.deepEqual(result.unavailable, ["payments"]);
});

test("no plan is something to act on, not a missing source", () => {
  const result = assembleAttention({ balance: null, subscription: null, recurring: null, pendingRequests: 2 });
  assert.deepEqual(result.items.map((item) => item.kind), ["noPlan", "pendingRequests"]);
  assert.deepEqual(result.unavailable, ["toolAudit"]);
});

test("the export leaves an unavailable figure empty rather than writing 0", () => {
  const rows = overviewCsvRows([
    { label: "Credits used", figure: { value: 150, previous: 100, atLeast: false }, unit: "credits" },
    { label: "Tool calls", figure: { value: null, previous: null, atLeast: false }, unit: "count" },
    { label: "Meetings held", figure: { value: 4, previous: null, atLeast: true }, unit: "count" },
  ]);
  assert.deepEqual(rows[1], ["Credits used", 150, 100, "50.0%", "credits", ""]);
  assert.deepEqual(rows[2], ["Tool calls", "", "", "", "count", "not available"]);
  assert.deepEqual(rows[3], ["Meetings held", 4, "", "", "count", "at least"]);
});
