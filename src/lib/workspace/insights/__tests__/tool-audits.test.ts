// WarpBot tool calls counted over a period (WT-878).
//
// The page this replaced counted one 50-row page and called it "this month", and said 96% success
// when there were no calls at all. These pin the rules that stop that: read until the window is
// covered, say "at least" when a cap stops the read, and never produce a rate from nothing.

import assert from "node:assert/strict";
import test from "node:test";

import type { WorkspacePluginToolAuditDto } from "../../../../types/assistant.ts";
import {
  auditCoveredSince,
  lastToolCallAt,
  shouldReadNextAuditPage,
  summariseToolCalls,
  toolLineStatus,
  toolOutcomeKind,
} from "../tool-audits.ts";

let seq = 0;
function audit(createdAt: string, resultStatus = "success", pluginKey = "notion"): WorkspacePluginToolAuditDto {
  seq += 1;
  return { id: `a${seq}`, userId: "u1", pluginKey, toolName: "create_page", resultStatus, createdAt };
}

const SEP = { from: new Date("2026-09-01T00:00:00Z"), to: new Date("2026-10-01T00:00:00Z") };

test("outcomes are grouped by what an owner does about them", () => {
  assert.equal(toolOutcomeKind("success"), "succeeded");
  assert.equal(toolOutcomeKind("permission_denied"), "blocked");
  assert.equal(toolOutcomeKind("connection_required"), "needsSetup");
  assert.equal(toolOutcomeKind("missing_scope"), "needsSetup");
  assert.equal(toolOutcomeKind("confirmation_required"), "awaitingConfirmation");
  assert.equal(toolOutcomeKind("provider_unavailable"), "failed");
  assert.equal(toolOutcomeKind("something_new"), "failed");
  assert.equal(toolOutcomeKind(null), "failed");
});

test("reading stops at a short page or once a row predates the window", () => {
  const stop = SEP.from.getTime();
  const full = [audit("2026-09-20T00:00:00Z"), audit("2026-09-10T00:00:00Z")];
  assert.equal(shouldReadNextAuditPage(full, 2, stop), true, "a full page inside the window: keep reading");
  assert.equal(shouldReadNextAuditPage(full.slice(0, 1), 2, stop), false, "a short page is the end of the log");
  assert.equal(
    shouldReadNextAuditPage([audit("2026-09-20T00:00:00Z"), audit("2026-08-31T23:59:00Z")], 2, stop),
    false,
    "a row older than the window means the window is covered",
  );
  assert.equal(shouldReadNextAuditPage([], 2, stop), false);
});

test("a read that ran out of log covers everything; a capped one only back to its oldest row", () => {
  const rows = [audit("2026-09-20T00:00:00Z"), audit("2026-09-12T00:00:00Z")];
  assert.equal(auditCoveredSince({ rows, reachedEnd: true }), Number.NEGATIVE_INFINITY);
  assert.equal(auditCoveredSince({ rows, reachedEnd: false }), new Date("2026-09-12T00:00:00Z").getTime());
  assert.equal(auditCoveredSince({ rows: [], reachedEnd: false }), Number.POSITIVE_INFINITY);
});

test("the period's calls are counted by outcome and by plugin", () => {
  const read = {
    reachedEnd: true,
    rows: [
      audit("2026-10-01T00:00:00Z"), // outside: the window's end is exclusive
      audit("2026-09-29T10:00:00Z", "success", "calendar"),
      audit("2026-09-28T10:00:00Z", "permission_denied"),
      audit("2026-09-27T10:00:00Z", "connection_required", "gmail"),
      audit("2026-09-26T10:00:00Z", "success"),
      audit("2026-08-31T10:00:00Z"), // outside: before the window
    ],
  };
  const summary = summariseToolCalls(read, SEP);
  assert.equal(summary.calls, 4);
  assert.equal(summary.succeeded, 2);
  assert.equal(summary.blocked, 1);
  assert.equal(summary.needsSetup, 1);
  assert.equal(summary.successRate, 50);
  assert.equal(summary.complete, true);
  assert.deepEqual(summary.byPlugin, [
    { pluginKey: "notion", calls: 2 },
    { pluginKey: "calendar", calls: 1 },
    { pluginKey: "gmail", calls: 1 },
  ]);
  assert.deepEqual(summary.needsSetupPlugins, ["gmail"]);
});

test("a read capped inside the window is a floor, not a total", () => {
  const read = { reachedEnd: false, rows: [audit("2026-09-29T00:00:00Z"), audit("2026-09-20T00:00:00Z")] };
  const summary = summariseToolCalls(read, SEP);
  assert.equal(summary.calls, 2);
  assert.equal(summary.complete, false);
});

test("no calls is no rate — never a made-up 96%", () => {
  const summary = summariseToolCalls({ rows: [], reachedEnd: true }, SEP);
  assert.equal(summary.calls, 0);
  assert.equal(summary.successRate, null);
  assert.equal(summary.complete, true);
  assert.equal(toolLineStatus(summary), "noCalls");
});

test("the line turns amber only for needs-setup, not for policy blocks", () => {
  assert.equal(toolLineStatus({ calls: 10, needsSetup: 1 }), "needsAttention");
  assert.equal(toolLineStatus({ calls: 10, needsSetup: 0 }), "healthy");
});

test("the last call is the newest row read, whatever the window", () => {
  const read = { reachedEnd: true, rows: [audit("2026-09-02T00:00:00Z"), audit("2026-09-29T08:00:00Z")] };
  assert.equal(lastToolCallAt(read), "2026-09-29T08:00:00Z");
  assert.equal(lastToolCallAt({ rows: [], reachedEnd: true }), null);
});
