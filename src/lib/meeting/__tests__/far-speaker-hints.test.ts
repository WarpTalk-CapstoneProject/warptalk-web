import test from "node:test";
import assert from "node:assert/strict";

import {
  FarSpeakerHintBatcher,
  MAX_HINTS_PER_CALL,
  MAX_HINT_AGE_MS,
  captionEventToHint,
  rendererClockOffsetMs,
  type FarSpeakerHint,
} from "../far-speaker-hints.ts";
import type { MeetCaptionEvent } from "../../desktop/bridge.ts";

// Live Meet speaker names: desktop #44 caption events -> hub ReportFarSpeakerHints (backend #499).

const MEET = "abc-defg-hij";
const NOW = 1_800_000_000_000;

function caption(overrides: Partial<MeetCaptionEvent> = {}): MeetCaptionEvent {
  return {
    meetCode: MEET,
    blockId: "b1",
    kind: "caption",
    speaker: "Lan Nguyen",
    text: "hello there",
    tStartMs: NOW - 3_000,
    tEndMs: NOW - 1_000,
    tStableMs: NOW - 500,
    tConfidence: "live",
    stale: false,
    source: "meet_caption",
    ...overrides,
  };
}

/** A manual clock and timer queue, so the batcher's schedule is observable. */
function harness(sendImpl?: (hints: FarSpeakerHint[], now: number) => Promise<unknown>) {
  let now = NOW;
  const timers: { id: number; ms: number; fn: () => void }[] = [];
  let nextId = 1;
  const calls: { hints: FarSpeakerHint[]; now: number }[] = [];
  const batcher = new FarSpeakerHintBatcher({
    meetCode: MEET,
    now: () => now,
    setTimer: (fn, ms) => {
      const id = nextId++;
      timers.push({ id, ms, fn });
      return id;
    },
    clearTimer: (id) => {
      const index = timers.findIndex((t) => t.id === id);
      if (index >= 0) timers.splice(index, 1);
    },
    send: (hints, clientNowMs) => {
      calls.push({ hints, now: clientNowMs });
      return sendImpl ? sendImpl(hints, clientNowMs) : Promise.resolve(1);
    },
  });
  return {
    batcher,
    calls,
    timers,
    advance(ms: number) {
      now += ms;
    },
    /** Fire the earliest pending timer and let the send settle. */
    async tick() {
      const timer = timers.shift();
      assert.ok(timer, "expected a scheduled flush");
      now += timer.ms;
      timer.fn();
      await new Promise((resolve) => setImmediate(resolve));
      return timer.ms;
    },
  };
}

test("a caption event becomes the hub's FarSpeakerHintDto shape", () => {
  assert.deepEqual(captionEventToHint(caption({ tConfidence: "batch", stale: true })), {
    name: "Lan Nguyen",
    tStartMs: NOW - 3_000,
    tEndMs: NOW - 1_000,
    confidence: "batch",
    stale: true,
  });
});

test("an event that cannot name anybody is not a hint", () => {
  assert.equal(captionEventToHint(caption({ speaker: "   " })), null);
  assert.equal(captionEventToHint(caption({ tStartMs: 0 })), null);
  assert.equal(captionEventToHint(caption({ tEndMs: NOW - 4_000 })), null);
});

test("events are batched and sent on the interval with the client's clock", async () => {
  const h = harness();
  h.batcher.add(caption({ blockId: "b1" }));
  h.batcher.add(caption({ blockId: "b2", speaker: "Tom", tEndMs: NOW - 900 }));
  assert.equal(h.timers.length, 1, "one flush scheduled for the whole batch");
  assert.equal(h.calls.length, 0);
  await h.tick();
  assert.equal(h.calls.length, 1);
  assert.deepEqual(
    h.calls[0].hints.map((hint) => hint.name),
    ["Lan Nguyen", "Tom"],
  );
  assert.equal(h.calls[0].now, NOW + 400);
  assert.equal(h.batcher.size, 0);
});

test("an update replaces the pending version of the same block", async () => {
  const h = harness();
  h.batcher.add(caption({ blockId: "b1", tEndMs: NOW - 1_000 }));
  h.batcher.add(caption({ blockId: "b1", kind: "update", tEndMs: NOW - 200 }));
  await h.tick();
  assert.equal(h.calls[0].hints.length, 1);
  assert.equal(h.calls[0].hints[0].tEndMs, NOW - 200);
});

test("events for another Meet are ignored", () => {
  const h = harness();
  h.batcher.add(caption({ meetCode: "zzz-zzzz-zzz" }));
  assert.equal(h.batcher.size, 0);
  assert.equal(h.timers.length, 0);
});

test("a burst goes out oldest first, at most 20 per call", async () => {
  const h = harness();
  for (let i = 0; i < 25; i += 1) {
    h.batcher.add(caption({ blockId: `b${i}`, tStartMs: NOW - 20_000 + i * 100, tEndMs: NOW - 10_000 + i * 100 }));
  }
  await h.tick();
  assert.equal(h.calls[0].hints.length, MAX_HINTS_PER_CALL);
  assert.equal(h.calls[0].hints[0].tEndMs, NOW - 10_000);
  await h.tick();
  assert.equal(h.calls[1].hints.length, 5);
  assert.equal(h.calls[1].hints[0].tEndMs, NOW - 10_000 + 20 * 100);
});

