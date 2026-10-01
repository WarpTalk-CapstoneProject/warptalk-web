import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ToolInsightsDayDto, ToolInsightsToolDto, ToolInsightsTotalsDto } from "../../../../types/assistant-tool-insights.ts";
import {
  addDaysToDayKey,
  filterToolRows,
  formatDurationMs,
  outcomeSplit,
  sourceChips,
  toolDaySeries,
  toolDisplayName,
  toolSourceKey,
  toolTableRows,
  toolsHealth,
} from "../tools-metrics.ts";

function day(date: string, builtin: number, plugin: number, webSearch: number, ok: number, failed: number): ToolInsightsDayDto {
  return { date, builtin, plugin, webSearch, ok, failed };
}

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

const TOTALS: ToolInsightsTotalsDto = {
  calls: 20,
  ok: 14,
  error: 2,
  blocked: 1,
  needsSetup: 2,
  declined: 0,
  confirmationRequired: 1,
  medianDurationMs: 420,
};

const LABELS = { webSearch: "Web search" };

describe("toolSourceKey", () => {
  it("maps the server's sources and keeps anything unknown as other", () => {
    assert.equal(toolSourceKey("builtin"), "builtin");
    assert.equal(toolSourceKey("web_search"), "webSearch");
    assert.equal(toolSourceKey("plugin"), "plugin");
    assert.equal(toolSourceKey("future_source"), "other");
    assert.equal(toolSourceKey(null), "other");
  });
});

describe("toolDaySeries", () => {
  it("plots the server's days in date order, stacked by source, with each day's success rate", () => {
    const days = toolDaySeries([
      day("2026-09-02", 1, 1, 0, 1, 1),
      day("2026-09-01", 2, 1, 1, 3, 1),
      day("2026-09-03", 0, 0, 0, 0, 0),
    ]);
    assert.deepEqual(days.map((d) => d.key), ["2026-09-01", "2026-09-02", "2026-09-03"]);
    assert.equal(days[0].total, 4);
    assert.equal(days[0].successRate, 75);
    assert.equal(days[1].successRate, 50);
  });

  it("keeps a zero day as zero calls and no rate, not a gap", () => {
    const [zero] = toolDaySeries([day("2026-09-03", 0, 0, 0, 0, 0)]);
    assert.equal(zero.total, 0);
    assert.equal(zero.builtin, 0);
    assert.equal(zero.successRate, null);
    assert.equal(zero.future, false);
  });

  it("adds the days still to come up to the axis end, all blank", () => {
    const days = toolDaySeries([day("2026-09-29", 1, 0, 0, 1, 0), day("2026-09-30", 0, 0, 0, 0, 0)], "2026-10-03");
    assert.deepEqual(days.map((d) => [d.key, d.future]), [
      ["2026-09-29", false],
      ["2026-09-30", false],
      ["2026-10-01", true],
      ["2026-10-02", true],
    ]);
    assert.equal(days[3].total, null);
    assert.equal(days[3].builtin, null);
    assert.equal(days[3].successRate, null);
  });

  it("counts a repeated date once and skips malformed dates", () => {
    const days = toolDaySeries([day("2026-09-01", 1, 0, 0, 1, 0), day("2026-09-01", 9, 0, 0, 9, 0), day("Sep 2", 1, 0, 0, 1, 0)]);
    assert.equal(days.length, 1);
    assert.equal(days[0].total, 1);
  });

  it("draws nothing for an empty response, even with an axis end", () => {
    assert.deepEqual(toolDaySeries([], "2026-10-03"), []);
  });

  it("does calendar arithmetic on day keys across a month end", () => {
    assert.equal(addDaysToDayKey("2026-09-30", 1), "2026-10-01");
  });
});

describe("outcomeSplit", () => {
  it("lists every outcome with calls, in bar order, with its share", () => {
    const split = outcomeSplit(TOTALS);
    assert.deepEqual(split.map((row) => row.key), ["ok", "error", "needsSetup", "blocked", "confirmationRequired"]);
    assert.equal(split[0].share, 70);
    assert.equal(split.find((row) => row.key === "declined"), undefined);
  });

  it("is empty with no calls", () => {
    assert.deepEqual(outcomeSplit({ ...TOTALS, calls: 0, ok: 0, error: 0, blocked: 0, needsSetup: 0, confirmationRequired: 0 }), []);
  });
});

describe("toolsHealth", () => {
  it("follows the Overview line's rule", () => {
    assert.equal(toolsHealth({ calls: 0, needsSetup: 0, error: 0 }), "idle");
    assert.equal(toolsHealth({ calls: 4, needsSetup: 0, error: 0 }), "healthy");
    assert.equal(toolsHealth({ calls: 4, needsSetup: 1, error: 0 }), "attention");
  });
});

