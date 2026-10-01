import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  collectAuditWindow,
  dayKeyInZone,
  filterToPeriod,
  outcomeBucket,
  periodDayAxis,
  toolsMetrics,
  topPlugins,
  type ToolCallLike,
  type ToolOutcomeTone,
} from "../tools-metrics.ts";

const HCM = "Asia/Ho_Chi_Minh"; // UTC+7, no DST

function call(createdAt: string, pluginKey: string, tone: ToolOutcomeTone, code: string | null = null): ToolCallLike {
  return { createdAt, pluginKey, pluginLabel: pluginKey.toUpperCase(), outcome: { tone, code } };
}

// September 2026 in Ho Chi Minh: [Aug 31 17:00Z, Sep 30 17:00Z); "now" is Sep 3 05:00 local.
const FROM = new Date("2026-08-31T17:00:00Z");
const NOW = new Date("2026-09-02T22:00:00Z");

describe("dayKeyInZone", () => {
  it("cuts the day in the given zone, not in UTC", () => {
    assert.equal(dayKeyInZone(new Date("2026-08-31T17:30:00Z"), HCM), "2026-09-01");
    assert.equal(dayKeyInZone(new Date("2026-08-31T17:30:00Z"), "UTC"), "2026-08-31");
  });
});

describe("filterToPeriod", () => {
  it("keeps [from, to), drops unparseable rows, and orders newest first", () => {
    const rows = [
      call("2026-08-31T16:59:59Z", "a", "success"), // before
      call("2026-08-31T17:00:00Z", "a", "success"), // exactly from: in
      call("2026-09-02T21:00:00Z", "b", "success"),
      call("2026-09-02T22:00:00Z", "a", "success"), // exactly to: out
      call("not a date", "a", "success"),
    ];
    const kept = filterToPeriod(rows, FROM, NOW);
    assert.deepEqual(kept.map((r) => r.createdAt), ["2026-09-02T21:00:00Z", "2026-08-31T17:00:00Z"]);
  });
});

describe("periodDayAxis", () => {
  it("runs the whole month and marks the days after today as still to come", () => {
    const axis = periodDayAxis({ from: FROM, to: NOW, timeZone: HCM, axisEndDay: "2026-10-01" });
    assert.equal(axis.length, 30);
    assert.deepEqual(axis.slice(0, 4), [
      { key: "2026-09-01", future: false },
      { key: "2026-09-02", future: false },
      { key: "2026-09-03", future: false },
      { key: "2026-09-04", future: true },
    ]);
    assert.deepEqual(axis[29], { key: "2026-09-30", future: true });
  });

  it("stops at today for a to-now preset", () => {
    const axis = periodDayAxis({ from: FROM, to: NOW, timeZone: HCM, axisEndDay: null });
    assert.deepEqual(axis.map((d) => d.key), ["2026-09-01", "2026-09-02", "2026-09-03"]);
  });

  it("is empty for an empty range", () => {
    assert.deepEqual(periodDayAxis({ from: NOW, to: NOW, timeZone: HCM }), []);
  });
});

describe("outcomeBucket", () => {
  it("keeps a policy refusal apart from a failure", () => {
    assert.equal(outcomeBucket({ tone: "success" }), "succeeded");
    assert.equal(outcomeBucket({ tone: "blocked", code: "permission_denied" }), "blocked");
    assert.equal(outcomeBucket({ tone: "attention", code: "connection_required" }), "problem");
    assert.equal(outcomeBucket({ tone: "failed", code: "boom" }), "problem");
  });
});

