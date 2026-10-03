import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ToolInsightsToolDto } from "../../../../types/assistant-tool-insights.ts";
import {
  TOOL_INSIGHTS_MAX_DAYS,
  callsByOrigin,
  comparablePreviousCalls,
  lastToolCallAt,
  needsSetupPlugins,
  normaliseToolInsights,
  recordingSinceNotice,
  toolInsightsWindow,
  toolLineStatus,
  toolSuccessRate,
} from "../tool-insights.ts";

function tool(partial: Partial<ToolInsightsToolDto> & Pick<ToolInsightsToolDto, "tool" | "source">): ToolInsightsToolDto {
  return {
    pluginKey: null,
    calls: 0,
    ok: 0,
    error: 0,
    blocked: 0,
    needsSetup: 0,
    medianDurationMs: null,
    lastCalledAt: null,
    ...partial,
  };
}

describe("toolInsightsWindow", () => {
  it("keeps a window of up to 180 days as it is", () => {
    const to = new Date("2026-10-01T00:00:00Z");
    const from = new Date(to.getTime() - TOOL_INSIGHTS_MAX_DAYS * 86_400_000);
    assert.deepEqual(toolInsightsWindow(from, to), { from, to, clamped: false });
  });

  it("moves the start of a longer window up to 180 days before its end, and says so", () => {
    const to = new Date("2026-10-01T00:00:00Z");
    const window = toolInsightsWindow(new Date("2026-04-01T00:00:00Z"), to);
    assert.equal(window.clamped, true);
    assert.equal(window.to, to);
    assert.equal(window.from.toISOString(), "2026-04-04T00:00:00.000Z");
  });
});

describe("normaliseToolInsights", () => {
  it("fills missing lists and counts with empties and zeros, never invented figures", () => {
    const data = normaliseToolInsights({ totals: { calls: 3 } as never });
    assert.equal(data.totals.calls, 3);
    assert.equal(data.totals.ok, 0);
    assert.equal(data.totals.medianDurationMs, null);
    assert.deepEqual(data.byDay, []);
    assert.deepEqual(data.byTool, []);
    assert.deepEqual(data.bySource, []);
    assert.equal(data.recordingSince, null);
    assert.equal(data.previousPeriodCalls, 0);
  });

  it("trims a day sent as a timestamp to its date and drops rows without a key", () => {
    const data = normaliseToolInsights({
      byDay: [{ date: "2026-10-01T00:00:00Z", builtin: 1, plugin: 0, webSearch: 0, ok: 1, failed: 0 }, null as never],
      byTool: [{ tool: undefined } as never],
    });
    assert.equal(data.byDay.length, 1);
    assert.equal(data.byDay[0].date, "2026-10-01");
    assert.deepEqual(data.byTool, []);
  });

  it("treats negative or non-numeric counts as zero", () => {
    const data = normaliseToolInsights({ totals: { calls: -4, ok: "2" } as never, previousPeriodCalls: Number.NaN });
    assert.equal(data.totals.calls, 0);
    assert.equal(data.totals.ok, 0);
    assert.equal(data.previousPeriodCalls, 0);
  });
});

describe("toolSuccessRate", () => {
  it("is ok over calls, as a percent", () => {
    assert.equal(toolSuccessRate({ calls: 8, ok: 6 }), 75);
  });

  it("is null with no calls, never a friendly default", () => {
    assert.equal(toolSuccessRate({ calls: 0, ok: 0 }), null);
  });

  it("never passes 100 even if a count is off", () => {
    assert.equal(toolSuccessRate({ calls: 2, ok: 3 }), 100);
  });
});

describe("recordingSinceNotice", () => {
  const since = "2026-10-01T08:00:00Z";

  it("names the day recording began when the window starts before it", () => {
    assert.equal(recordingSinceNotice(new Date("2026-09-01T00:00:00Z"), since), since);
  });

  it("is null when the window starts on or after it", () => {
    assert.equal(recordingSinceNotice(new Date(since), since), null);
    assert.equal(recordingSinceNotice(new Date("2026-10-02T00:00:00Z"), since), null);
  });

  it("is null when nothing has been recorded or the date cannot be read", () => {
    assert.equal(recordingSinceNotice(new Date("2026-09-01T00:00:00Z"), null), null);
    assert.equal(recordingSinceNotice(new Date("2026-09-01T00:00:00Z"), "not a date"), null);
  });
});

