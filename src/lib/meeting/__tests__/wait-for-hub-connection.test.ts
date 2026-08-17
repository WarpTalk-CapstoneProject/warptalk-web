import test from "node:test";
import assert from "node:assert/strict";

import { waitForReadyConnection } from "../wait-for-hub-connection.ts";

type FakeHub = { state: string };
const connected: FakeHub = { state: "Connected" };
const isReady = (hub: FakeHub) => hub.state === "Connected";

/** A wait whose sleeps resolve only when the test says so — real time never passes. */
function manualWait() {
  const pending: Array<{ ms: number; release: () => void }> = [];
  return {
    wait: (ms: number) =>
      new Promise<void>((resolve) => pending.push({ ms, release: resolve })),
    /** Release the oldest sleep, running anything queued behind it first. */
    async wake() {
      const next = pending.shift();
      assert.ok(next, "nothing was sleeping");
      next.release();
      await Promise.resolve();
      await Promise.resolve();
    },
    pendingCount: () => pending.length,
  };
}

test("a cancellation that lands during the sleep is honoured — the WT-434 regression", async () => {
  // The production timeline, compressed: the mount-time closure captured the join screen's
  // languages and slept because the hub was not connected yet; ~170ms in, the remembered
  // profile superseded it (cleanup set cancelled); at mount+300ms the closure woke and — with
  // no re-check after the sleep — sent the stale languages over the fresh ones. The row kept
  // speak=en for a Vietnamese speaker, and STT, hinted "en", hallucinated "Hello." over their
  // speech.
  let cancelled = false;
  let connection: FakeHub | null = null; // mount: the hub has not finished its handshake
  const clock = manualWait();

  const result = waitForReadyConnection<FakeHub>({
    getConnection: () => connection,
    isReady,
    isCancelled: () => cancelled,
    wait: clock.wait,
  });

  // While the closure sleeps: the hub connects AND a newer value supersedes this one. By
  // wake-up time the connection is ready — which is exactly why the missing re-check sent.
  connection = connected;
  cancelled = true;
  await clock.wake();

  assert.equal(await result, null, "a closure cancelled during its sleep must not send");
});

test("still sends when nothing was cancelled", async () => {
  let connection: FakeHub | null = null;
  const clock = manualWait();

  const result = waitForReadyConnection<FakeHub>({
    getConnection: () => connection,
    isReady,
    isCancelled: () => false,
    wait: clock.wait,
  });

  // Hub finishes its handshake while the retry sleeps — the case the loop exists for.
  connection = connected;
  await clock.wake();

  assert.equal(await result, connected);
});

test("cancellation before the first attempt sends nothing and never sleeps", async () => {
  const clock = manualWait();

  const result = await waitForReadyConnection<FakeHub>({
    getConnection: () => connected,
    isReady,
    isCancelled: () => true,
    wait: clock.wait,
  });

  assert.equal(result, null);
  assert.equal(clock.pendingCount(), 0);
});

test("gives up quietly when the hub never connects", async () => {
  const clock = manualWait();

  const result = waitForReadyConnection<FakeHub>({
    getConnection: () => null,
    isReady,
    isCancelled: () => false,
    wait: clock.wait,
  });

  await clock.wake(); // 300
  await clock.wake(); // 800
  await clock.wake(); // 1500

  assert.equal(await result, null);
});

test("a connection that exists but is not ready does not count", async () => {
  const handshaking: FakeHub = { state: "Connecting" };
  const clock = manualWait();

  const result = waitForReadyConnection<FakeHub>({
    getConnection: () => handshaking,
    isReady,
    isCancelled: () => false,
    wait: clock.wait,
  });

  await clock.wake();
  await clock.wake();
  await clock.wake();

  assert.equal(await result, null);
});
