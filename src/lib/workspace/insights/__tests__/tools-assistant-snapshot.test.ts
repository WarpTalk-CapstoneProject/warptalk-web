// What the Insights Tools tab tells WarpBot.
//
// Counts come from the server and are shaped by the tab's own helpers; these pin what the
// snapshot adds: a previous period only when the page would draw one, "not recorded" is said and
// is not zero, no comma in a value, and labels typed by an owner cannot break the line.

import assert from "node:assert/strict";
import test from "node:test";

import type { WorkspaceToolInsightsDto } from "../../../../types/assistant-tool-insights.ts";
import { toolsAssistantSnapshot } from "../tools-assistant-snapshot.ts";

const range = { from: new Date(2026, 8, 1), to: new Date(2026, 9, 1), clamped: false };
const labels = {
  webSearch: "Web search",
  pluginLabel: (key: string) => (key === "slack" ? "Slack, Inc" : undefined),
  pluginToolLabel: (key: string, tool: string) => (key === "slack" && tool === "post_message" ? "Post message" : undefined),
};

function insights(over: Partial<WorkspaceToolInsightsDto> = {}): WorkspaceToolInsightsDto {
  return {
    from: "",
    to: "",
    recordingSince: "2026-01-01T00:00:00Z",
    totals: { calls: 40, ok: 30, error: 4, blocked: 3, needsSetup: 2, declined: 1, confirmationRequired: 0, medianDurationMs: 1200 },
    bySource: [
      { source: "builtin", calls: 25 },
      { source: "plugin", calls: 12 },
      { source: "web_search", calls: 3 },
    ],
    byDay: [],
    byTool: [
      { tool: "post_message", source: "plugin", pluginKey: "slack", calls: 12, ok: 3, error: 4, blocked: 3, needsSetup: 2, medianDurationMs: 900, lastCalledAt: null },
      { tool: "web_search", source: "web_search", pluginKey: null, calls: 3, ok: 3, error: 0, blocked: 0, needsSetup: 0, medianDurationMs: null, lastCalledAt: null },
      { tool: "list_meetings", source: "builtin", pluginKey: null, calls: 25, ok: 24, error: 0, blocked: 0, needsSetup: 0, medianDurationMs: 300, lastCalledAt: null },
    ],
    previousPeriodCalls: 25,
    ...over,
  };
}

test("the tab totals, outcomes and sources reach WarpBot", () => {
  const snapshot = toolsAssistantSnapshot({ range, insights: insights(), labels });
  assert.equal(snapshot.period, "2026-09-01 to 2026-09-30");
  assert.equal(snapshot.tool_calls, "40");
  assert.equal(snapshot.tool_calls_previous_period, "25");
  assert.equal(snapshot.tool_success_rate, "75%");
  assert.equal(snapshot.tool_calls_succeeded, "30");
  assert.equal(snapshot.tool_calls_failed, "4");
  assert.equal(snapshot.tool_calls_blocked_by_policy, "3");
  assert.equal(snapshot.tool_calls_needing_setup, "2");
  assert.equal(snapshot.tool_calls_declined_by_member, "1");
  assert.equal("tool_calls_awaiting_confirmation" in snapshot, false);
  assert.equal(snapshot.median_tool_duration, "1.2 s");
  assert.equal(snapshot.calls_by_source, "WarpBot built-in tools 25; web search 3; plugins 12");
});

test("tools are named the way the table names them, worst first", () => {
  const snapshot = toolsAssistantSnapshot({ range, insights: insights(), labels });
  assert.equal(snapshot.most_called_tools, "List meetings 25 calls; Post message (Slack Inc) 12 calls; Web search 3 calls");
  assert.equal(snapshot.tools_with_problems, "Post message (Slack Inc) 4 failed and 3 blocked by policy and 2 needing setup of 12 calls");
});

test("a healthy period says none, not nothing", () => {
  const snapshot = toolsAssistantSnapshot({
    range,
    insights: insights({
      totals: { calls: 3, ok: 3, error: 0, blocked: 0, needsSetup: 0, declined: 0, confirmationRequired: 0, medianDurationMs: null },
      byTool: [{ tool: "web_search", source: "web_search", pluginKey: null, calls: 3, ok: 3, error: 0, blocked: 0, needsSetup: 0, medianDurationMs: null, lastCalledAt: null }],
    }),
    labels,
  });
  assert.equal(snapshot.tools_with_problems, "none");
  assert.equal("median_tool_duration" in snapshot, false);
});

test("no calls is said as a zero with no rate, and no table to describe", () => {
  const snapshot = toolsAssistantSnapshot({
    range,
    insights: insights({ totals: { calls: 0, ok: 0, error: 0, blocked: 0, needsSetup: 0, declined: 0, confirmationRequired: 0, medianDurationMs: null }, byTool: [], bySource: [] }),
    labels,
  });
  assert.equal(snapshot.tool_calls, "0");
  for (const key of ["tool_success_rate", "calls_by_source", "most_called_tools", "tools_with_problems"]) {
    assert.equal(key in snapshot, false, key);
  }
});

test("a period that began before recording did has no comparison and says so", () => {
  const snapshot = toolsAssistantSnapshot({ range, insights: insights({ recordingSince: "2026-09-10T00:00:00Z" }), labels });
  assert.equal("tool_calls_previous_period" in snapshot, false);
  assert.match(snapshot.recording_since, /^2026-09-10; earlier days were not recorded/);
});

test("a window the server shortened says which days it left out", () => {
  const snapshot = toolsAssistantSnapshot({ range: { ...range, clamped: true }, insights: insights(), labels });
  assert.match(snapshot.period_note, /last 180 days/);
});

test("no value holds a comma", () => {
  for (const snapshot of [
    toolsAssistantSnapshot({ range, insights: insights(), labels }),
    toolsAssistantSnapshot({ range: { ...range, clamped: true }, insights: insights({ recordingSince: "2026-09-10T00:00:00Z" }), labels }),
  ]) {
    for (const [key, value] of Object.entries(snapshot)) assert.equal(value.includes(","), false, `${key}=${value}`);
  }
});
