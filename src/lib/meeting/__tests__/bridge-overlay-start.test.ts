import test from "node:test";
import assert from "node:assert/strict";

import { startBridgeTranslation, type BridgeOverlayStartSteps } from "../bridge-overlay-start.ts";

/**
 * Steps that record the order they were called in.
 *
 * The bug was an absence - the popup never asked the main window for anything - so what is worth
 * holding is the sequence, not any one call.
 */
function recorder(over: Partial<BridgeOverlayStartSteps> = {}) {
  const calls: string[] = [];
  const steps: BridgeOverlayStartSteps = {
    activate: async (roomId) => {
      calls.push(`activate ${roomId}`);
      return over.activate ? over.activate(roomId) : true;
    },
    openRoom: async (roomId) => {
      calls.push(`open ${roomId}`);
      return over.openRoom?.(roomId);
    },
    startTranslation: async (roomId) => {
      calls.push(`resume ${roomId}`);
      return over.startTranslation?.(roomId);
    },
  };
  return { calls, steps };
}

test("a room nobody opened is activated in the main window before its session exists", async () => {
  // Flow 1 exactly: a scheduled room, its popup raised by the trigger, never opened in WarpTalk.
  const { calls, steps } = recorder();
  const outcome = await startBridgeTranslation({ id: "room-1", status: "scheduled" }, steps);
  assert.deepEqual(calls, ["activate room-1", "open room-1", "resume room-1"]);
  assert.deepEqual(outcome, { activated: true });
});

test("an open room is still activated; only the /start is skipped", async () => {
  // Opened elsewhere - by the other seat, or by a previous Start and Stop - is not the same as
  // being carried by THIS machine's main window. Skipping activation here would reopen the gap.
  for (const status of ["in_progress", "paused"]) {
    const { calls, steps } = recorder();
    await startBridgeTranslation({ id: "room-1", status }, steps);
    assert.deepEqual(calls, ["activate room-1", "resume room-1"], status);
  }
});

test("activation is awaited before either REST call is sent", async () => {
  // Not merely called first: a relay still in flight when /resume lands is the same window of
  // "translating, carried by nobody" this exists to close.
  let released: (value: boolean) => void = () => undefined;
  const activation = new Promise<boolean>((resolve) => {
    released = resolve;
  });
  const { calls, steps } = recorder({ activate: () => activation });

  const started = startBridgeTranslation({ id: "room-1", status: "scheduled" }, steps);
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(calls, ["activate room-1"]);

  released(true);
  await started;
  assert.deepEqual(calls, ["activate room-1", "open room-1", "resume room-1"]);
});

test("no main window to ask still starts, and says it could not activate", async () => {
  // A desktop build older than the relay, or the route in a browser tab. The host may already be
  // carrying the room by hand; refusing would take that away. The caller warns instead.
  const { calls, steps } = recorder({ activate: async () => false });
  const outcome = await startBridgeTranslation({ id: "room-1", status: "scheduled" }, steps);
  assert.deepEqual(calls, ["activate room-1", "open room-1", "resume room-1"]);
  assert.deepEqual(outcome, { activated: false });
});

test("a room that fails to open does not get a translation session", async () => {
  const { calls, steps } = recorder({
    openRoom: async () => {
      throw new Error("Room is not in a state that can be started.");
    },
  });
  await assert.rejects(
    startBridgeTranslation({ id: "room-1", status: "scheduled" }, steps),
    /can be started/,
  );
  assert.deepEqual(calls, ["activate room-1", "open room-1"]);
});

test("a refused /resume surfaces to the caller rather than reading as success", async () => {
  const { steps } = recorder({
    startTranslation: async () => {
      throw new Error("Only the host can start translation.");
    },
  });
  await assert.rejects(
    startBridgeTranslation({ id: "room-1", status: "in_progress" }, steps),
    /Only the host/,
  );
});
