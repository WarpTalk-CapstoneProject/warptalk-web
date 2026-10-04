import test from "node:test";
import assert from "node:assert/strict";

import {
  MEET_CAPTIONS_OFF_GRACE_MS,
  MeetCaptionsOffWatch,
  ensureFailureIsActionable,
} from "../meet-captions-off.ts";
import { streamMeetCaptions, type MeetCaptionStatus } from "../../desktop/bridge.ts";

// The "turn on captions (CC) in Google Meet" notice: when to say it, when it goes away.

function status(overrides: Partial<MeetCaptionStatus> = {}): MeetCaptionStatus {
  return {
    meetCode: "abc-defg-hij",
    running: true,
    state: "live",
    captionsVisible: true,
    lastChangeMs: null,
    ...overrides,
  };
}

function harness() {
  const changes: boolean[] = [];
  const timers: { id: number; ms: number; fn: () => void }[] = [];
  let nextId = 1;
  const watch = new MeetCaptionsOffWatch({
    onChange: (off) => changes.push(off),
    setTimer: (fn, ms) => {
      const id = nextId++;
      timers.push({ id, ms, fn });
      return id;
    },
    clearTimer: (id) => {
      const index = timers.findIndex((t) => t.id === id);
      if (index >= 0) timers.splice(index, 1);
    },
  });
  return {
    watch,
    changes,
    timers,
    fire() {
      const timer = timers.shift();
      assert.ok(timer, "expected a pending grace timer");
      timer.fn();
      return timer.ms;
    },
  };
}

test("an actionable ensure failure says it at once; a visible caption clears it", () => {
  const h = harness();
  h.watch.ensureResult({ ok: false, state: "off", reason: "cc-button-hidden" });
  assert.deepEqual(h.changes, [true]);
  h.watch.status(status({ captionsVisible: true }));
  assert.deepEqual(h.changes, [true, false]);
});

test("ensure refusals CC cannot fix say nothing", () => {
  for (const reason of ["disabled", "unsupported-platform", "invalid-meet-code"]) {
    assert.equal(ensureFailureIsActionable({ ok: false, state: "unknown", reason }), false, reason);
  }
  assert.equal(ensureFailureIsActionable({ ok: false, state: "unknown", reason: "unknown-locale" }), true);
  assert.equal(ensureFailureIsActionable({ ok: false, state: "off" }), true);
  assert.equal(ensureFailureIsActionable({ ok: true, state: "on" }), false);
  assert.equal(ensureFailureIsActionable(null), false);
  const h = harness();
  h.watch.ensureResult({ ok: false, state: "unknown", reason: "disabled" });
  h.watch.ensureResult(null);
  assert.deepEqual(h.changes, []);
});

test("captions hidden on a readable tab: said only after the grace period", () => {
  const h = harness();
  h.watch.status(status({ captionsVisible: false }));
  assert.deepEqual(h.changes, []);
  h.watch.status(status({ captionsVisible: false, state: "stale" }));
  assert.equal(h.timers.length, 1, "a repeated hidden status does not restart the clock");
  assert.equal(h.fire(), MEET_CAPTIONS_OFF_GRACE_MS);
  assert.deepEqual(h.changes, [true]);
  h.watch.status(status({ captionsVisible: true }));
  assert.deepEqual(h.changes, [true, false]);
  assert.equal(h.timers.length, 0);
});

test("captions coming back inside the grace period say nothing", () => {
  const h = harness();
  h.watch.status(status({ captionsVisible: false }));
  h.watch.status(status({ captionsVisible: true }));
  assert.equal(h.timers.length, 0);
  assert.deepEqual(h.changes, []);
});

test("an unreadable tab (switched away, minimized) is not evidence CC is off", () => {
  const h = harness();
  h.watch.status(status({ captionsVisible: false, state: "unavailable_tab_inactive" }));
  h.watch.status(status({ captionsVisible: false, state: "unavailable_minimized" }));
  assert.equal(h.timers.length, 0);
  // Hidden on a live tab, then the tab goes away before 10 s: the clock stops.
  h.watch.status(status({ captionsVisible: false }));
  assert.equal(h.timers.length, 1);
  h.watch.status(status({ captionsVisible: false, state: "unavailable_tab_inactive" }));
  assert.equal(h.timers.length, 0);
  assert.deepEqual(h.changes, []);
});

test("the stream stopping clears the notice; dispose stops the clock", () => {
  const h = harness();
  h.watch.ensureResult({ ok: false, state: "off", reason: "verify-button-not-flipped" });
  h.watch.status(status({ running: false, captionsVisible: false }));
  assert.deepEqual(h.changes, [true, false]);
  h.watch.status(status({ captionsVisible: false }));
  h.watch.dispose();
  assert.equal(h.timers.length, 0);
  h.watch.ensureResult({ ok: false, state: "off" });
  assert.deepEqual(h.changes, [true, false], "nothing after dispose");
});

test("ensure ok after a failure clears the ensure half", () => {
  const h = harness();
  h.watch.ensureResult({ ok: false, state: "off" });
  h.watch.ensureResult({ ok: true, state: "on" });
  assert.deepEqual(h.changes, [true, false]);
  assert.equal(h.watch.off, false);
});

// ── streamMeetCaptions carries the status to the watch, subscribed before the stream is armed ──

const globals = globalThis as unknown as { window: unknown };

test("streamMeetCaptions subscribes status before arming and unsubscribes both on stop", async () => {
  const order: string[] = [];
  let statusListener: ((s: MeetCaptionStatus) => void) | null = null;
  globals.window = {
    warptalk: {
      onMeetCaption: () => {
        order.push("caption:on");
        return () => order.push("caption:off");
      },
      onMeetCaptionStatus: (cb: (s: MeetCaptionStatus) => void) => {
        order.push("status:on");
        statusListener = cb;
        return () => order.push("status:off");
      },
      setMeetCaptionsStream: async (_code: string, enabled: boolean) => {
        order.push(enabled ? "arm" : "disarm");
      },
    },
  };
  try {
    const seen: MeetCaptionStatus[] = [];
    const stop = streamMeetCaptions("abc-defg-hij", () => {}, (s) => seen.push(s));
    assert.ok(stop);
    assert.deepEqual(order, ["caption:on", "status:on", "arm"]);
    statusListener!(status({ captionsVisible: false }));
    assert.equal(seen.length, 1);
    await stop();
    assert.deepEqual(order.slice(3), ["disarm", "status:off", "caption:off"]);
  } finally {
    globals.window = undefined;
  }
});

test("streamMeetCaptions on a desktop without the status event still streams captions", () => {
  globals.window = {
    warptalk: {
      onMeetCaption: () => () => {},
      setMeetCaptionsStream: async () => {},
    },
  };
  try {
    assert.ok(streamMeetCaptions("abc-defg-hij", () => {}, () => assert.fail("never called")));
  } finally {
    globals.window = undefined;
  }
});
