import assert from "node:assert/strict";
import { test } from "node:test";

import {
  INSTANT_MEETING_KEY,
  consumeInstantMeetingStart,
  markInstantMeetingStarted,
} from "../instant-meeting-handoff.ts";

function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    /** Test-only view, so assertions can see what survived. */
    raw: map,
  };
}

test("the host who just started the meeting is the one greeted", () => {
  const storage = fakeStorage();
  markInstantMeetingStarted(storage, "room-1");
  assert.equal(consumeInstantMeetingStart(storage, "room-1"), true);
});

test("the greeting is shown once", () => {
  const storage = fakeStorage();
  markInstantMeetingStarted(storage, "room-1");
  consumeInstantMeetingStart(storage, "room-1");
  // A reload, or React re-reading the same slot, must not resurrect it.
  assert.equal(consumeInstantMeetingStart(storage, "room-1"), false);
});

test("a tab that never started a meeting is not greeted", () => {
  assert.equal(consumeInstantMeetingStart(fakeStorage(), "room-1"), false);
});

test("a mark left over from another room is cleared, not carried", () => {
  // The failure this prevents: the host starts a meeting, navigates elsewhere before it loads,
  // and an hour later opens an unrelated meeting that greets them with the wrong link.
  const storage = fakeStorage();
  markInstantMeetingStarted(storage, "room-1");
  assert.equal(consumeInstantMeetingStart(storage, "room-2"), false);
  assert.equal(storage.raw.has(INSTANT_MEETING_KEY), false);
});
