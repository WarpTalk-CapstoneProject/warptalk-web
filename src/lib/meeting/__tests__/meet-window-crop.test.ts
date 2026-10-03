/**
 * The Google Meet window, cropped to Google Meet (production recording, 03 Oct): the recording
 * showed the whole Chrome window — other tabs' titles, the address bar, the bookmarks bar.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MAX_SHAPE_MISMATCH,
  describeMeetWindowCrop,
  meetWindowVisibleRect,
  nextMeetWindowCropGeometry,
  parseMeetWindowGeometry,
} from "../meet-window-crop.ts";

/** A restored Chrome window, 1286x800 visible, 7 px invisible borders; page below 116 px of chrome. */
const restored = () => ({
  frame: { x: 0, y: 0, width: 1286, height: 800 },
  window: { x: -7, y: 0, width: 1300, height: 807 },
  content: { x: 0, y: 116, width: 1286, height: 684 },
});
const frameOf = (width: number, height: number) => ({ x: 0, y: 0, width, height });

test("a frame of the visible window is cropped to the page, tab strip and bars gone", () => {
  assert.deepEqual(meetWindowVisibleRect(restored(), frameOf(1286, 800)), { x: 0, y: 116, width: 1286, height: 684 });
});

test("a frame that includes the invisible borders is cropped from the window rectangle instead", () => {
  // 1300x807: the GetWindowRect shape. The page spans 7..1293; inward to even: 8..1292.
  assert.deepEqual(meetWindowVisibleRect(restored(), frameOf(1300, 807)), { x: 8, y: 116, width: 1284, height: 684 });
});

test("a scaled-down capture (the 1080p cap) is cropped at the same place, scaled", () => {
  // A 2560x1400 visible window on a high-DPI screen, captured at 1920x1050 (0.75).
  const geometry = {
    frame: { x: 0, y: 0, width: 2560, height: 1400 },
    window: { x: -8, y: 0, width: 2576, height: 1414 },
    content: { x: 0, y: 230, width: 2560, height: 1170 },
  };
  const rect = meetWindowVisibleRect(geometry, frameOf(1920, 1050));
  // 230 * 0.75 = 172.5 -> rounded inward (down the frame) to 174.
  assert.deepEqual(rect, { x: 0, y: 174, width: 1920, height: 876 });
});

test("a maximized window lines up whichever rectangle the frame covers", () => {
  const geometry = {
    frame: { x: 0, y: 0, width: 1920, height: 1032 },
    window: { x: -8, y: -8, width: 1936, height: 1048 },
    content: { x: 0, y: 109, width: 1920, height: 923 },
  };
  assert.deepEqual(meetWindowVisibleRect(geometry, frameOf(1920, 1032)), { x: 0, y: 110, width: 1920, height: 922 });
  assert.deepEqual(meetWindowVisibleRect(geometry, frameOf(1936, 1048)), { x: 8, y: 118, width: 1920, height: 922 });
});

test("edges are always even and rounded inward, so no sliver of the address bar comes back", () => {
  const geometry = { ...restored(), content: { x: 3, y: 117, width: 1279, height: 681 } };
  const rect = meetWindowVisibleRect(geometry, frameOf(1286, 800));
  assert.ok(rect);
  for (const value of [rect.x, rect.y, rect.width, rect.height]) assert.equal(value % 2, 0, JSON.stringify(rect));
  assert.ok(rect.x >= 3 && rect.y >= 117);
  assert.ok(rect.x + rect.width <= 3 + 1279 && rect.y + rect.height <= 117 + 681);
  // An odd offset of the frame's own visible area is honoured, and the crop stays inside it.
  const offset = meetWindowVisibleRect(restored(), { x: 1, y: 1, width: 1286, height: 800 });
  assert.deepEqual(offset, { x: 2, y: 118, width: 1284, height: 682 });
});

test("fullscreen (F11, Meet's full screen): the page is the frame, and there is no crop", () => {
  const geometry = {
    frame: { x: 0, y: 0, width: 1920, height: 1080 },
    window: { x: 0, y: 0, width: 1920, height: 1080 },
    content: { x: 0, y: 0, width: 1920, height: 1080 },
  };
  assert.equal(meetWindowVisibleRect(geometry, frameOf(1920, 1080)), null);
  assert.equal(meetWindowVisibleRect(geometry, frameOf(1280, 720)), null);
});

test("the bookmarks bar toggled moves the crop with it", () => {
  const shown = meetWindowVisibleRect(restored(), frameOf(1286, 800));
  const hidden = meetWindowVisibleRect({ ...restored(), content: { x: 0, y: 86, width: 1286, height: 714 } }, frameOf(1286, 800));
  assert.equal(shown?.y, 116);
  assert.equal(hidden?.y, 86);
});

