import assert from "node:assert/strict";
import test from "node:test";

import {
  availableDeviceIds,
  completeMeetingJoin,
  meetingDeviceRoomOptions,
  readMeetingJoinState,
  readMeetingMediaPreferences,
  rememberBridgeMicrophone,
  rememberSelectedMicrophone,
  rememberSelectedSpeaker,
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
    // WT-631. "" is no preference: the browser's default input, which is what every meeting
    // captured from before the pre-join choice was carried through.
    selectedMicrophoneId: "",
    selectedSpeakerId: "",
  });
});

// ── WT-631: the microphone the participant picked is the one the meeting uses ─────────────────

const JOIN_STATE = {
  displayName: "Host",
  roomCode: "abc-defg-hij",
  speakLanguage: "vi",
  listenLanguage: "en",
  cameraEnabled: false,
  microphoneEnabled: true,
  speakerEnabled: true,
};

const DEVICE_STATE = {
  cameraEnabled: false,
  microphoneEnabled: true,
  noiseSuppressionEnabled: true,
  noiseSuppressionPreferenceVersion: NOISE_SUPPRESSION_PREFERENCE_VERSION,
  backgroundBlurEnabled: false,
};

test("carries the pre-join microphone through to the meeting", () => {
  // The picker's preview has always honoured the choice — the level meter people watch before
  // joining reads from the device they selected. The choice then went nowhere, and the meeting
  // captured from the OS default, which on a laptop with VB-Cable installed is often the loopback
  // carrying every other browser tab.
  const storage = storageWith({});

  completeMeetingJoin({
    storage,
    roomId: "room-1",
    workspaceSlug: "acme",
    joinState: JOIN_STATE,
    deviceState: { ...DEVICE_STATE, selectedMicrophoneId: "headset-abc" },
    navigate: () => undefined,
    closePreview: () => undefined,
  });

  assert.equal(
    readMeetingMediaPreferences(storage, "room-1").selectedMicrophoneId,
    "headset-abc",
  );
  // Not another meeting's. The record is room-scoped like everything else in it.
  assert.equal(
    readMeetingMediaPreferences(storage, "room-2").selectedMicrophoneId,
    "",
  );
});

test("a microphone picked inside the meeting survives a reload, and nothing beside it is lost", () => {
  const storage = storageWith({});
  completeMeetingJoin({
    storage,
    roomId: "room-1",
    workspaceSlug: "acme",
    joinState: JOIN_STATE,
    deviceState: {
      ...DEVICE_STATE,
      noiseSuppressionEnabled: false,
      selectedMicrophoneId: "built-in",
    },
    navigate: () => undefined,
    closePreview: () => undefined,
  });

  rememberSelectedMicrophone(storage, "room-1", "headset-abc");

  const preferences = readMeetingMediaPreferences(storage, "room-1");
  assert.equal(preferences.selectedMicrophoneId, "headset-abc");
  // Merged, not replaced: a one-field record would drop the microphone permission (and fail the
  // meeting closed) and the explicit noise-suppression opt-out.
  assert.equal(preferences.microphoneEnabled, true);
  assert.equal(preferences.noiseSuppressionEnabled, false);
});

test("a pick in this meeting never rewrites an earlier meeting's record", () => {
  // The tab's record still belongs to the last meeting joined through a pre-join screen when the
  // host opened this one straight from Start. Writing into it would change that meeting's
  // preference and still not be read for this one.
  const storage = storageWith({
    "warptalk.devices.preview": JSON.stringify({
      roomId: "earlier-room",
      microphoneEnabled: true,
      selectedMicrophoneId: "built-in",
    }),
  });

  rememberSelectedMicrophone(storage, "room-1", "headset-abc");

  const record = JSON.parse(storage.getItem("warptalk.devices.preview") ?? "{}");
  assert.equal(record.roomId, "room-1");
  assert.equal(record.selectedMicrophoneId, "headset-abc");
  // Nothing of the earlier meeting's permissions carried over into this one.
  assert.equal(record.microphoneEnabled, undefined);
});

test("the device is read even where permissions fail closed, and still publishes nothing", () => {
  // No pre-join record for this room — the host started it straight from the room page — but
  // they picked a microphone from the meeting bar. Which device is not a permission: it cannot
  // turn a microphone on, so honouring it is safe, and dropping it would send their next unmute
  // back to the OS default.
  const storage = storageWith({
    "warptalk.devices.preview": JSON.stringify({
      roomId: "room-1",
      selectedMicrophoneId: "headset-abc",
    }),
  });

  const preferences = readMeetingMediaPreferences(storage, "room-1");
  assert.equal(preferences.selectedMicrophoneId, "headset-abc");
  assert.equal(preferences.microphoneEnabled, false);
  assert.equal(preferences.cameraEnabled, false);
});

const PRESENT = availableDeviceIds([
  { kind: "audioinput", deviceId: "default" },
  { kind: "audioinput", deviceId: "headset-abc" },
  { kind: "audiooutput", deviceId: "default" },
  { kind: "audiooutput", deviceId: "headphones-xyz" },
  { kind: "videoinput", deviceId: "cam-1" },
]);

