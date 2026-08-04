import assert from "node:assert/strict";
import test from "node:test";

import {
  completeMeetingJoin,
  readMeetingJoinState,
  readMeetingMediaPreferences,
} from "./meeting-join-state.ts";

function storageWith(values: Record<string, string>): Storage {
  const entries = new Map(Object.entries(values));
  return {
    get length() {
      return entries.size;
    },
    clear: () => entries.clear(),
    getItem: (key) => entries.get(key) ?? null,
    key: (index) => Array.from(entries.keys())[index] ?? null,
    removeItem: (key) => entries.delete(key),
    setItem: (key, value) => entries.set(key, value),
  };
}

test("keeps camera off for the room selected in preview", () => {
  const storage = storageWith({
    "warptalk.join.preview": JSON.stringify({
      roomId: "room-1",
      cameraEnabled: false,
      microphoneEnabled: true,
    }),
    "warptalk.devices.preview": JSON.stringify({
      roomId: "room-1",
      cameraEnabled: false,
      microphoneEnabled: true,
    }),
  });

  assert.deepEqual(readMeetingMediaPreferences(storage, "room-1"), {
    cameraEnabled: false,
    microphoneEnabled: true,
    noiseSuppressionEnabled: false,
    backgroundBlurEnabled: false,
  });
});

test("defaults camera and microphone off for stale, missing, or malformed state", () => {
  const stale = storageWith({
    "warptalk.join.preview": JSON.stringify({
      roomId: "another-room",
      cameraEnabled: true,
      microphoneEnabled: true,
    }),
  });
  const malformed = storageWith({ "warptalk.join.preview": "{" });

  for (const storage of [stale, malformed, storageWith({})]) {
    assert.equal(
      readMeetingMediaPreferences(storage, "room-1").cameraEnabled,
      false,
    );
    assert.equal(
      readMeetingMediaPreferences(storage, "room-1").microphoneEnabled,
      false,
    );
  }
});

test("treats malformed and cross-room join state as untrusted", () => {
  const malformed = storageWith({ "warptalk.join.preview": "{" });
  const stale = storageWith({
    "warptalk.join.preview": JSON.stringify({
      roomId: "another-room",
      displayName: "Wrong meeting",
    }),
  });

  assert.deepEqual(readMeetingJoinState(malformed, "room-1"), {});
  assert.deepEqual(readMeetingJoinState(stale, "room-1"), {});
});

test("persists room-scoped state and starts navigation before closing preview", () => {
  const storage = storageWith({});
  const events: string[] = [];

  completeMeetingJoin({
    storage,
    roomId: "room-1",
    joinState: {
      displayName: "Host",
      roomCode: "abc-defg-hij",
      speakLanguage: "vi",
      listenLanguage: "en",
      cameraEnabled: false,
      microphoneEnabled: true,
      speakerEnabled: true,
    },
    deviceState: {
      cameraEnabled: false,
      microphoneEnabled: true,
      noiseSuppressionEnabled: true,
      noiseSuppressionPreferenceVersion: 3,
      backgroundBlurEnabled: false,
    },
    navigate: (path) => events.push(`navigate:${path}`),
    closePreview: () => events.push("close"),
  });

  assert.deepEqual(events, ["navigate:/room/room-1", "close"]);
  assert.equal(
    JSON.parse(storage.getItem("warptalk.devices.preview") ?? "{}").roomId,
    "room-1",
  );
});
