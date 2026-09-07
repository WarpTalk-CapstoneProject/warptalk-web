import assert from "node:assert/strict";
import test from "node:test";

import {
  completeMeetingJoin,
  readMeetingJoinState,
  readMeetingMediaPreferences,
} from "../meeting-join-state.ts";
import { NOISE_SUPPRESSION_PREFERENCE_VERSION } from "../track-effects-preferences.ts";

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
    // ON, with nothing stored about it. Camera and microphone are permissions and stay fail-closed
    // above; this only describes how an already-permitted microphone is processed, and off is
    // simply a dirtier microphone.
    noiseSuppressionEnabled: true,
    backgroundBlurEnabled: false,
  });
});

test("an opt-out at the current version is honoured; an older one is not a choice", () => {
  // The version is what makes changing the default safe. Most stored `false` values were never a
  // decision — they were the previous default written down — so they must not pin somebody to it
  // forever. A `false` written at the CURRENT version is a real opt-out and survives.
  const optedOut = storageWith({
    "warptalk.join.preview": JSON.stringify({ roomId: "room-1", microphoneEnabled: true }),
    "warptalk.devices.preview": JSON.stringify({
      roomId: "room-1",
      microphoneEnabled: true,
      noiseSuppressionEnabled: false,
      noiseSuppressionPreferenceVersion: NOISE_SUPPRESSION_PREFERENCE_VERSION,
    }),
  });
  assert.equal(
    readMeetingMediaPreferences(optedOut, "room-1").noiseSuppressionEnabled,
    false,
  );

  const staleOff = storageWith({
    "warptalk.join.preview": JSON.stringify({ roomId: "room-1", microphoneEnabled: true }),
    "warptalk.devices.preview": JSON.stringify({
      roomId: "room-1",
      microphoneEnabled: true,
      noiseSuppressionEnabled: false,
      noiseSuppressionPreferenceVersion: NOISE_SUPPRESSION_PREFERENCE_VERSION - 1,
    }),
  });
  assert.equal(
    readMeetingMediaPreferences(staleOff, "room-1").noiseSuppressionEnabled,
    true,
  );
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
    workspaceSlug: "acme",
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

  // The workspace slug rides along: joining used to land on a bare /room/{id} that said
  // nothing about which workspace the meeting belonged to.
  assert.deepEqual(events, ["navigate:/acme/rooms/room-1/live", "close"]);
  assert.equal(
    JSON.parse(storage.getItem("warptalk.devices.preview") ?? "{}").roomId,
    "room-1",
  );
});