test("a chosen microphone that is present is pinned, not merely preferred", () => {
  // 3 Oct 2026: `ideal` let the browser hand back the default input while the preview had
  // captured from the chosen one with `exact` — the "falls back to the default device" report.
  assert.deepEqual(
    meetingDeviceRoomOptions({ microphoneId: "headset-abc", speakerId: "" }, PRESENT),
    { audioCaptureDefaults: { deviceId: { exact: "headset-abc" } } },
  );
});

test("a chosen device that has been unplugged is left out, so the default is used", () => {
  // WT-631's case: an exact id for a device that is gone would throw OverconstrainedError and
  // join with no microphone. Checking the device list first keeps that safety without `ideal`.
  assert.equal(
    meetingDeviceRoomOptions({ microphoneId: "gone-headset", speakerId: "gone-speaker" }, PRESENT),
    undefined,
  );
});

test("the chosen speaker becomes the room's audio output", () => {
  assert.deepEqual(
    meetingDeviceRoomOptions({ microphoneId: "headset-abc", speakerId: "headphones-xyz" }, PRESENT),
    {
      audioCaptureDefaults: { deviceId: { exact: "headset-abc" } },
      audioOutput: { deviceId: "headphones-xyz" },
    },
  );
  assert.deepEqual(
    meetingDeviceRoomOptions({ microphoneId: "", speakerId: "headphones-xyz" }, PRESENT),
    { audioOutput: { deviceId: "headphones-xyz" } },
  );
});

test("no choice builds the room exactly as before", () => {
  assert.equal(meetingDeviceRoomOptions({ microphoneId: "", speakerId: "" }, PRESENT), undefined);
});

test("a device of the wrong kind does not count as present", () => {
  // An output id must not satisfy a microphone pick, or the room would be pinned to nothing.
  assert.equal(
    meetingDeviceRoomOptions({ microphoneId: "headphones-xyz", speakerId: "" }, PRESENT),
    undefined,
  );
});

test("a speaker picked in the meeting survives a reload, beside the microphone", () => {
  const storage = storageWith({
    "warptalk.devices.preview": JSON.stringify({
      roomId: "room-1",
      selectedMicrophoneId: "headset-abc",
    }),
  });
  rememberSelectedSpeaker(storage, "room-1", "headphones-xyz");

  const preferences = readMeetingMediaPreferences(storage, "room-1");
  assert.equal(preferences.selectedSpeakerId, "headphones-xyz");
  assert.equal(preferences.selectedMicrophoneId, "headset-abc");
  assert.equal(readMeetingMediaPreferences(storage, "room-2").selectedSpeakerId, "");
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

// ── WT-912: a bridge room has no pre-join screen ─────────────────────────────

test("WT-912 the reported defect: a bridge room opened with no join record has its microphone off", () => {
  // use-bridge-auto-room opens the room straight from the Meet call; nothing was ever written.
  assert.equal(readMeetingMediaPreferences(storageWith({}), "bridge-1").microphoneEnabled, false);
});

test("WT-912: the microphone Meet's button decided is what a reload connects with", () => {
  const storage = storageWith({});
  rememberBridgeMicrophone(storage, "bridge-1", true);
  const preferences = readMeetingMediaPreferences(storage, "bridge-1");
  assert.equal(preferences.microphoneEnabled, true);
  // A bridge publishes no camera, and following Meet's mic must never turn one on.
  assert.equal(preferences.cameraEnabled, false);

  rememberBridgeMicrophone(storage, "bridge-1", false);
  assert.equal(readMeetingMediaPreferences(storage, "bridge-1").microphoneEnabled, false);
});

test("WT-912: the record is for that room only, and keeps the microphone picked in it", () => {
  const storage = storageWith({});
  rememberSelectedMicrophone(storage, "bridge-1", "usb-mic");
  rememberBridgeMicrophone(storage, "bridge-1", true);
  assert.equal(readMeetingMediaPreferences(storage, "bridge-1").selectedMicrophoneId, "usb-mic");
  // Another room in the same window still fails closed.
  assert.equal(readMeetingMediaPreferences(storage, "room-2").microphoneEnabled, false);
});

test("WT-912: an earlier meeting's record is replaced, not merged into", () => {
  const storage = storageWith({
    "warptalk.join.preview": JSON.stringify({ roomId: "room-1", cameraEnabled: true, displayName: "Host" }),
    "warptalk.devices.preview": JSON.stringify({ roomId: "room-1", cameraEnabled: true }),
  });
  rememberBridgeMicrophone(storage, "bridge-1", true);
  assert.deepEqual(readMeetingJoinState(storage, "bridge-1"), {
    roomId: "bridge-1",
    microphoneEnabled: true,
    cameraEnabled: false,
  });
  assert.equal(readMeetingMediaPreferences(storage, "bridge-1").cameraEnabled, false);
});
