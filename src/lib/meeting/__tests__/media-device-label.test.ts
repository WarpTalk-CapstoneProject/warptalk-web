import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { mediaDeviceLabel } from "../media-device-label.ts";

test("a real label is used as-is", () => {
  assert.equal(
    mediaDeviceLabel({ deviceId: "abc", label: "AirPods Pro" }, 0, "audioinput"),
    "AirPods Pro",
  );
});

test("a blank label falls back to a name the user can actually pick from", () => {
  // The browser withholds labels until the page holds a permission for that KIND, so a camera
  // list read before the camera was ever enabled is a list of blanks. Three empty rows are
  // unpickable; the deviceId is a 64-char hash and no better.
  assert.equal(mediaDeviceLabel({ deviceId: "9f3c", label: "" }, 0, "videoinput"), "Camera 1");
  assert.equal(mediaDeviceLabel({ deviceId: "1a2b" }, 2, "audioinput"), "Microphone 3");
  assert.equal(mediaDeviceLabel({ deviceId: "1a2b", label: "   " }, 1, "audiooutput"), "Speaker 2");
});

test("the browser's pseudo-devices are named for what they are", () => {
  // "default" and "communications" carry meaning even with no label, so numbering them would
  // throw away the only thing the row was telling the user.
  assert.equal(
    mediaDeviceLabel({ deviceId: "default", label: "" }, 0, "audioinput"),
    "Default microphone",
  );
  assert.equal(
    mediaDeviceLabel({ deviceId: "communications", label: "" }, 1, "audiooutput"),
    "Communications speaker",
  );
});

test("the picker is wired to both media buttons and is not offered outside LiveKit", () => {
  const bar = fs.readFileSync("src/components/rooms/live/meeting-control-bar.tsx", "utf8");

  const caretCount = bar.split("MediaDeviceMenuButton").length - 1;
  assert.ok(caretCount >= 3, "expected the import plus a caret on each of mic and camera");

  assert.ok(
    bar.includes('kinds={["audioinput", "audiooutput"]}'),
    "the microphone caret must also offer the speaker",
  );
  assert.ok(bar.includes('kinds={["videoinput"]}'), "the camera caret must offer cameras");

  // The fallback branch renders when there is no connected LiveKitRoom. useMediaDeviceSelect
  // switches the device on the live track through that room, so a caret there would be a dead
  // control — the toggles in that branch stay toggle-only on purpose.
  const fallback = bar.slice(
    bar.indexOf("function LiveKitTrackControls"),
    bar.indexOf("function MeetControl"),
  );
  const beforeReturn = fallback.slice(0, fallback.indexOf("<TrackToggle"));
  assert.ok(
    !beforeReturn.includes("MediaDeviceMenuButton"),
    "the no-LiveKit fallback must not render a device picker",
  );
});