test("a failed send is kept, retried with backoff, and resent at once on reconnect", async () => {
  let fail = true;
  const h = harness(() => (fail ? Promise.reject(new Error("hub not connected")) : Promise.resolve(1)));
  h.batcher.add(caption());
  await h.tick();
  assert.equal(h.calls.length, 1);
  assert.equal(h.batcher.size, 1, "the batch is back in the queue");
  assert.equal(h.timers[0].ms, 800, "the retry waits longer");
  await h.tick();
  assert.equal(h.timers[0].ms, 1_600);

  fail = false;
  h.batcher.flushNow();
  assert.equal(h.timers.length, 0, "the backoff timer is replaced by the immediate send");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.calls.length, 3);
  assert.equal(h.batcher.size, 0);
});

test("a block updated while its send was failing keeps the newer version", async () => {
  let reject: (error: Error) => void = () => undefined;
  const h = harness(() => new Promise((_, r) => (reject = r)));
  h.batcher.add(caption({ tEndMs: NOW - 1_000 }));
  const fired = h.timers.shift()!;
  fired.fn();
  h.batcher.add(caption({ kind: "update", tEndMs: NOW - 100 }));
  reject(new Error("refused"));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.batcher.size, 1);
  h.batcher.flushNow();
  assert.equal(h.calls.at(-1)!.hints[0].tEndMs, NOW - 100);
});

test("hints older than the server's age limit are dropped, not resent", async () => {
  const h = harness(() => Promise.reject(new Error("down")));
  h.batcher.add(caption());
  await h.tick();
  assert.equal(h.batcher.size, 1);
  h.advance(MAX_HINT_AGE_MS);
  h.batcher.flushNow();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.calls.length, 1, "nothing left worth sending");
  assert.equal(h.batcher.size, 0);
});

test("dispose stops the schedule; a final flush sends what is left once", async () => {
  const h = harness();
  h.batcher.add(caption());
  await h.batcher.dispose({ finalFlush: true });
  assert.equal(h.calls.length, 1);
  assert.equal(h.timers.length, 0);
  h.batcher.add(caption({ blockId: "b2" }));
  h.batcher.flushNow();
  assert.equal(h.calls.length, 1, "a disposed batcher sends nothing");
});

// ── The clock: desktop `sentAtMs` rebases caption times onto this renderer's Date.now() ──

test("rendererClockOffsetMs: receipt minus sentAtMs, 0 without a stamp or a receipt time", () => {
  assert.equal(rendererClockOffsetMs(caption({ sentAtMs: NOW - 60_000 }), NOW), 60_000);
  assert.equal(rendererClockOffsetMs(caption({ sentAtMs: NOW + 5_000 }), NOW), -5_000);
  assert.equal(rendererClockOffsetMs(caption(), NOW), 0, "older desktop: no stamp");
  assert.equal(rendererClockOffsetMs(caption({ sentAtMs: NOW }), undefined), 0);
  assert.equal(rendererClockOffsetMs(caption({ sentAtMs: Number.NaN }), NOW), 0);
  assert.equal(rendererClockOffsetMs(caption({ sentAtMs: 0 }), NOW), 0);
});

test("captionEventToHint moves times by the wall-clock jump since the desktop started", () => {
  // The wall clock jumped 90 s forward after the desktop anchored alignedNow(): main still says
  // NOW-3000..NOW-1000 for a block read a moment ago, and stamps sentAtMs = NOW (its axis).
  const jumped = NOW + 90_000;
  const hint = captionEventToHint(caption({ sentAtMs: NOW }), jumped);
  assert.equal(hint?.tStartMs, jumped - 3_000);
  assert.equal(hint?.tEndMs, jumped - 1_000);
});

test("captionEventToHint without sentAtMs keeps the desktop's times (older desktop)", () => {
  const hint = captionEventToHint(caption(), NOW + 90_000);
  assert.equal(hint?.tStartMs, NOW - 3_000);
  assert.equal(hint?.tEndMs, NOW - 1_000);
});

test("the batcher rebases at receipt, so a jumped clock does not age a fresh hint out", async () => {
  // Wall clock went BACK 60 s after the desktop started: unrebased, tEnd would sit 60 s in the
  // future; went forward 60 s: unrebased, it would be older than MAX_HINT_AGE_MS and dropped.
  const h = harness();
  h.advance(60_000);
  h.batcher.add(caption({ sentAtMs: NOW }));
  const waited = await h.tick();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].hints[0].tEndMs, NOW + 60_000 - 1_000);
  assert.equal(h.calls[0].now, NOW + 60_000 + waited);
});

test("B3: a failed send is reported to onSendError with the run's failure count; success resets it", async () => {
  let fail = true;
  const reported: { reason: string; failures: number }[] = [];
  const batcher = new FarSpeakerHintBatcher({
    meetCode: MEET,
    now: () => NOW,
    setTimer: () => 1,
    clearTimer: () => {},
    send: () =>
      fail
        ? Promise.reject(new Error("Only the participant capturing the external meeting can report its speakers."))
        : Promise.resolve(1),
    onSendError: (error, failures) => reported.push({ reason: (error as Error).message, failures }),
  });
  batcher.add(caption());
  batcher.flushNow();
  await new Promise((resolve) => setImmediate(resolve));
  batcher.flushNow(); // a reconnect resets the backoff, not the observer's count of this failure
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(
    reported.map((r) => r.failures),
    [1, 1],
  );
  assert.match(reported[0].reason, /capturing the external meeting/);
  fail = false;
  batcher.flushNow();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(reported.length, 2, "a successful send reports nothing");
  assert.equal(batcher.size, 0);
});
