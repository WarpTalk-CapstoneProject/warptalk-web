import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { PlatformSettingDto } from "../../../types/admin-platform-settings.ts";
import {
  countDelta,
  dailySuccessPercents,
  failingMost,
  normaliseRate,
  overallSuccessRate,
  parseUsagePeriod,
  parseWarpbotToolsTab,
  rateDeltaPoints,
  resolveUsageWindow,
  sortByHealth,
  successRate,
  toolHealth,
  unhealthyToolCount,
  webSearchFlagView,
  windowPredatesRecording,
} from "../warpbot-tools-usage.ts";

const row = (calls: number, ok: number, error: number) => ({ calls, ok, error });

describe("successRate", () => {
  it("is ok over ok plus failed", () => {
    assert.equal(successRate(95, 5), 0.95);
    assert.equal(successRate(1, 0), 1);
  });
  it("is null, not 0% or 100%, when nothing counted", () => {
    assert.equal(successRate(0, 0), null);
  });
  it("ignores negative noise", () => {
    assert.equal(successRate(-3, 0), null);
    assert.equal(successRate(4, -1), 1);
  });
  it("is ok over all calls for the page rate, as the server computes previousSuccessRate", () => {
    const totals = {
      calls: 100,
      ok: 80,
      error: 4,
      blocked: 3,
      needsSetup: 3,
      declined: 5,
      confirmationRequired: 5,
      medianDurationMs: null,
    };
    assert.equal(overallSuccessRate(totals), 0.8);
    assert.equal(overallSuccessRate({ ...totals, calls: 0, ok: 0 }), null);
  });
  it("turns days into percents of the day's calls, with a gap for an empty day", () => {
    assert.deepEqual(
      dailySuccessPercents([
        // 4 calls: 1 ok, 1 failed, 2 declined or awaiting confirmation.
        { date: "2026-10-01", builtin: 2, plugin: 1, webSearch: 1, ok: 1, failed: 1 },
        { date: "2026-10-02", builtin: 0, plugin: 0, webSearch: 0, ok: 0, failed: 0 },
      ]),
      [25, null],
    );
  });
});

describe("toolHealth", () => {
  it("needs at least 100 calls", () => {
    assert.equal(toolHealth(row(99, 10, 89)), "notEnoughCalls");
    assert.equal(toolHealth(row(0, 0, 0)), "notEnoughCalls");
    assert.equal(toolHealth(row(100, 50, 50)), "failing");
  });
  it("is healthy at exactly 95%", () => {
    assert.equal(toolHealth(row(100, 95, 5)), "healthy");
    assert.equal(toolHealth(row(200, 200, 0)), "healthy");
  });
  it("is degraded from 85% up to (not including) 95%", () => {
    assert.equal(toolHealth(row(1000, 949, 51)), "degraded");
    assert.equal(toolHealth(row(100, 85, 15)), "degraded");
  });
  it("is failing under 85%", () => {
    assert.equal(toolHealth(row(1000, 849, 151)), "failing");
  });
  it("grades only calls the tool ran: blocked and needs-setup are not faults", () => {
    // 100 calls, 60 blocked by a rule, 38 ok, 2 errors: 95% of what ran.
    assert.equal(toolHealth(row(100, 38, 2)), "healthy");
    // Every call stopped before running: nothing failed.
    assert.equal(toolHealth(row(150, 0, 0)), "healthy");
  });
  it("counts degraded and failing tools together", () => {
    assert.equal(unhealthyToolCount([row(100, 95, 5), row(100, 90, 10), row(100, 10, 90), row(5, 0, 5)]), 2);
  });
  it("sorts worst first, then busiest", () => {
    const sorted = sortByHealth([
      { name: "ok", ...row(500, 500, 0) },
      { name: "few", ...row(10, 0, 10) },
      { name: "bad", ...row(100, 10, 90) },
      { name: "meh", ...row(100, 90, 10) },
    ]);
    assert.deepEqual(sorted.map((r) => r.name), ["bad", "meh", "ok", "few"]);
  });
  it("lists the tools failing most, among those with enough calls", () => {
    const result = failingMost([
      { name: "a", ...row(100, 90, 10) },
      { name: "b", ...row(100, 100, 0) },
      { name: "c", ...row(50, 0, 50) },
      { name: "d", ...row(400, 300, 100) },
    ]);
    assert.deepEqual(result.map((entry) => entry.row.name), ["d", "a"]);
    assert.equal(result[0].failureRate, 0.25);
  });
});