describe("comparablePreviousCalls", () => {
  it("returns the previous period's calls when that period was fully recorded", () => {
    const data = { previousPeriodCalls: 12, recordingSince: "2026-08-01T00:00:00Z" };
    assert.equal(comparablePreviousCalls(data, new Date("2026-08-02T00:00:00Z")), 12);
  });

  it("is null when the previous period starts before recording did", () => {
    const data = { previousPeriodCalls: 0, recordingSince: "2026-10-01T00:00:00Z" };
    assert.equal(comparablePreviousCalls(data, new Date("2026-09-01T00:00:00Z")), null);
  });

  it("is null when nothing has been recorded", () => {
    assert.equal(comparablePreviousCalls({ previousPeriodCalls: 0, recordingSince: null }, new Date()), null);
  });
});

describe("toolLineStatus", () => {
  it("is amber for needs setup or errors, not for policy blocks", () => {
    assert.equal(toolLineStatus({ calls: 5, needsSetup: 1, error: 0 }), "needsAttention");
    assert.equal(toolLineStatus({ calls: 5, needsSetup: 0, error: 2 }), "needsAttention");
    assert.equal(toolLineStatus({ calls: 5, needsSetup: 0, error: 0 }), "healthy");
    assert.equal(toolLineStatus({ calls: 0, needsSetup: 0, error: 0 }), "noCalls");
  });
});

describe("needsSetupPlugins", () => {
  it("lists plugins with needs-setup calls, most affected first, ignoring built-in tools", () => {
    const rows = [
      tool({ tool: "list_events", source: "plugin", pluginKey: "google_calendar", calls: 3, needsSetup: 1 }),
      tool({ tool: "search_files", source: "plugin", pluginKey: "google_drive", calls: 5, needsSetup: 2 }),
      tool({ tool: "create_event", source: "plugin", pluginKey: "google_calendar", calls: 2, needsSetup: 2 }),
      tool({ tool: "create_meeting", source: "builtin", calls: 2, needsSetup: 9 }),
      tool({ tool: "send", source: "plugin", pluginKey: "slack", calls: 2 }),
    ];
    assert.deepEqual(needsSetupPlugins(rows), ["google_calendar", "google_drive"]);
  });
});

describe("callsByOrigin", () => {
  it("folds built-in tools into one row, web search into one, and each plugin into its own", () => {
    const rows = callsByOrigin([
      tool({ tool: "create_meeting", source: "builtin", calls: 4 }),
      tool({ tool: "search_knowledge", source: "builtin", calls: 3 }),
      tool({ tool: "web_search", source: "web_search", calls: 2 }),
      tool({ tool: "list_events", source: "plugin", pluginKey: "google_calendar", calls: 5 }),
      tool({ tool: "mystery", source: "something_new", calls: 1 }),
      tool({ tool: "idle", source: "builtin", calls: 0 }),
    ]);
    assert.deepEqual(
      rows.map((row) => [row.key, row.kind, row.calls]),
      [
        ["builtin", "builtin", 7],
        ["plugin:google_calendar", "plugin", 5],
        ["web_search", "webSearch", 2],
        ["other", "other", 1],
      ],
    );
    assert.equal(rows[1].pluginKey, "google_calendar");
  });
});

describe("lastToolCallAt", () => {
  it("is the newest call across tools, skipping unreadable dates", () => {
    assert.equal(
      lastToolCallAt([
        tool({ tool: "a", source: "builtin", lastCalledAt: "2026-09-30T10:00:00Z" }),
        tool({ tool: "b", source: "builtin", lastCalledAt: "2026-10-01T09:00:00Z" }),
        tool({ tool: "c", source: "builtin", lastCalledAt: "nope" }),
      ]),
      "2026-10-01T09:00:00Z",
    );
    assert.equal(lastToolCallAt([]), null);
  });
});
