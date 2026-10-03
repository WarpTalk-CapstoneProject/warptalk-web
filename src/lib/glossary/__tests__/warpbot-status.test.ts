import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  isWarpBotLoading,
  warpBotAnnouncement,
  warpBotStatusView,
  type GlossaryWarpBotStatus,
} from "../warpbot-status.ts";

const status = (state: string, over: Partial<GlossaryWarpBotStatus> = {}): GlossaryWarpBotStatus => ({
  state,
  requested: 10,
  indexed: 10,
  failed: 0,
  blocked: 0,
  pending: 0,
  ...over,
});

describe("PO 2026-10-02 — glossary 'Loading into WarpBot knowledgebase…' is real state only", () => {
  test("no status, idle and unknown states make no claim", () => {
    assert.deepEqual(warpBotStatusView(undefined), { kind: "hidden" });
    assert.deepEqual(warpBotStatusView(status("idle", { requested: 0, indexed: 0 })), { kind: "hidden" });
    assert.deepEqual(warpBotStatusView(status("something-new")), { kind: "hidden" });
  });

  test("loading reports how many of the sent terms have an answer", () => {
    assert.deepEqual(warpBotStatusView(status("loading", { indexed: 6, pending: 4 })), {
      kind: "loading",
      done: 6,
      total: 10,
    });
    assert.equal(isWarpBotLoading(status("LOADING")), true);
    assert.equal(isWarpBotLoading(status("ready")), false);
  });

  test("ready and failed map straight through; failed carries the failing term count", () => {
    assert.deepEqual(warpBotStatusView(status("ready")), { kind: "ready" });
    assert.deepEqual(warpBotStatusView(status("failed", { failed: 2, indexed: 8 })), {
      kind: "failed",
      count: 2,
      unconfirmed: false,
    });
  });

  test("stalled is an error, not an endless spinner, and counts the unanswered terms", () => {
    assert.deepEqual(warpBotStatusView(status("stalled", { indexed: 7, pending: 3 })), {
      kind: "failed",
      count: 3,
      unconfirmed: true,
    });
  });

  test("the first read of a glossary announces nothing", () => {
    assert.equal(warpBotAnnouncement(undefined, status("ready")), null);
    assert.equal(warpBotAnnouncement(undefined, status("failed", { failed: 1 })), null);
  });

  test("a visible load that settles is announced once, as ready or failed", () => {
    const loading = status("loading", { indexed: 3, pending: 7 });
    assert.equal(warpBotAnnouncement(loading, status("ready")), "ready");
    assert.equal(warpBotAnnouncement(loading, status("failed", { failed: 1 })), "failed");
    assert.equal(warpBotAnnouncement(loading, status("stalled", { pending: 7 })), "failed");
    // …and not again on the next identical poll.
    assert.equal(warpBotAnnouncement(status("ready"), status("ready")), null);
  });

  test("an import that settled before the first poll is still announced", () => {
    const before = status("ready", { requested: 10 });
    const after = status("ready", { requested: 25, indexed: 25 });
    assert.equal(warpBotAnnouncement(before, after), "ready");
    assert.equal(
      warpBotAnnouncement(status("idle", { requested: 0, indexed: 0 }), status("ready", { requested: 5, indexed: 5 })),
      "ready",
    );
  });

  test("still loading announces nothing", () => {
    assert.equal(
      warpBotAnnouncement(status("ready"), status("loading", { requested: 20, pending: 10 })),
      null,
    );
  });
});