describe("previous-period deltas", () => {
  it("is a percentage of the previous count", () => {
    assert.deepEqual(countDelta(48210, 40860), { kind: "change", percent: 18 });
    assert.deepEqual(countDelta(50, 100), { kind: "change", percent: -50 });
    assert.deepEqual(countDelta(100, 100), { kind: "change", percent: 0 });
  });
  it("says new rather than dividing by zero", () => {
    assert.deepEqual(countDelta(5, 0), { kind: "new" });
    assert.deepEqual(countDelta(0, 0), { kind: "none" });
  });
  it("compares rates in points", () => {
    assert.equal(rateDeltaPoints(0.964, 0.972), -0.8);
    assert.equal(rateDeltaPoints(0.95, null), null);
    assert.equal(rateDeltaPoints(null, 0.9), null);
  });
  it("keeps the previous rate a 0-1 fraction", () => {
    assert.equal(normaliseRate(0.5), 0.5);
    assert.equal(normaliseRate(1.2), 1);
    assert.equal(normaliseRate(-1), null);
    assert.equal(normaliseRate(Number.NaN), null);
  });
});

describe("the window", () => {
  const now = new Date("2026-10-01T15:42:31.500Z");
  it("rolls back whole days from now, to the minute", () => {
    assert.deepEqual(resolveUsageWindow("7d", now), {
      from: "2026-09-24T15:42:00.000Z",
      to: "2026-10-01T15:42:00.000Z",
    });
    assert.equal(resolveUsageWindow("180d", now).from, "2026-04-04T15:42:00.000Z");
  });
  it("starts today at UTC midnight, never as an empty window", () => {
    assert.equal(resolveUsageWindow("today", now).from, "2026-10-01T00:00:00.000Z");
    assert.deepEqual(resolveUsageWindow("today", new Date("2026-10-01T00:00:20Z")), {
      from: "2026-10-01T00:00:00.000Z",
      to: "2026-10-01T00:01:00.000Z",
    });
  });
  it("defaults an unknown period and tab", () => {
    assert.equal(parseUsagePeriod("6m"), "30d");
    assert.equal(parseUsagePeriod(null), "30d");
    assert.equal(parseUsagePeriod("180d"), "180d");
    assert.equal(parseWarpbotToolsTab("catalog"), "catalog");
    assert.equal(parseWarpbotToolsTab("nope"), "usage");
  });
  it("knows when the window opens before recording began", () => {
    assert.equal(windowPredatesRecording("2026-09-01T00:00:00Z", "2026-10-01T10:00:00Z"), true);
    assert.equal(windowPredatesRecording("2026-10-02T00:00:00Z", "2026-10-01T10:00:00Z"), false);
    assert.equal(windowPredatesRecording("2026-09-01T00:00:00Z", null), true);
  });
});

describe("webSearchFlagView", () => {
  const setting = (value: unknown, overrides: unknown[] = []) =>
    ({ value, defaultValue: { enabled: false }, overrides }) as unknown as PlatformSettingDto;

  it("is unknown without the setting", () => {
    assert.equal(webSearchFlagView(null).state, "unknown");
  });
  it("reads the platform value, falling back to the default", () => {
    assert.equal(webSearchFlagView(setting({ enabled: true })).state, "on");
    assert.equal(webSearchFlagView(setting(null)).state, "off");
    assert.equal(webSearchFlagView(setting(true)).state, "on");
  });
  it("counts denied workspaces, scoped overrides and a partial rollout", () => {
    const view = webSearchFlagView(
      setting({ enabled: true, denyWorkspaces: ["a", "b", "c"], rolloutPercent: 40 }, [{ scopeType: "workspace" }]),
    );
    assert.deepEqual(view, { state: "on", deniedWorkspaces: 3, scopedOverrides: 1, rolloutPercent: 40 });
    assert.equal(webSearchFlagView(setting({ enabled: true, rolloutPercent: 100 })).rolloutPercent, null);
  });
});