describe("sourceChips", () => {
  it("offers All plus each source that made a call, in source order, with counts", () => {
    const chips = sourceChips(
      [
        { source: "plugin", calls: 5 },
        { source: "builtin", calls: 12 },
        { source: "web_search", calls: 0 },
        { source: "something_new", calls: 1 },
      ],
      18,
    );
    assert.deepEqual(chips, [
      { key: "all", calls: 18 },
      { key: "builtin", calls: 12 },
      { key: "plugin", calls: 5 },
    ]);
  });

  it("is only All when nothing ran", () => {
    assert.deepEqual(sourceChips([], 0), [{ key: "all", calls: 0 }]);
  });
});

describe("toolDisplayName", () => {
  it("uses the built-in copy, the web search label, the plugin catalog, then the name humanised", () => {
    assert.equal(toolDisplayName({ tool: "create_meeting", source: "builtin", pluginKey: null }, LABELS), "Create meeting room");
    assert.equal(toolDisplayName({ tool: "web_search", source: "web_search", pluginKey: null }, LABELS), "Web search");
    assert.equal(
      toolDisplayName(
        { tool: "list_events", source: "plugin", pluginKey: "google_calendar" },
        { ...LABELS, pluginToolLabel: (key, name) => (key === "google_calendar" && name === "list_events" ? "List events" : null) },
      ),
      "List events",
    );
    assert.equal(toolDisplayName({ tool: "brand_new_tool", source: "builtin", pluginKey: null }, LABELS), "Brand new tool");
  });
});

describe("toolTableRows", () => {
  const rows = toolTableRows(
    [
      tool({ tool: "search_files", source: "plugin", pluginKey: "google_drive", calls: 4, ok: 1, needsSetup: 2, blocked: 1 }),
      tool({ tool: "create_meeting", source: "builtin", calls: 10, ok: 9, error: 1, medianDurationMs: 800 }),
      tool({ tool: "web_search", source: "web_search", calls: 3, ok: 3 }),
      tool({ tool: "list_events", source: "plugin", pluginKey: "google_calendar", calls: 4, ok: 2, blocked: 1 }),
      tool({ tool: "ask_user", source: "builtin", calls: 2, ok: 1 }),
      tool({ tool: "never", source: "builtin", calls: 0 }),
    ],
    { ...LABELS, pluginLabel: (key) => (key === "google_drive" ? "Google Drive" : null) },
  );

  it("lists every tool that ran, most called first, with a source chip", () => {
    assert.deepEqual(
      rows.map((row) => [row.tool, row.source]),
      [
        ["create_meeting", "builtin"],
        ["list_events", "plugin"],
        ["search_files", "plugin"],
        ["web_search", "webSearch"],
        ["ask_user", "builtin"],
      ],
    );
  });

  it("works out each tool's success rate and the calls outside the four columns", () => {
    const meeting = rows.find((row) => row.tool === "create_meeting")!;
    assert.equal(meeting.successRate, 90);
    assert.equal(meeting.medianDurationMs, 800);
    const ask = rows.find((row) => row.tool === "ask_user")!;
    assert.equal(ask.other, 1);
  });

  it("says who fixes a plugin tool: the member for needs setup, the Owner for a policy block", () => {
    assert.equal(rows.find((row) => row.tool === "search_files")!.fixer, "member");
    assert.equal(rows.find((row) => row.tool === "list_events")!.fixer, "owner");
    assert.equal(rows.find((row) => row.tool === "create_meeting")!.fixer, null);
  });

  it("labels plugins from the catalog and falls back to the key", () => {
    assert.equal(rows.find((row) => row.tool === "search_files")!.pluginLabel, "Google Drive");
    assert.equal(rows.find((row) => row.tool === "list_events")!.pluginLabel, "google_calendar");
    assert.equal(rows.find((row) => row.tool === "web_search")!.pluginLabel, null);
  });

  it("filters by the chosen source chip", () => {
    assert.deepEqual(filterToolRows(rows, "plugin").map((row) => row.tool), ["list_events", "search_files"]);
    assert.equal(filterToolRows(rows, "all").length, rows.length);
    assert.deepEqual(filterToolRows(rows, "webSearch").map((row) => row.tool), ["web_search"]);
  });
});

describe("formatDurationMs", () => {
  it("prints milliseconds, seconds and minutes", () => {
    assert.equal(formatDurationMs(850), "850 ms");
    assert.equal(formatDurationMs(1250), "1.3 s");
    assert.equal(formatDurationMs(12_000), "12 s");
    assert.equal(formatDurationMs(150_000), "2.5 min");
    assert.equal(formatDurationMs(null), null);
  });
});