test("never a crop to something tiny: below the share or pixel floors the frame goes out whole", () => {
  // DevTools docked over most of the window: content only 30% wide.
  assert.equal(
    meetWindowVisibleRect({ ...restored(), content: { x: 0, y: 116, width: 386, height: 684 } }, frameOf(1286, 800)),
    null,
  );
  // Content only a third of the height.
  assert.equal(
    meetWindowVisibleRect({ ...restored(), content: { x: 0, y: 500, width: 1286, height: 300 } }, frameOf(1286, 800)),
    null,
  );
  // A side panel taking 35% still leaves the meeting: cropped.
  assert.ok(meetWindowVisibleRect({ ...restored(), content: { x: 0, y: 116, width: 836, height: 684 } }, frameOf(1286, 800)));
  // A tiny frame cannot clear the pixel floor.
  const small = {
    frame: { x: 0, y: 0, width: 300, height: 200 },
    window: { x: 0, y: 0, width: 300, height: 200 },
    content: { x: 0, y: 90, width: 300, height: 110 },
  };
  assert.equal(meetWindowVisibleRect(small, frameOf(300, 200)), null);
});

test("a frame of another shape than either window rectangle is left alone", () => {
  // e.g. the capture is of a different window than the layout describes.
  assert.equal(meetWindowVisibleRect(restored(), frameOf(800, 800)), null);
  assert.ok(MAX_SHAPE_MISMATCH > 0 && MAX_SHAPE_MISMATCH < 0.05);
});

test("content outside the window it is said to be in is not cropped with", () => {
  assert.equal(
    meetWindowVisibleRect({ ...restored(), content: { x: 0, y: 116, width: 1600, height: 684 } }, frameOf(1286, 800)),
    null,
  );
  assert.equal(
    meetWindowVisibleRect({ ...restored(), content: { x: -50, y: 116, width: 1286, height: 684 } }, frameOf(1286, 800)),
    null,
  );
});

test("no geometry, a malformed one, or a malformed frame: the frame goes out whole (older desktops)", () => {
  for (const geometry of [
    null,
    undefined,
    {},
    "geometry",
    { ...restored(), content: null },
    { ...restored(), frame: { x: 0, y: 0, width: 0, height: 800 } },
    { ...restored(), content: { x: 0, y: Number.NaN, width: 1286, height: 684 } },
    { ...restored(), window: { x: "0", y: 0, width: 1300, height: 807 } },
  ]) {
    assert.equal(meetWindowVisibleRect(geometry, frameOf(1286, 800)), null, JSON.stringify(geometry));
  }
  assert.equal(meetWindowVisibleRect(restored(), frameOf(0, 800)), null);
  assert.equal(meetWindowVisibleRect(restored(), { x: 0, y: 0, width: Number.POSITIVE_INFINITY, height: 800 }), null);
  assert.equal(parseMeetWindowGeometry(null), null);
});

test("the crop layout: the captured window's tab layout only, and sticky through readings without one", () => {
  const g1 = restored();
  const g2 = { ...restored(), content: { x: 0, y: 86, width: 1286, height: 714 } };
  const tab = (windowHandle: number | undefined, windowGeometry: unknown) =>
    ({ via: "tab", windowHandle, windowGeometry }) as Parameters<typeof nextMeetWindowCropGeometry>[1];

  assert.deepEqual(nextMeetWindowCropGeometry(null, tab(2222, g1), 2222), g1);
  // A newer layout of the same window replaces it.
  assert.deepEqual(nextMeetWindowCropGeometry(g1, tab(2222, g2), 2222), g2);
  // Another window's layout (the tab just moved): kept.
  assert.deepEqual(nextMeetWindowCropGeometry(g1, tab(5555, g2), 2222), g1);
  // No layout this time (a read that failed its checks, minimized): kept, never back to uncropped.
  assert.deepEqual(nextMeetWindowCropGeometry(g1, tab(2222, undefined), 2222), g1);
  assert.deepEqual(nextMeetWindowCropGeometry(g1, tab(2222, { frame: 1 }), 2222), g1);
  // PiP, or no surface at all: kept.
  assert.deepEqual(nextMeetWindowCropGeometry(g1, { via: "pip", windowHandle: 3333 }, 2222), g1);
  assert.deepEqual(nextMeetWindowCropGeometry(g1, { via: null }, 2222), g1);
  assert.deepEqual(nextMeetWindowCropGeometry(g1, null, 2222), g1);
  // Either handle unknown: the layout is taken.
  assert.deepEqual(nextMeetWindowCropGeometry(null, tab(undefined, g1), 2222), g1);
  assert.deepEqual(nextMeetWindowCropGeometry(null, tab(2222, g1), null), g1);
});

test("the crop is described for one log line per change", () => {
  assert.equal(describeMeetWindowCrop(null, frameOf(1286, 800)), "uncropped 1286x800");
  assert.equal(describeMeetWindowCrop({ x: 0, y: 116, width: 1286, height: 684 }, frameOf(1286, 800)), "1286x684+0+116 of 1286x800");
});