describe("toolsMetrics", () => {
  const rows = [
    call("2026-08-30T10:00:00Z", "notion", "success"), // previous month: out
    call("2026-08-31T18:00:00Z", "calendar", "success"), // Sep 1 local
    call("2026-08-31T23:00:00Z", "calendar", "blocked", "permission_denied"), // Sep 1
    call("2026-09-01T16:59:00Z", "gmail", "attention", "connection_required"), // Sep 1 23:59 local
    call("2026-09-01T17:01:00Z", "calendar", "success"), // Sep 2 00:01 local
    call("2026-09-02T20:00:00Z", "notion", "attention", "confirmation_required"), // Sep 3
    call("2026-09-02T21:00:00Z", "calendar", "failed", "provider_unavailable"), // Sep 3
  ];

  const metrics = toolsMetrics(rows, { from: FROM, to: NOW, timeZone: HCM, axisEndDay: "2026-10-01" });

  it("counts only the period's calls", () => {
    assert.equal(metrics.calls, 6);
    assert.equal(metrics.succeeded, 2);
    assert.equal(metrics.blocked, 1);
    assert.equal(metrics.needsSetup, 1);
    assert.equal(metrics.awaitingConfirmation, 1);
    assert.equal(metrics.failed, 1);
    assert.equal(metrics.lastCallAt, "2026-09-02T21:00:00Z");
    assert.equal(metrics.capped, false);
  });

  it("computes the success rate from the calls themselves", () => {
    assert.ok(Math.abs((metrics.successRate ?? 0) - (2 / 6) * 100) < 1e-9);
  });

  it("needs attention when anything needs setup or failed", () => {
    assert.equal(metrics.health, "attention");
    const ok = toolsMetrics([call("2026-09-01T00:00:00Z", "a", "success"), call("2026-09-01T01:00:00Z", "a", "blocked")], {
      from: FROM,
      to: NOW,
      timeZone: HCM,
    });
    assert.equal(ok.health, "healthy");
  });

  it("counts per plugin, largest first", () => {
    assert.deepEqual(
      metrics.byPlugin.map((p) => [p.key, p.label, p.calls, p.succeeded, p.blocked, p.problem]),
      [
        ["calendar", "CALENDAR", 4, 2, 1, 1],
        ["gmail", "GMAIL", 1, 0, 0, 1],
        ["notion", "NOTION", 1, 0, 0, 1],
      ],
    );
  });

  it("buckets per local day and leaves the days to come blank", () => {
    const [sep1, sep2, sep3, sep4] = metrics.days;
    assert.deepEqual(sep1, { key: "2026-09-01", future: false, succeeded: 1, blocked: 1, problem: 1, total: 3, successRate: (1 / 3) * 100 });
    assert.deepEqual(sep2, { key: "2026-09-02", future: false, succeeded: 1, blocked: 0, problem: 0, total: 1, successRate: 100 });
    assert.deepEqual(sep3, { key: "2026-09-03", future: false, succeeded: 0, blocked: 0, problem: 2, total: 2, successRate: 0 });
    assert.deepEqual(sep4, { key: "2026-09-04", future: true, succeeded: null, blocked: null, problem: null, total: null, successRate: null });
    assert.equal(metrics.days.length, 30);
  });

  it("never invents a success rate for a period without calls", () => {
    const empty = toolsMetrics([], { from: FROM, to: NOW, timeZone: HCM, capped: false });
    assert.equal(empty.calls, 0);
    assert.equal(empty.successRate, null);
    assert.equal(empty.lastCallAt, null);
    assert.equal(empty.health, "idle");
    assert.deepEqual(empty.byPlugin, []);
    // A past day with no calls is a real zero, not a gap; only its rate is undefined.
    assert.deepEqual(empty.days[0], { key: "2026-09-01", future: false, succeeded: 0, blocked: 0, problem: 0, total: 0, successRate: null });
  });

  it("passes the capped flag through", () => {
    assert.equal(toolsMetrics(rows, { from: FROM, to: NOW, timeZone: HCM, capped: true }).capped, true);
  });
});

describe("topPlugins", () => {
  it("sums the tail into one row so the shares still cover every call", () => {
    const top = topPlugins(
      [
        { key: "a", label: "A", calls: 5, succeeded: 5, blocked: 0, problem: 0 },
        { key: "b", label: "B", calls: 3, succeeded: 3, blocked: 0, problem: 0 },
        { key: "c", label: "C", calls: 2, succeeded: 2, blocked: 0, problem: 0 },
      ],
      1,
    );
    assert.deepEqual(top, [
      { key: "a", label: "A", calls: 5 },
      { key: null, label: "", calls: 5 },
    ]);
  });
});

describe("collectAuditWindow", () => {
  // A log of `count` rows, one an hour, newest first from NOW.
  function log(count: number) {
    return Array.from({ length: count }, (_, i) => ({ createdAt: new Date(NOW.getTime() - (i + 1) * 3_600_000).toISOString() }));
  }
  function pager(rows: { createdAt: string }[]) {
    const calls: [number, number][] = [];
    const fetchPage = async (skip: number, take: number) => {
      calls.push([skip, take]);
      return rows.slice(skip, skip + take);
    };
    return { calls, fetchPage };
  }

  it("stops at the end of the log", async () => {
    const { calls, fetchPage } = pager(log(7));
    const window = await collectAuditWindow(fetchPage, { from: new Date(0), pageSize: 5, maxPages: 20 });
    assert.equal(window.rows.length, 7);
    assert.equal(window.capped, false);
    assert.deepEqual(calls, [[0, 5], [5, 5]]);
  });

  it("stops once a page reaches back before the period start", async () => {
    const { calls, fetchPage } = pager(log(100));
    // 12 hours back: rows 1..11 are inside, row 12 is exactly on the start, row 13 is before it.
    const from = new Date(NOW.getTime() - 12 * 3_600_000);
    const window = await collectAuditWindow(fetchPage, { from, pageSize: 5, maxPages: 20 });
    assert.equal(window.pagesRead, 3);
    assert.equal(window.capped, false);
    assert.equal(calls.length, 3);
  });

  it("is capped when it runs out of pages before reaching the start", async () => {
    const { fetchPage } = pager(log(100));
    const window = await collectAuditWindow(fetchPage, { from: new Date(0), pageSize: 5, maxPages: 3 });
    assert.equal(window.rows.length, 15);
    assert.equal(window.pagesRead, 3);
    assert.equal(window.capped, true);
  });

  it("an exactly full last page before the cap costs one empty read, not a cap", async () => {
    const { calls, fetchPage } = pager(log(10));
    const window = await collectAuditWindow(fetchPage, { from: new Date(0), pageSize: 5, maxPages: 3 });
    assert.equal(window.rows.length, 10);
    assert.equal(window.capped, false);
    assert.equal(calls.length, 3);
  });
});
